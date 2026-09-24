# Deployment

The assessment requires a public frontend and backend. This repository is structured for a split deployment.

## Backend

Deploy the repository as a Node service on a host such as Render. `render.yaml` contains the backend service definition and health check.

Set these variables in the backend service:

- `MONGO_URI`: MongoDB Atlas connection string
- `JWT_SECRET`: long random secret, 32+ characters
- `FRONTEND_URL`: public frontend origin
- `ALLOWED_ORIGINS`: comma-separated public frontend origin(s)
- `LLM_API_KEY`: Gemini API key

Optional reliability fallback:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL=openrouter/free`

The production scraper rejects loopback/private company URLs. The evaluator can still run local company fixtures because the evaluator is normally executed outside production mode.

## Frontend

Deploy the same repository to Vercel as a Next.js application. Set:

```env
NEXT_PUBLIC_API_URL=https://<your-backend>/api
```

The frontend makes credentialed API requests to the backend.

## Smoke checks

After deployment:

```bash
curl https://<your-backend>/health
```

Then manually verify:

1. Register and log in.
2. Create a kit from a pasted JD and company URL.
3. Wait for generation to complete and confirm progress/error states.
4. Edit a question, save, regenerate its category, and confirm the edit remains.
5. Practice flashcards and record confidence.
6. Confirm the next session starts with lower-confidence cards.
7. Run the evaluator from a clean clone using the exact required command.
