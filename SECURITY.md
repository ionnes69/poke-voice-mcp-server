# Security

This project handles credentials that can initiate paid outbound voice calls.

## Supported Model

Poke Voice is designed for server-managed Vapi deployments:

- The deployed backend reads `VAPI_API_KEY` and `VAPI_PHONE_NUMBER_ID` from environment variables.
- MCP clients do not provide Vapi credentials in tool arguments.
- The server does not read Vapi credentials from request headers.

## Reporting Issues

If you find a vulnerability, do not open a public issue with secrets, account IDs, phone numbers, or exploit details.

Contact the maintainer privately with:

- A short description of the issue.
- Steps to reproduce.
- The affected route or tool.
- Whether the issue can expose credentials, place calls, or leak phone numbers.

## Secret Handling Rules

The server should never log or return:

- Vapi API keys.
- Full phone numbers.
- Assistant prompts.
- Raw request headers.

If you add logging, keep it structured and sanitized.
