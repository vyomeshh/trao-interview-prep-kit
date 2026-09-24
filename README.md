# Trao — The AI Interview Prep Kit

A full-stack application that turns a job description, company website and preparation window into an editable, practiceable interview-preparation kit.

## What the application does

The pipeline is deliberately sequenced:

1. Validate and research the company URL.
2. Crawl the company site, rank useful same-origin links and seek hiring/interview pages without hard-coding a path.
3. Search public discussion about the company's interview process.
4. Extract role requirements from the pasted job description and classify each as technical, behavioural or domain plus `must`/`nice`.
5. Generate question categories separately.
6. Deterministically compare question requirement IDs against must-have requirement IDs.
7. Run up to three coverage passes and generate questions for remaining gaps.
8. Generate the company brief and flashcards.
9. Allocate questions deterministically across exactly the requested number of days.
10. Validate the final kit against Appendix A before it is persisted or emitted by the batch evaluator.

The model never decides schedule arithmetic or requirement coverage.

## Stack

- Next.js App Router + Tailwind CSS
- Node.js + Express
- MongoDB + Mongoose
- JavaScript (ES modules)
- Axios + Cheerio for retrieval
- Google Gemini through `@google/genai`
- Zustand for client state
- Zod for generated-kit and API-adjacent validation

`LLM_PROVIDER=auto` enables provider/model routing. OpenRouter is preferred when configured and uses `openrouter/free`, which selects from the currently available free-model pool; Gemini, Groq, and optional local Ollama are additional failover providers when their credentials/endpoints are configured. Gemini and Groq discover currently available models at runtime, while OpenRouter's free router performs the free-model selection server-side. Set `LLM_PROVIDER` to `openrouter`, `gemini`, `groq`, or `ollama` to force the primary provider. There is no universal unlimited cloud LLM quota; the optional Ollama route is local and therefore not metered by a hosted API quota. JSON responses are still parsed and validated by the application.

## Local setup

Requires Node.js 20.9+ and a MongoDB instance.

```bash
npm install
cp .env.example .env
```

Set at minimum:

```env
MONGO_URI=mongodb://127.0.0.1:27017/trao
JWT_SECRET=<at least 32 random characters>
LLM_PROVIDER=auto
LLM_API_KEY=<Gemini API key>
OPENROUTER_API_KEY=<optional OpenRouter API key>
GROQ_API_KEY=<optional Groq API key>
OLLAMA_BASE_URL=<optional local Ollama URL, e.g. http://127.0.0.1:11434>
```

For local company fixtures in the batch evaluator, the development environment permits loopback/private hosts. Production requests block private and loopback company URLs.

Start both frontend and backend:

```bash
npm run dev
```

Or separately:

```bash
npm run dev:backend
npm run dev:frontend
```

Frontend: `http://localhost:3000`

Backend health check: `http://localhost:5000/health`

## Batch evaluation

This is the exact command required by the assessment:

```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

Example:

```bash
npm run evaluate -- --input cases.json --output kits.json
```

The command processes all cases, continues after an individual failure, uses the same `buildFullKit` pipeline as the application, respects the supplied `days`, and writes Appendix B:

```json
{
  "version": "1.0",
  "generated_at": "2026-09-01T09:12:44Z",
  "kits": [
    {
      "id": "case-01",
      "status": "ok",
      "kit": {},
      "error": null
    }
  ]
}
```

Local company URLs such as `http://localhost:8099/acme/` are supported when the command is run outside production.

## Kit structure and state

The generated kit uses the field names from Appendix A.

Generated questions and flashcards have `_state: "generated"`. When a user edits one, its state becomes `"edited"`. A pinned state is also supported by the schema for future UI use.

Category regeneration removes only questions that are still generated. Edited/manual questions survive regeneration. Brief regeneration skips a brief that is marked edited or pinned. Schedule regeneration is deterministic and only changes the schedule.

This keeps user edits isolated from generated replacement data.

## Research approach

The crawler:

- only follows `http`/`https` links on the same origin
- resolves relative URLs
- reads `robots.txt` and skips disallowed paths
- ranks links using anchor text and URL signals such as hiring/careers/jobs/engineering/handbook/about
- rate-limits requests per origin
- retries transient HTTP failures with exponential backoff
- limits timeouts, content types, page bytes and total pages
- records skipped/unreachable pages as warnings instead of failing the entire research pass

Public discussion is searched separately and its result titles/snippets are provided to the model with their source URLs. No search result is treated as authoritative company policy.

## LLM sequencing and resilience

The job-description stage, each question category, company brief, and flashcards are separate generation calls.

The LLM layer is provider-agnostic. With `LLM_PROVIDER=auto`, the app attempts configured providers in order: OpenRouter, Gemini, Groq, then optional local Ollama. OpenRouter uses its current `openrouter/free` router so the service can select an available free model without hard-coding one model name. Gemini and Groq query their model catalogs and try available models. Every provider uses bounded retries, exponential backoff, timeouts and JSON parsing/healing. This does not bypass hosted quotas: cloud providers still enforce their own limits. The optional Ollama route can provide local, quota-free development inference when a compatible model is installed.

There is intentionally no fabricated static fallback for a failed LLM call. A fake requirement or company brief would violate the assessment's explicit instruction to report thin or unavailable research honestly.

## Coverage

Coverage is deterministic:

- build a set of requirement IDs referenced by questions
- filter the requirements to `priority === "must"`
- report missing IDs
- send only those missing requirements into the next generation pass
- repeat up to three total passes
- refuse to emit an `ok` kit if a must-have requirement remains uncovered

## Schedule

The schedule is pure application code. Questions are sorted by must/nice priority, then difficulty, and assigned to contiguous days so harder, higher-priority material appears earlier.

Question study time is integer minutes based on difficulty:

- difficulty 1 → 15 minutes
- difficulty 2 → 20 minutes
- difficulty 3 → 30 minutes

Empty trailing days become review days. The number of schedule days always equals the requested `days`, clamped to 1–60.

## Authentication and ownership

Authentication uses a signed, HTTP-only JWT cookie. Protected kit queries always scope by `userId`. Invalid/expired sessions receive a 401.

The API also validates request origins for browser writes and configures CORS from `ALLOWED_ORIGINS`.

## Edge cases

- Invalid URL → structured error
- 404/timeout/unreachable pages → warning and continue
- No discoverable hiring/about page → honest research warning
- Thin JD → only requirements actually extracted are included
- No public interview discussion → empty discussion sources plus warning
- Invalid generated data → validation error
- Provider rate limits → retry/backoff
- Duplicate same user + URL + JD + days → existing kit returned
- 1-day and 60-day schedules → supported by deterministic allocator

## Tests

Run:

```bash
npm test
```

The tests cover:

- must-have coverage detection
- schedule day count and priority ordering
- structure validation against dangling references
- production SSRF/loopback blocking

## Creative feature: weak-spots report

Practice mode includes a small deterministic weak-spots report. It groups flashcards by requirement, gives priority to `must` requirements, and surfaces the lowest-confidence areas after a practice session. It is intentionally derived from recorded confidence data rather than generated by the model.

## Deployment

The frontend and backend are intentionally separable:

- Frontend: deploy the Next.js app to Vercel or another Next.js host.
- Backend: deploy Express to a Node host such as Render/Fly.io/another Node service.
- Database: MongoDB Atlas free tier.
- Set `NEXT_PUBLIC_API_URL` on the frontend to the public backend API base URL.
- Set `FRONTEND_URL`/`ALLOWED_ORIGINS` on the backend to the public frontend origin.
- Set all secrets through the deployment provider; never commit `.env`.

Deployment credentials are intentionally not stored in source control.

## Known limitations

- The public discussion search uses an HTML search endpoint rather than a paid search API, so search coverage depends on external availability.
- Crawled pages are static HTTP responses; JavaScript-only sites may expose less content.
- Authentication uses JWT cookies rather than a server-side session store, which keeps the assessment implementation small while still providing expiration and protected ownership checks.

### Retry behaviour
If a kit generation fails, the same input can be submitted again. Failed kit records are reset to `processing` and the pipeline is rerun instead of returning the stale failed record. The builder also exposes a `Retry generation` action for failed kits.
