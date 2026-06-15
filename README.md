# Poke Voice MCP Server

A stateless TypeScript Model Context Protocol server that lets Poke trigger outbound AI phone calls through Vapi native telephony.

The server is designed for Poke Recipes: every installer supplies their own Vapi credentials, Poke passes those credentials at call time, and the backend uses them only for the current request. No API keys are hardcoded, stored, logged, or returned.

## Highlights

- Streamable HTTP MCP endpoint for web-hosted agents.
- One tool: `trigger_outbound_call`.
- Vapi-native outbound calls through `POST https://api.vapi.ai/call`.
- Low-cost default model: `openai/gpt-4.1-nano`.
- Realistic default voice: Vapi `Clara`, version `2`.
- Optional `vapiApiKey` and `vapiPhoneNumberId` tool arguments for Poke environments that do not forward setup prompts as headers.
- Sanitized structured logs with tracking IDs, user IDs, status, and destination last four digits only.
- Vercel-ready serverless entrypoint.

## Architecture

```text
Poke
  -> Streamable HTTP MCP request
  -> /api/mcp on Vercel
  -> MCP tool handler
  -> Vapi /call
  -> outbound phone call
```

The backend is stateless. Each MCP request contains the credentials and call configuration required to execute that single call.

See [docs/architecture.md](docs/architecture.md) for the security model and request flow.

## Tool Contract

`trigger_outbound_call`

```json
{
  "phoneNumber": "+15551234567",
  "systemPrompt": "You are calling to confirm an appointment. Be concise and polite.",
  "initialMessage": "Hi, this is the appointment assistant calling to confirm your visit.",
  "vapiApiKey": "vapi_...",
  "vapiPhoneNumberId": "..."
}
```

Required fields:

- `phoneNumber`: destination number in E.164 format.
- `systemPrompt`: assistant instructions for the call.

Optional fields:

- `initialMessage`: first spoken message from the assistant.
- `vapiApiKey`: Vapi API key for the installer making the call. Falls back to `x-vapi-api-key` or `VAPI_API_KEY`.
- `vapiPhoneNumberId`: Vapi phone number ID to use as the outbound caller. Falls back to `x-vapi-phone-number-id` or `VAPI_PHONE_NUMBER_ID`.

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

## Local Development

Requirements:

- Node.js 20+
- Vapi API key
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
```

For local-only testing, the server can fall back to environment variables when no credential headers are present:

```bash
cp .env.example .env
```

```bash
VAPI_API_KEY=your_vapi_api_key
VAPI_PHONE_NUMBER_ID=your_vapi_phone_number_id
POKE_USER_ID=local-dev-user
```

Do not use Vercel environment variables for a shared public Recipe unless you are intentionally running a private instance. Public Recipes should use installer-owned credentials passed by Poke.

## Vercel Deployment

This repo includes:

- `api/index.ts`: Vercel serverless adapter.
- `vercel.json`: rewrites for `/api/mcp`, `/mcp`, `/health`, and the Vapi webhook.

Deploy:

```bash
vercel
vercel --prod
```

After deployment, your MCP endpoint is:

```text
https://your-vercel-domain.vercel.app/api/mcp
```

Update `poke.recipe.yaml` with your deployed endpoint before publishing the Recipe.

## Poke Recipe

The included [poke.recipe.yaml](poke.recipe.yaml) is a template for Poke Kitchen. It declares:

- Streamable HTTP transport.
- Setup prompts for a Vapi API key and Vapi phone number ID.
- A confirmation prompt before `trigger_outbound_call` runs.
- Billing and compliance warnings.

Poke should also pass `x-poke-user-id` on requests. The server uses that only for sanitized tracking logs.

## Testing

See [docs/testing.md](docs/testing.md) for MCP smoke tests, live `tools/list` checks, and safe failure-mode tests.

At minimum, run:

```bash
npm run build
```

Then verify `tools/list` includes `vapiApiKey` and `vapiPhoneNumberId`; Poke will strip unregistered arguments if they are missing from the schema.

## Compliance

This software can initiate real outbound phone calls. You are responsible for consent, TCPA compliance, local calling laws, Vapi billing, and any platform-specific usage rules.

The project intentionally does not bypass confirmation prompts, rate limits, provider compliance controls, or phone-number ownership requirements.

## License

MIT
