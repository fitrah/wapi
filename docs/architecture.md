# Architecture

The product API stays provider-neutral. Tenants call the same endpoints whether the active driver is WhatsApp Web/Baileys or the official Meta Cloud API later.

## Core Model

- Tenant: SaaS customer account with plan limits and API key.
- WhatsApp number: one connected WhatsApp Web session.
- Message: outbound or inbound message log.
- Webhook: tenant callback target for incoming messages and delivery events.

## Runtime Flow

1. Tenant scans a QR code for each number.
2. A session worker owns that number and updates status.
3. Outbound API requests are queued per number.
4. Worker sends with throttling and writes delivery status.
5. Incoming messages are logged and forwarded to tenant webhooks.

## Risk Controls

- Per-number queue to avoid burst sending.
- Tenant daily quota and plan limits.
- Clear acceptable-use policy: opt-in customers only, no spam blast promises.
- Provider adapter boundary so official Cloud API migration is possible later.
