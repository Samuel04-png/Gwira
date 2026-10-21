# Cloud AI architecture

The application now has provider-independent, non-executing contracts for prompt streaming, structured outputs, tool requests, cancellation, usage, errors, timeouts, and environment-specific provider policy. Production validation rejects `codex-local`; a hosted provider requires HTTPS and a server-side credential reference. No cloud provider is configured.

Recommended staged design: a backend API validates organization membership and policy; a queue dispatches a durable job to isolated workers; workers call a self-hosted inference service through a private network; events are written durably before realtime fan-out. The desktop is only a client.

For an initial self-hosted experiment, validate a suitably licensed 7B–14B instruct/tool-calling model on a single 24–48 GB GPU with vLLM. vLLM documents streaming, structured outputs, tool calling, and an OpenAI-compatible server; its Linux/CUDA path supports GPUs such as L4 and A100. Model license, tool-calling reliability, data residency, and safety evaluation must be approved per selected model before use. [vLLM documentation](https://docs.vllm.ai/en/stable/)

