# Testing

These checks verify the MCP plumbing without placing a real phone call unless explicitly noted.

## Build

```bash
npm install
npm run build
```

## Run Locally

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
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }' | jq
```

The `trigger_outbound_call` schema must include:

- `phoneNumber`
- `systemPrompt`
- `initialMessage`
- `vapiApiKey`
- `vapiPhoneNumberId`

`vapiApiKey` and `vapiPhoneNumberId` should be present in the schema so Poke can pass them through as tool arguments when setup prompt values are not forwarded as HTTP headers. They are optional in the schema so private deployments can fall back to Vercel environment variables.

## Safe Validation Failure

This confirms local validation works without hitting Vapi:

```bash
curl -s http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  -H 'x-poke-user-id: local-test-user' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "trigger_outbound_call",
      "arguments": {
        "phoneNumber": "5551234567",
        "systemPrompt": "Say hello.",
        "vapiApiKey": "not-a-real-key",
        "vapiPhoneNumberId": "not-a-real-number-id"
      }
    }
  }' | jq
```

Expected error code:

```text
invalid_phone_number
```

## Live Auth Failure

This reaches Vapi with fake credentials but should not place a call:

```bash
curl -s http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  -H 'x-poke-user-id: local-test-user' \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "trigger_outbound_call",
      "arguments": {
        "phoneNumber": "+15551234567",
        "systemPrompt": "Say hello.",
        "vapiApiKey": "not-a-real-key",
        "vapiPhoneNumberId": "not-a-real-number-id"
      }
    }
  }' | jq
```

Expected error code:

```text
authentication_failed
```

## Real Call Test

Only run this after confirming:

- The destination number is yours or you have consent.
- The Vapi API key is valid.
- The Vapi phone number ID belongs to that account.
- Poke or the caller has shown a confirmation prompt.

Use a short prompt and your own phone number for the first test call.
