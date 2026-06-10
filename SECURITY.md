# Security

This project handles credentials that can initiate paid outbound voice calls.

## Supported Model

Poke Voice is designed for bring-your-own-credentials deployments:

- Installers provide their own Vapi API key.
- Installers provide their own Vapi phone number ID.
- Credentials are passed per request and are not stored by the server.

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
