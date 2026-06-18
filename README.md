# Poke Voice MCP Server

A stateless TypeScript Model Context Protocol server that lets Poke trigger outbound AI phone calls through Vapi native telephony.

This version is designed for a server-managed Vapi setup: the deployed backend owns the Vapi credentials through environment variables, and Poke clients only provide the call target and assistant instructions.

## Highlights

- Streamable HTTP MCP endpoint for web-hosted agents.
- One tool: `trigger_outbound_call`.
- Vapi-native outbound calls through `POST https://api.vapi.ai/call`.
- Server-side Vapi credentials only; no API keys in the MCP tool schema.
- Low-cost default model: `openai/gpt-4.1-nano`.
- Realistic default voice: Vapi `Clara`, version `2`.
- Sanitized structured logs with tracking IDs, user IDs, status, and destination last four digits only.
- Vercel-ready serverless entrypoint.

## Architecture

```text
Poke
  -> Streamable HTTP MCP request
  -> /api/mcp on Vercel
  -> MCP tool handler
  -> Vapi /call using server env vars
  -> outbound phone call
```

The backend is stateless per request, but Vapi credentials are deployment-level configuration.

See [docs/architecture.md](docs/architecture.md) for the security model and request flow.

## Tool Contract

`trigger_outbound_call`

```json
{
  "phoneNumber": "+15551234567",
  "systemPrompt": "You are calling to confirm an appointment. Be concise and polite.",
  "initialMessage": "Hi, this is the appointment assistant calling to confirm your visit."
}
```

Required fields:

- `phoneNumber`: destination number in E.164 format.
- `systemPrompt`: assistant instructions for the call.

Optional field:

- `initialMessage`: first spoken message from the assistant.

Successful calls return structured JSON:

```json
{
  "ok": true,
  "status": "created",
  "trackingId": "call-id-from-vapi",
  "provider": "vapi",
  "message": "Outbound call initiated."
}
```

Errors return `ok: false` with a stable error code, including:

- `missing_configuration`
- `invalid_phone_number`
- `authentication_failed`
- `invalid_call_request`
- `vapi_request_failed`

## Required Environment Variables

```bash
VAPI_API_KEY=your_private_server_side_vapi_key
VAPI_PHONE_NUMBER_ID=your_vapi_phone_number_id
POKE_USER_ID=local-dev-user
```

`POKE_USER_ID` is a fallback for local development. In production, Poke can provide `x-poke-user-id`; the server uses it only for sanitized tracking logs.

## Local Development

Requirements:

- Node.js 20+
- Private/server-side Vapi API key
- Vapi phone number ID

Install and build:

```bash
npm install
npm run build
```

Run the HTTP server:

```bash
npm run dev
```

Local endpoints:

```text
GET  http://localhost:3000/health
POST http://localhost:3000/api/mcp
POST http://localhost:3000/api/vapi-webhook
POST http://localhost:3000/api/vapi-inbound
```

For local testing:

```bash
cp .env.example .env
```

Never commit `.env` or paste Vapi keys into recipe YAML, prompts, screenshots, logs, or chat messages.

## Vercel Deployment

This repo includes:

- `api/index.ts`: Vercel serverless adapter.
- `api/vapi-inbound.ts`: Vapi inbound assistant-request handler.
- `vercel.json`: rewrites for `/api/mcp`, `/mcp`, `/health`, the Vapi webhook, and inbound call handler.

Add production environment variables:

```bash
npx vercel env add VAPI_API_KEY production
npx vercel env add VAPI_PHONE_NUMBER_ID production
npx vercel env add POKE_USER_ID production
npx vercel env add VAPI_INBOUND_SYSTEM_PROMPT production
npx vercel env add VAPI_INBOUND_FIRST_MESSAGE production
```

Deploy:

```bash
npx vercel --prod --yes
```

After deployment, your MCP endpoint is:

```text
https://your-vercel-domain.vercel.app/api/mcp
```

Update `poke.recipe.yaml` with your deployed endpoint before publishing the Recipe.

## Inbound Vapi Calls

Inbound calls are handled by:

```text
https://your-vercel-domain.vercel.app/api/vapi-inbound
```

For the current production deployment:

```text
https://poke-voice-rho.vercel.app/api/vapi-inbound
```

Configure this URL as the Vapi phone number Server URL for:

```text
+13267327987
6aa3552e-1802-46f5-ba58-1a8f1d66b62d
```

When Vapi sends an `assistant-request`, the route returns a transient assistant using:

- `openai/gpt-4.1-nano`
- Vapi voice `Clara`, version `2`
- `VAPI_INBOUND_SYSTEM_PROMPT` if configured
- `VAPI_INBOUND_FIRST_MESSAGE` if configured

Manual assistant fallback JSON:

```json
{
  "firstMessage": "Hi, this is Poke Voice. How can I help?",
  "model": {
    "provider": "openai",
    "model": "gpt-4.1-nano",
    "messages": [
      {
        "role": "system",
        "content": "You are a concise, friendly inbound voice assistant for Poke Voice. Answer naturally, ask one question at a time, and help the caller with their request. If you do not know something, say so plainly."
      }
    ]
  },
  "voice": {
    "provider": "vapi",
    "voiceId": "Clara",
    "version": 2
  }
}

## Poke Recipe

The included [poke.recipe.yaml](poke.recipe.yaml) is a template for Poke Kitchen. It declares:

- Streamable HTTP transport.
- No credential setup prompts.
- A confirmation prompt before `trigger_outbound_call` runs.
- Billing and compliance warnings.

Because credentials are server-side, calls bill to the Vapi account configured on the deployment.

## Testing

See [docs/testing.md](docs/testing.md) for MCP smoke tests, live `tools/list` checks, and safe failure-mode tests.

At minimum, run:

```bash
npm run build
```

Then verify `tools/list` exposes only call inputs:

- `phoneNumber`
- `systemPrompt`
- `initialMessage`

## Compliance

This software can initiate real outbound phone calls. You are responsible for consent, TCPA compliance, local calling laws, Vapi billing, and any platform-specific usage rules.

The project intentionally does not bypass confirmation prompts, rate limits, provider compliance controls, or phone-number ownership requirements.

## License

MIT
