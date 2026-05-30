# JobGenie

An AI-powered web app that automatically applies to jobs across **any** career portal — LinkedIn, Greenhouse, Lever, Workday, Indeed, Ashby, or a company careers page — without portal-specific hardcoding.

## Highlights

- **Dynamic portal understanding** — a Playwright inspector walks the live DOM and emits a structured field map; no portal-specific selectors.
- **AI form mapping** — an OpenAI agent maps each detected field to your profile / resume / saved answers.
- **Reusable profile memory** — every confidently-answered question is hashed and saved for future portals.
- **Tailored cover letters & match scoring** — generated per job from your resume + the job page text.
- **Human-in-the-loop by default** — applications stop at `AWAITING_APPROVAL` until you click **Approve & submit**.
- **Queue-based workers** — BullMQ + Redis, horizontally scalable.
- **Safety rails** — daily application limit, duplicate-application guard, CAPTCHA detection, jittered human-like typing.

## Architecture

```
Next.js (App Router)
  ├── /api/*          REST endpoints (auth, profile, resumes, searches, applications, answers, portal/inspect)
  ├── /dashboard/*    SaaS dashboard UI (Tailwind, dark mode)
  └── lib/
       ├── ai/        OpenAI agent (field mapper, cover letter, match scorer, question synth)
       ├── automation/ Playwright engine (browser, inspector, filler, applyEngine, searchEngine)
       ├── db.ts      Prisma client
       └── queue.ts   BullMQ queues
worker/                Long-running BullMQ worker — runs Playwright jobs
prisma/schema.prisma   PostgreSQL schema
```

## Quick start (local)

```powershell
# 1. Install Ollama (free, local LLM) — https://ollama.com
ollama pull llama3.1   # or qwen2.5, mistral, etc.

# 2. Install deps (also runs `playwright install chromium`)
npm install

# 3. Configure env
Copy-Item .env.example .env
# defaults already point to local Ollama at http://localhost:11434/v1
# edit .env: DATABASE_URL, NEXTAUTH_SECRET (OPENAI_API_KEY can stay as "ollama")

# 4. Start Postgres + Redis
docker compose up -d db redis

# 5. Migrate DB
npx prisma migrate dev --name init

# 6. Run web + worker in two terminals
npm run dev
npm run worker
```

Open http://localhost:3000, sign up, upload a resume, fill profile, create a search.

## Quick start (Docker)

```powershell
Copy-Item .env.example .env
docker compose up --build
```

This spins up Postgres, Redis, **Ollama** (auto-pulls `llama3.1`), the Next.js web app, and the worker. To use a different local model, set `OLLAMA_MODEL=qwen2.5` (or any Ollama tag) before `docker compose up`. To use OpenAI/Groq instead, edit `.env` and remove the `ollama` service from `docker-compose.yml`.

## Swapping the AI provider

JobGenie talks to **any OpenAI-compatible** `/v1/chat/completions` endpoint via three env vars:

| Provider | `OPENAI_BASE_URL` | `OPENAI_API_KEY` | `OPENAI_MODEL` |
| --- | --- | --- | --- |
| Ollama (default, free, local) | `http://localhost:11434/v1` | `ollama` | `llama3.1` |
| OpenAI | `https://api.openai.com/v1` | `sk-...` | `gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `gsk_...` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `sk-or-...` | `meta-llama/llama-3.1-8b-instruct:free` |

## Environment variables

See [.env.example](./.env.example). Key flags:

| Var | Purpose |
| --- | --- |
| `HUMAN_APPROVAL_MODE` | When `true`, the worker fills forms and waits for the user to click **Approve** before submitting. |
| `DAILY_APPLICATION_LIMIT` | Hard cap on applications enqueued per user per day. |
| `PLAYWRIGHT_HEADLESS` | Set `false` to watch the bot work locally. |

## How dynamic portal understanding works

1. **Probe** — `lib/automation/inspector.ts` runs `page.evaluate` against the live DOM, harvesting every visible `input/select/textarea/[contenteditable]` with its accessible label, type, options, required-state. Each control is stamped with a `data-jobgenie-id` so we can re-target it later without selectors.
2. **Map** — `lib/ai/agent.ts#mapFieldsToProfile` sends the field list + profile + resume excerpt + saved answers to GPT, which returns `{ fieldId, value, confidence, rationale }` per field.
3. **Fill** — `lib/automation/filler.ts` writes the answers back via the stamped attribute, handling text, select, radio, checkbox, file upload, and contenteditable.
4. **Advance** — `clickNextOrSubmit` looks for buttons by accessible name (Next / Continue / Submit / Apply) and walks up to 5 steps.
5. **Learn** — high-confidence answers are upserted into `SavedAnswer` keyed by a normalized question hash, so future portals reuse them.

## Safety

- CAPTCHA detection (`recaptcha`, `hcaptcha`, `cf-turnstile`) routes the application to `NEEDS_INFO` instead of attempting bypass.
- Duplicate guard via `@@unique([userId, jobUrl])`.
- Per-user daily quota enforced in the search worker.
- Human approval gate enabled by default — JobGenie will never submit silently unless you opt out via env.
- All automation uses a configurable user agent; respect each portal's terms of service.

## Project layout

```
prisma/schema.prisma
src/
  app/                    Next.js App Router (pages + API routes)
  lib/
    ai/                   OpenAI prompts + agent helpers
    automation/           Playwright browser, inspector, filler, engines
    auth.ts, db.ts, env.ts, queue.ts, logger.ts, hash.ts, session.ts
  worker/index.ts         BullMQ worker entrypoint
Dockerfile, Dockerfile.worker, docker-compose.yml
```

## Extending

- **New AI provider** — swap `lib/ai/openai.ts`; the agent contract is JSON in / JSON out.
- **Scheduled searches** — `JobSearch.schedule` already holds a cron expression; wire a `BullMQ` repeatable job in `worker/index.ts`.
- **Chrome extension** — point it at `/api/applications` with a session cookie to enqueue the current tab's job URL.
- **Multi-resume routing** — `Resume.isDefault` is the current selector; add a per-search `resumeId` to route by keyword.

## License

MIT — for educational use. You are responsible for complying with each job portal's terms of service.
