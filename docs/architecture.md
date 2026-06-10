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

The server creates a new MCP server and Streamable HTTP transport for each HTTP request. It does not keep session state between requests.

## Runtime Configuration

Primary call configuration is passed through tool arguments:

- `phoneNumber`
- `systemPrompt`
- `initialMessage`
- `vapiApiKey`
- `vapiPhoneNumberId`

The server also supports request-header fallback for hosted Poke integrations:

- `x-vapi-api-key`
- `x-vapi-phone-number-id`
- `x-poke-user-id`

Local development can use environment variables only when no credential headers are present:

- `VAPI_API_KEY`
- `VAPI_PHONE_NUMBER_ID`
- `POKE_USER_ID`

This precedence prevents a shared hosted deployment from accidentally mixing installer-provided headers with the host's private environment secrets.

## Vapi Payload

The outbound request uses Vapi native telephony:

```json
{
  "phoneNumberId": "installer-phone-number-id",
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

- Missing configuration.
- Invalid E.164 numbers.
- Vapi authentication failures.
- Vapi request validation failures.
- Unexpected provider errors.

The response preserves the Vapi tracking ID when available and uses stable error codes for automation.

## Non-Goals

This server does not:

- Store credentials.
- Manage phone-number provisioning.
- Implement call consent workflows.
- Replace Vapi or carrier compliance controls.
- Run a campaign dialer or call queue.
