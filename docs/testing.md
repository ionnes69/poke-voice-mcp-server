# Testing

These checks verify the MCP plumbing without placing a real phone call unless explicitly noted.

## Build

```bash
npm install
npm run build
```

## Run Locally

Configure local environment variables first:

```bash
cp .env.example .env
```

Then run:

```bash
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

Expected response includes:

- `transport: "streamable_http"`
- `model.model: "gpt-4.1-nano"`
- `voice.voiceId: "Clara"`

## Verify MCP Tool Schema

```bash
curl -s http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }' | jq
```

The `trigger_outbound_call` schema should expose only call inputs:

- `phoneNumber`
- `systemPrompt`
- `initialMessage`

The schema should not expose:

- `vapiApiKey`
- `vapiPhoneNumberId`
- Vapi credential headers

## Safe Validation Failure

This confirms local validation works without hitting Vapi:

```bash
curl -s http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'x-poke-user-id: local-test-user' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "trigger_outbound_call",
      "arguments": {
        "phoneNumber": "5551234567",
        "systemPrompt": "Say hello."
      }
    }
  }' | jq
```

Expected error code:

```text
invalid_phone_number
```

## Missing Configuration Failure

Run without `VAPI_API_KEY` or `VAPI_PHONE_NUMBER_ID` to confirm deployment configuration errors are cleanly reported:

```bash
curl -s http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'x-poke-user-id: local-test-user' \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "trigger_outbound_call",
      "arguments": {
        "phoneNumber": "+15551234567",
        "systemPrompt": "Say hello."
      }
    }
  }' | jq
```

Expected error code:

```text
missing_configuration
```

## Real Call Test

Only run this after confirming:

- The destination number is yours or you have consent.
- `VAPI_API_KEY` is a valid private/server-side key.
- `VAPI_PHONE_NUMBER_ID` belongs to that Vapi account.
- Poke or the caller has shown a confirmation prompt.

Use a short prompt and your own phone number for the first test call.
