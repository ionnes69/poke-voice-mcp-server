# Architecture

Poke Voice is a stateless MCP server for starting outbound Vapi calls from Poke.

## Request Flow

```text
Poke user action
  -> Poke confirmation prompt
  -> Streamable HTTP JSON-RPC request
  -> POST /api/mcp
  -> trigger_outbound_call
  -> POST https://api.vapi.ai/call
  -> Vapi starts outbound call
```

The server creates a new MCP server and Streamable HTTP transport for each HTTP request. It does not keep MCP session state between requests.

Inbound Vapi calls use a separate Server URL flow:

```text
Caller dials +13267327987
  -> Vapi receives inbound call
  -> POST /api/vapi-inbound with message.type = "assistant-request"
  -> server returns transient assistant config
  -> caller speaks with the assistant
```

## Runtime Configuration

Client-provided tool arguments:

- `phoneNumber`
- `systemPrompt`
- `initialMessage`

Deployment-level environment variables:

- `VAPI_API_KEY`
- `VAPI_PHONE_NUMBER_ID`
- `POKE_USER_ID`

Production requests may also include `x-poke-user-id` for sanitized tracking. The server does not read Vapi API keys or Vapi phone number IDs from client headers or tool arguments.

Inbound assistant text can be customized with:

- `VAPI_INBOUND_FIRST_MESSAGE`
- `VAPI_INBOUND_SYSTEM_PROMPT`

## Vapi Payload

The outbound request uses Vapi native telephony:

```json
{
  "phoneNumberId": "server-configured-phone-number-id",
  "assistant": {
    "model": {
      "provider": "openai",
      "model": "gpt-4.1-nano",
      "messages": [
        {
          "role": "system",
          "content": "tool-provided system prompt"
        }
      ]
    },
    "voice": {
      "provider": "vapi",
      "voiceId": "Clara",
      "version": 2
    },
    "firstMessage": "tool-provided or default initial message"
  },
  "customer": {
    "number": "+15551234567"
  }
}
```

## Security Model

The server never logs or returns:

- Vapi API keys.
- Full phone numbers.
- Assistant prompts.
- Raw request headers.

Sanitized logs include:

- Service name.
- Timestamp.
- Action.
- Poke user ID.
- Vapi tracking ID.
- Provider status.
- Destination last four digits.

## Error Handling

The tool returns structured MCP content for expected failures:

- Missing server configuration.
- Invalid E.164 numbers.
- Vapi authentication failures.
- Vapi request validation failures.
- Unexpected provider errors.

The response preserves the Vapi tracking ID when available and uses stable error codes for automation.

## Non-Goals

This server does not:

- Accept Vapi credentials from clients.
- Manage phone-number provisioning.
- Implement call consent workflows.
- Replace Vapi or carrier compliance controls.
- Run a campaign dialer or call queue.
