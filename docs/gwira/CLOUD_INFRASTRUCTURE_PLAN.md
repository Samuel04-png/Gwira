# Cloud infrastructure plan

## Recommended low-cost progression

1. Keep the present local prototype as the only executable product.
2. Use a Supabase development project only for schema/RLS experimentation; no production data or deployment without approval.
3. Validate a licensed open-weight small/medium model in a disposable environment through vLLM, behind a private API, with a manually capped budget.
4. Add a durable queue and isolated worker only after tenant/RLS/security tests pass.

## Verified current reference prices (not a quote)

- Supabase lists Free at $0 and Pro from $25/month; Pro includes one Micro compute credit and has usage charges beyond included quotas. [Supabase pricing](https://supabase.com/pricing)
- Runpod lists an L4 24 GB pod at $0.59/hour and L4-class serverless at $0.69/hour; storage starts at $0.05/GB/month. Prices are volatile and region/tier dependent. [Runpod pricing](https://www.runpod.io/pricing)
- vLLM supports streaming, structured output, tool calling, and an OpenAI-compatible API, but operational support depends on the chosen hardware/model/runtime combination. [vLLM](https://docs.vllm.ai/en/stable/)

## Planning assumptions, not verified costs

At 40 hours/month, an L4 pod reference is roughly $23.60 GPU compute before storage, egress, CPU/API, observability, and failure overhead. Always-on operation at that listed rate would be about $430/month. Per-execution cost must be measured from real token throughput, queue duration, and GPU utilization; no honest estimate exists yet. Start with capped, manually approved experiments rather than reserved GPU capacity.

## Required components before launch

Authenticated API, Postgres/RLS, secret manager, object storage, durable queue, isolated workers, tracing/metrics, backups/recovery drills, spend caps/alerts, model evaluation, incident response, and legal review of every model and base repository license.

