# Messaging architecture

No external channel is connected. A future channel-neutral backend contract must bind incoming identity to an authenticated organization/member, retain channel source and conversation separation, verify provider webhooks, apply command authorization, and require in-app confirmation for sensitive operations. WhatsApp, Discord, Slack, Teams, and email are planned connectors, not active messaging features.

