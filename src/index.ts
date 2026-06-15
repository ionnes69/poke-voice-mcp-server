#!/usr/bin/env node

import express, { type Request, type Response } from "express";
import type { IncomingHttpHeaders } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const SERVER_NAME = "poke-vapi-native-voice-mcp";
const SERVER_VERSION = "1.0.0";
const VAPI_CALL_URL = "https://api.vapi.ai/call";
const E164_PATTERN = /^\+[1-9]\d{1,14}$/;
const DEFAULT_MODEL_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-4.1-nano";
const DEFAULT_VOICE_PROVIDER = "vapi";
const DEFAULT_VOICE_ID = "Clara";
const DEFAULT_VOICE_VERSION = 2;
const DEFAULT_INITIAL_MESSAGE = "Hi, this is your AI assistant calling from Poke.";

type RequestConfig = {
  vapiApiKey: string;
  vapiPhoneNumberId: string;
  pokeUserId: string;
  credentialSources: {
    vapiApiKey: CredentialSource;
    vapiPhoneNumberId: CredentialSource;
    pokeUserId: CredentialSource;
  };
};

type CredentialSource = "argument" | "header" | "env" | "missing";

type ToolResponse = {
  ok: boolean;
  status: string;
  trackingId: string | null;
  provider: "vapi";
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type VapiCallResponse = {
  id?: string;
  status?: string;
  endedReason?: string;
  [key: string]: unknown;
};

class ToolHandledError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

function readHeader(headers: IncomingHttpHeaders | undefined, name: string): string | undefined {
  const value = headers?.[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return value?.trim();
}

function hasVapiCredentialHeaders(headers: IncomingHttpHeaders | undefined): boolean {
  return Boolean(
    readHeader(headers, "x-vapi-api-key") ||
      readHeader(headers, "x-vapi-phone-number-id")
  );
}

function readSecret(
  headers: IncomingHttpHeaders | undefined,
  headerName: string,
  envName: string
): { value?: string; source: CredentialSource } {
  const headerValue = readHeader(headers, headerName);
  if (headerValue) {
    return { value: headerValue, source: "header" };
  }

  // Local/private deployment fallback only. If Poke sent Vapi credential
  // headers, never mix in process.env values from the shared host.
  if (hasVapiCredentialHeaders(headers)) {
    return { source: "missing" };
  }

  const envValue = process.env[envName]?.trim();
  return envValue ? { value: envValue, source: "env" } : { source: "missing" };
}

function readRequestConfig(
  headers?: IncomingHttpHeaders,
  vapiApiKeyArg?: string,
  vapiPhoneNumberIdArg?: string
): RequestConfig {
  const headerOrEnvVapiApiKey = readSecret(headers, "x-vapi-api-key", "VAPI_API_KEY");
  const headerOrEnvVapiPhoneNumberId = readSecret(headers, "x-vapi-phone-number-id", "VAPI_PHONE_NUMBER_ID");
  const headerOrEnvPokeUserId = readSecret(headers, "x-poke-user-id", "POKE_USER_ID");
  const trimmedVapiApiKeyArg = vapiApiKeyArg?.trim();
  const trimmedVapiPhoneNumberIdArg = vapiPhoneNumberIdArg?.trim();

  const vapiApiKey = trimmedVapiApiKeyArg || headerOrEnvVapiApiKey.value;
  const vapiPhoneNumberId = trimmedVapiPhoneNumberIdArg || headerOrEnvVapiPhoneNumberId.value;
  const pokeUserId = headerOrEnvPokeUserId.value;
  const credentialSources = {
    vapiApiKey: trimmedVapiApiKeyArg ? "argument" : headerOrEnvVapiApiKey.source,
    vapiPhoneNumberId: trimmedVapiPhoneNumberIdArg ? "argument" : headerOrEnvVapiPhoneNumberId.source,
    pokeUserId: headerOrEnvPokeUserId.source
  } satisfies RequestConfig["credentialSources"];

  const missing = [
    !vapiApiKey ? "x-vapi-api-key" : undefined,
    !vapiPhoneNumberId ? "x-vapi-phone-number-id" : undefined,
    !pokeUserId ? "x-poke-user-id" : undefined
  ].filter((key): key is string => Boolean(key));

  if (missing.length > 0) {
    throw new ToolHandledError(
      "missing_configuration",
      `Missing required Vapi configuration. Pass vapiApiKey and vapiPhoneNumberId as tool arguments or provide x-vapi-api-key and x-vapi-phone-number-id. Missing: ${missing.join(", ")}`
    );
  }

  return {
    vapiApiKey: vapiApiKey!,
    vapiPhoneNumberId: vapiPhoneNumberId!,
    pokeUserId: pokeUserId!,
    credentialSources
  };
}

function headersFromExtra(
  extraHeaders: Record<string, string | string[] | undefined> | undefined,
  fallbackHeaders: IncomingHttpHeaders | undefined
): IncomingHttpHeaders | undefined {
  return (extraHeaders as IncomingHttpHeaders | undefined) ?? fallbackHeaders;
}

function jsonToolResult(response: ToolResponse, isError = false) {
  return {
    isError,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(response, null, 2)
      }
    ],
    structuredContent: response
  };
}

function logTrackingEvent(event: Record<string, unknown>): void {
  console.info(
    JSON.stringify({
      service: SERVER_NAME,
      time: new Date().toISOString(),
      ...event
    })
  );
}

async function parseVapiError(response: globalThis.Response): Promise<ToolHandledError> {
  let details: unknown;
  let message = response.statusText || "Vapi request failed.";
  const rawBody = await response.text().catch(() => "");

  try {
    details = rawBody ? JSON.parse(rawBody) : undefined;
    if (details && typeof details === "object") {
      const maybeMessage =
        "message" in details && typeof details.message === "string"
          ? details.message
          : "error" in details && typeof details.error === "string"
            ? details.error
            : undefined;
      if (maybeMessage) {
        message = maybeMessage;
      }
    }
  } catch {
    details = rawBody || undefined;
    if (rawBody) {
      message = rawBody;
    }
  }

  if (response.status === 401 || response.status === 403) {
    return new ToolHandledError(
      "authentication_failed",
      "Vapi rejected x-vapi-api-key.",
      details
    );
  }

  if (response.status === 400 || response.status === 422) {
    return new ToolHandledError(
      "invalid_call_request",
      `Vapi rejected the call request: ${message}`,
      details
    );
  }

  return new ToolHandledError(
    "vapi_request_failed",
    `Vapi request failed with HTTP ${response.status}: ${message}`,
    details
  );
}

async function triggerOutboundCall(
  phoneNumber: string,
  systemPrompt: string,
  initialMessage: string | undefined,
  vapiApiKey: string | undefined,
  vapiPhoneNumberId: string | undefined,
  requestHeaders?: IncomingHttpHeaders
): Promise<ToolResponse> {
  if (!E164_PATTERN.test(phoneNumber)) {
    throw new ToolHandledError(
      "invalid_phone_number",
      "phoneNumber must be in E.164 format, for example +15551234567."
    );
  }

  const config = readRequestConfig(requestHeaders, vapiApiKey, vapiPhoneNumberId);
  const resolvedInitialMessage = initialMessage?.trim() || DEFAULT_INITIAL_MESSAGE;

  const payload = {
    phoneNumberId: config.vapiPhoneNumberId,
    assistant: {
      model: {
        provider: DEFAULT_MODEL_PROVIDER,
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt
          }
        ]
      },
      voice: {
        provider: DEFAULT_VOICE_PROVIDER,
        voiceId: DEFAULT_VOICE_ID,
        version: DEFAULT_VOICE_VERSION
      },
      firstMessage: resolvedInitialMessage
    },
    customer: {
      number: phoneNumber
    }
  };

  const response = await fetch(VAPI_CALL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.vapiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await parseVapiError(response);
  }

  const call = (await response.json()) as VapiCallResponse;
  const trackingId = call.id ?? null;

  logTrackingEvent({
    action: "trigger_outbound_call",
    pokeUserId: config.pokeUserId,
    trackingId,
    status: call.status ?? "created",
    destinationLast4: phoneNumber.slice(-4),
    credentialSources: config.credentialSources
  });

  return {
    ok: true,
    status: call.status ?? "created",
    trackingId,
    provider: "vapi",
    message: "Outbound call initiated."
  };
}

function createServer(fallbackRequestHeaders?: IncomingHttpHeaders): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  server.registerTool(
    "trigger_outbound_call",
    {
      title: "Trigger Outbound Call",
      description:
        "Initiates an outbound AI phone call through Vapi native telephony. Requires confirmation before execution.",
      inputSchema: {
        phoneNumber: z
          .string()
          .min(1)
          .describe("Target phone number in E.164 format."),
        systemPrompt: z
          .string()
          .min(1)
          .max(12000)
          .describe("System prompt controlling the Vapi assistant."),
        initialMessage: z
          .string()
          .min(1)
          .max(1000)
          .optional()
          .describe("Optional first message spoken by the assistant."),
        vapiApiKey: z
          .string()
          .min(1)
          .optional()
          .describe("Optional Vapi API key for this outbound call. Falls back to x-vapi-api-key or VAPI_API_KEY."),
        vapiPhoneNumberId: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Optional Vapi phone number ID to use as the outbound caller. Falls back to x-vapi-phone-number-id or VAPI_PHONE_NUMBER_ID."
          )
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async ({ phoneNumber, systemPrompt, initialMessage, vapiApiKey, vapiPhoneNumberId }, extra) => {
      const requestHeaders = headersFromExtra(extra.requestInfo?.headers, fallbackRequestHeaders);
      try {
        return jsonToolResult(
          await triggerOutboundCall(phoneNumber, systemPrompt, initialMessage, vapiApiKey, vapiPhoneNumberId, requestHeaders)
        );
      } catch (error) {
        const handled =
          error instanceof ToolHandledError
            ? error
            : new ToolHandledError(
                "unexpected_error",
                error instanceof Error ? error.message : "Unexpected error while triggering outbound call."
              );

        logTrackingEvent({
          action: "trigger_outbound_call_error",
          pokeUserId: readHeader(requestHeaders, "x-poke-user-id") ?? "unknown",
          code: handled.code,
          destinationLast4: phoneNumber.slice(-4),
          hasVapiCredentialHeaders: hasVapiCredentialHeaders(requestHeaders)
        });

        return jsonToolResult(
          {
            ok: false,
            status: "error",
            trackingId: null,
            provider: "vapi",
            error: {
              code: handled.code,
              message: handled.message,
              details: handled.details
            }
          },
          true
        );
      }
    }
  );

  return server;
}

async function startStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function createApp(): express.Express {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get(["/", "/api"], (_req, res) => {
    res.json({
      ok: true,
      name: SERVER_NAME,
      endpoint: "/api/mcp",
      transport: "streamable_http"
    });
  });

  app.get(["/favicon.ico", "/favicon.png"], (_req, res) => {
    res.status(204).end();
  });

  app.get(["/health", "/api/health"], (_req, res) => {
    res.json({
      ok: true,
      name: SERVER_NAME,
      version: SERVER_VERSION,
      transport: "streamable_http",
      model: {
        provider: DEFAULT_MODEL_PROVIDER,
        model: DEFAULT_MODEL
      },
      voice: {
        provider: DEFAULT_VOICE_PROVIDER,
        voiceId: DEFAULT_VOICE_ID,
        version: DEFAULT_VOICE_VERSION
      }
    });
  });

  const handleMcpPost = async (req: Request, res: Response) => {
    const server = createServer(req.headers);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        });
      }
    } finally {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  };

  app.post(["/api/mcp", "/mcp"], handleMcpPost);

  app.post("/api/vapi-webhook", (req: Request, res: Response) => {
    const pokeUserId = readHeader(req.headers, "x-poke-user-id");
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const callId = typeof body.call?.id === "string" ? body.call.id : undefined;
    const eventType =
      typeof body.message?.type === "string"
        ? body.message.type
        : typeof body.type === "string"
          ? body.type
          : "unknown";

    logTrackingEvent({
      action: "vapi_webhook",
      pokeUserId: pokeUserId ?? "unknown",
      trackingId: callId ?? null,
      eventType
    });

    res.json({ ok: true });
  });

  app.all(["/api/mcp", "/mcp"], (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    });
  });

  app.all("/api/vapi-webhook", (_req, res) => {
    res.status(405).json({ ok: false, error: "Method not allowed." });
  });

  return app;
}

async function startHttp(): Promise<void> {
  const app = createApp();
  const port = Number(process.env.PORT ?? 3000);

  app.listen(port, () => {
    console.log(`${SERVER_NAME} listening on http://localhost:${port}/api/mcp`);
  });
}

if (process.env.VERCEL !== "1" && process.env.MCP_SERVER_NO_AUTO_START !== "1") {
  if (process.env.MCP_TRANSPORT === "stdio") {
    await startStdio();
  } else {
    await startHttp();
  }
}
