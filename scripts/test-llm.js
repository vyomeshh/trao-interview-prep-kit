import "dotenv/config";
import { extractRequirements } from "../core/llm.js";

try {
  const started = Date.now();
  const result = await extractRequirements(
    "Software Engineer. Required: JavaScript, React, and REST API experience.",
    () => {}
  );
  console.log(JSON.stringify({
    ok: Array.isArray(result?.requirements),
    elapsed_ms: Date.now() - started,
    provider_mode: process.env.LLM_PROVIDER || "auto",
    configured_providers: {
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      gemini: Boolean(process.env.LLM_API_KEY),
      groq: Boolean(process.env.GROQ_API_KEY),
      ollama: Boolean(process.env.OLLAMA_BASE_URL)
    },
    requirement_count: result.requirements.length
  }, null, 2));
  if (!Array.isArray(result?.requirements)) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    code: error?.code,
    name: error?.name,
    message: error?.message
  }, null, 2));
  process.exitCode = 1;
}
