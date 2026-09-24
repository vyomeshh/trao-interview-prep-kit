# Trao Assessment Audit

This repository was reviewed against the supplied Trao Full-Stack Engineering Assessment and refactored toward the exact Appendix A/B contracts.

## Previously identified gaps and fixes

- Conflicting root/backend package definitions were consolidated into one root package.
- The mandatory evaluator now uses `npm run evaluate -- --input <cases.json> --output <kits.json>` and the same core orchestration path as the web application.
- The old one-shot pipeline and broken evaluator import were removed.
- Retrieval now performs ranked same-origin crawling, robots.txt checks, request size/content-type checks, retry/backoff and structured source warnings.
- Production retrieval blocks loopback/private hosts to reduce SSRF risk.
- Public interview-process discussion is searched separately from company-site retrieval.
- LLM stages are separated into requirement extraction, category-specific question generation, company brief, and flashcards.
- Deterministic coverage and deterministic schedule allocation are implemented in application code.
- A second-pass question loop regenerates questions for uncovered requirements and fails honestly if must-have coverage cannot be closed.
- Generated kit validation checks required structure, stable IDs, references, exact day count, integer minutes, and must-have schedule coverage.
- Builder operations preserve edited/manual questions during category regeneration and support inline editing, reordering, category moves, add/delete, section regeneration and schedule regeneration.
- Practice mode records confidence and carries updated confidence into the next weakest-first session.
- Authentication is cookie-session based with protected routes and user-scoped kit queries.
- The `.env` file with credentials from the original archive was removed; `.env.example` documents required configuration.
- Tests cover coverage, schedule allocation, structure validation and production URL restrictions.

## Verification

The backend/core JavaScript was syntax-checked after the refactor. Full dependency installation/runtime execution was attempted, but this execution environment could not resolve the npm registry (`EAI_AGAIN`), so a clean `npm install`, Next.js build, MongoDB integration run, and live LLM call could not be completed inside this sandbox.

Before submission, run:

```bash
npm install
npm test
npm run build
npm run evaluate -- --input cases.json --output kits.json
```

Then start frontend/backend using the documented commands and verify the deployment with real MongoDB and LLM credentials.


## LLM availability hardening

Gemini transient 429/5xx/timeout failures now use exponential backoff with jitter and a configurable fallback model. The test script sets `process.exitCode` instead of forcing immediate process termination, avoiding Windows libuv shutdown assertions after a failed SDK request.
