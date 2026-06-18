import type { Request, Response } from "express";

const SERVER_NAME = "poke-vapi-native-voice-mcp";
const DEFAULT_MODEL_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-4.1-nano";
const DEFAULT_VOICE_PROVIDER = "vapi";
const DEFAULT_VOICE_ID = "Clara";
const DEFAULT_VOICE_VERSION = 2;
const DEFAULT_FIRST_MESSAGE = "Hi, this is Poke Voice. How can I help?";
const DEFAULT_SYSTEM_PROMPT =
  "You are a concise, friendly inbound voice assistant for Poke Voice. Answer naturally, ask one question at a time, and help the caller with their request. If you do not know something, say so plainly.";

type VapiInboundMessage = {
  type?: string;
  call?: {
    id?: string;
    phoneNumberId?: string;
    customer?: {
      number?: string;
    };
    [key: string]: unknown;
  };
  phoneNumber?: {
    id?: string;
    number?: string;
  };
  customer?: {
    number?: string;
  };
  [key: string]: unknown;
};

type VapiInboundPayload = {
  message?: VapiInboundMessage;
  [key: string]: unknown;
};

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function configuredVapiApiKey(): string | undefined {
  return env("VAPI_API_KEY") || env("vapi_api_key");
}

function inboundSystemPrompt(): string {
  return env("VAPI_INBOUND_SYSTEM_PROMPT") || DEFAULT_SYSTEM_PROMPT;
}

function inboundFirstMessage(): string {
  return env("VAPI_INBOUND_FIRST_MESSAGE") || DEFAULT_FIRST_MESSAGE;
}

function logInboundEvent(event: Record<string, unknown>): void {
  console.info(
    JSON.stringify({
      service: SERVER_NAME,
      time: new Date().toISOString(),
      ...event
    })
  );
}

function last4(value: unknown): string | undefined {
  return typeof value === "string" && value.length >= 4 ? value.slice(-4) : undefined;
}

function assistantConfig() {
  return {
    name: "Poke Voice Inbound",
    firstMessage: inboundFirstMessage(),
    model: {
      provider: DEFAULT_MODEL_PROVIDER,
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content: inboundSystemPrompt()
        }
      ]
    },
    voice: {
      provider: DEFAULT_VOICE_PROVIDER,
      voiceId: DEFAULT_VOICE_ID,
      version: DEFAULT_VOICE_VERSION
    }
  };
}

function fallbackAssistantResponse(reason: string) {
  return {
    assistant: {
      ...assistantConfig(),
      firstMessage: "Hi, I can help, but some server configuration may need attention.",
      model: {
        provider: DEFAULT_MODEL_PROVIDER,
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content: `${DEFAULT_SYSTEM_PROMPT}\n\nServer note: ${reason}. Keep helping the caller normally and do not mention internal configuration unless asked.`
          }
        ]
      }
    }
  };
}

export function handleVapiInbound(req: Request, res: Response): Response {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const payload = (req.body && typeof req.body === "object" ? req.body : {}) as VapiInboundPayload;
  const message = payload.message ?? {};
  const messageType = message.type;
  const callId = message.call?.id;
  const phoneNumberId = message.call?.phoneNumberId ?? message.phoneNumber?.id;
  const callerLast4 = last4(message.customer?.number ?? message.call?.customer?.number);
  const configuredPhoneNumberId = env("VAPI_PHONE_NUMBER_ID");
  const pokeUserId = env("POKE_USER_ID") || "unknown";

  logInboundEvent({
    action: "vapi_inbound_event",
    messageType: messageType ?? "unknown",
    pokeUserId,
    trackingId: callId ?? null,
    phoneNumberId: phoneNumberId ?? null,
    callerLast4: callerLast4 ?? null
  });

  if (messageType !== "assistant-request") {
    return res.status(204).end();
  }

  try {
    if (!configuredVapiApiKey()) {
      logInboundEvent({
        action: "vapi_inbound_assistant_fallback",
        code: "missing_vapi_api_key",
        pokeUserId,
        trackingId: callId ?? null
      });
      return res.json(fallbackAssistantResponse("VAPI_API_KEY is not configured"));
    }

    if (configuredPhoneNumberId && phoneNumberId && configuredPhoneNumberId !== phoneNumberId) {
      logInboundEvent({
        action: "vapi_inbound_phone_number_mismatch",
        pokeUserId,
        trackingId: callId ?? null,
        expectedPhoneNumberId: configuredPhoneNumberId,
        receivedPhoneNumberId: phoneNumberId
      });
    }

    return res.json({
      assistant: assistantConfig()
    });
  } catch (error) {
    logInboundEvent({
      action: "vapi_inbound_assistant_fallback",
      code: "unexpected_error",
      message: error instanceof Error ? error.message : "Unknown inbound handler error.",
      pokeUserId,
      trackingId: callId ?? null
    });

    return res.json(fallbackAssistantResponse("unexpected inbound handler error"));
  }
}

export function manualAssistantConfigSnippet() {
  return assistantConfig();
}
