import "dotenv/config";

const candidates = [];
if (process.env.OPENROUTER_API_KEY) candidates.push("openrouter");
if (process.env.LLM_API_KEY) candidates.push("gemini");
if (process.env.GROQ_API_KEY) candidates.push("groq");
if (process.env.OLLAMA_BASE_URL) candidates.push("ollama");

console.log(JSON.stringify({
  mode: process.env.LLM_PROVIDER || "auto",
  configured_providers: candidates,
  message: candidates.length ? "Configured providers will be attempted in automatic failover order." : "No LLM provider is configured."
}, null, 2));
