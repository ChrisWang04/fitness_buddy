# LangSmith Setup

LangSmith gives you full observability into your agent — every LLM call, every node execution, every state transition.

## 1. Create account

Sign up at https://smith.langchain.com

## 2. Get API key

Go to Settings → API Keys → Create API Key

## 3. Set environment variables

Add to your `.env`:

```bash
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your-api-key
LANGCHAIN_PROJECT=fitness_buddy
```

## 4. Verify

Run your agent and check https://smith.langchain.com — you should see traces appearing under the `fitness_buddy` project.

## What to look for in traces

- **Node execution order** — is the graph flowing correctly?
- **LLM inputs/outputs** — are your prompts producing good responses?
- **Token usage** — how much does each invocation cost?
- **Latency** — which nodes are slow?
- **Errors** — where is the graph failing?

## Attaching traces to PRs

Every PR must include a LangSmith trace URL. To get one:
1. Run your agent locally
2. Find the trace in the LangSmith dashboard
3. Click "Share" → copy the public link
4. Paste it in your PR description

## Evals (Stage 4)

You'll build a golden dataset of 5 conversation traces per section in Stage 4.
LangSmith evals will automatically score your agent against these traces.
