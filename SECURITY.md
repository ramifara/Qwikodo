# Security policy

## Supported versions

Until Qwikodo reaches 1.0, security fixes are made on the latest `0.x` release line only.

## Report a vulnerability

Do not include vulnerability details, malicious payloads, or private barcode contents in a public
issue.

Use GitHub's **Report a vulnerability** form in the repository's Security tab. If private
vulnerability reporting is not enabled yet, open a public issue asking the maintainer to contact
you, without describing the vulnerability itself.

Include the affected version and operating system, impact, minimal reproduction steps, and any
suggested mitigation. You should receive an acknowledgement within seven days. Please allow time
for a fix and coordinated release before publishing details.

## Security model

Qwikodo treats decoded data as untrusted text. It never evaluates a payload or opens one
automatically. Only `http`, `https`, `mailto`, and `tel` links can be handed to another application,
and only after a user clicks **Open link**.

The application intentionally has no updater, HTTP client, shell permission, general filesystem
permission, telemetry, or account system. Camera and screen access are controlled by the operating
system. Scan history is local application data and may contain sensitive content, so reports and
screenshots should redact it.
