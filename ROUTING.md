# Automatic LLM routing

The app uses `LLM_PROVIDER=auto` by default.

1. **OpenRouter** — when `OPENROUTER_API_KEY` is present, the app uses `openrouter/free` directly. OpenRouter describes this managed router as selecting from currently available free models and filtering for request capabilities such as structured outputs. The app does not send a large `models` array, which avoids OpenRouter request-limit errors.
2. **Gemini** — when `LLM_API_KEY` is present, the app queries Gemini's model catalog and prefers configured/available `generateContent` models.
3. **Groq** — when `GROQ_API_KEY` is present, the app queries Groq's model catalog and tries active models, using JSON mode and application-level validation.
4. **Ollama** — when `OLLAMA_BASE_URL` is configured, the app queries local installed models and can provide quota-free local inference for development.

Each provider is skipped when its credential/endpoint is not configured. Each configured provider gets bounded retries and exponential backoff. Provider/model selection is logged to the backend so failures are diagnosable.

This is failover, not quota circumvention. Hosted providers retain their rate limits and usage policies.
