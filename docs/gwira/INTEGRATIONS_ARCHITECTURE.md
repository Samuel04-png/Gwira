# Integrations architecture

The in-app catalog lists communication, development, productivity, business, and payment connectors. Every entry is explicitly unavailable. There is no OAuth redirect, account connection, credential field, token storage, synchronization, webhook, or message sending.

A future connector must be organization-scoped, use backend-owned OAuth/provider authorization, keep secrets out of the renderer, expose reviewed scopes, receive explicit worker/workflow grants, verify webhook signatures, log authorization decisions, and support revocation. A connected GitHub or mail account must never grant blanket Doat access.

