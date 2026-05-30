# JobGenie — Architecture

High-level view of how the pieces fit together. Both diagrams render natively
on GitHub.

## System overview

```mermaid
flowchart LR
    subgraph Client["User"]
        U["Browser<br/>(dashboard UI)"]
    end

    subgraph App["Next.js 14 App (single process)"]
        UI["App Router pages<br/>/dashboard/*"]
        API["API routes<br/>/api/*"]
        AUTH["NextAuth<br/>(credentials + Google)"]
        QUEUE["Queue layer<br/>BullMQ • inline fallback"]
    end

    subgraph Workers["Background work"]
        APPLY["Apply Engine<br/>src/lib/automation/applyEngine.ts"]
        SEARCH["Search Engine<br/>src/lib/automation/searchEngine.ts"]
        WORKER["Optional worker process<br/>src/worker (Redis mode only)"]
    end

    subgraph AI["AI layer (OpenAI-compatible)"]
        AGENT["Agents<br/>field mapper • cover letter<br/>match scorer • question synth"]
        LLM["Ollama / Groq / OpenAI<br/>OPENAI_BASE_URL"]
    end

    subgraph Browser["Browser automation"]
        PW["Playwright (Chromium)<br/>inspector • filler"]
        PORTALS["Job portals<br/>LinkedIn • Greenhouse • Lever<br/>Workday • Ashby • Indeed • generic"]
    end

    subgraph Data["Persistence"]
        DB[("SQLite<br/>prisma/dev.db")]
        REDIS[("Redis<br/>optional")]
        FS["uploads/<br/>resumes (PDF)"]
    end

    U -->|HTTPS| UI
    U -->|fetch| API
    API --> AUTH
    AUTH --> DB
    API --> QUEUE
    API --> DB
    API --> FS

    QUEUE -->|Redis mode| REDIS
    QUEUE -->|inline mode| APPLY
    QUEUE -->|inline mode| SEARCH
    WORKER --> REDIS
    WORKER --> APPLY
    WORKER --> SEARCH

    SEARCH --> PW
    APPLY --> PW
    APPLY --> AGENT
    SEARCH --> DB
    APPLY --> DB
    APPLY --> FS

    AGENT --> LLM
    PW --> PORTALS
```

## Apply flow (one job, end-to-end)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant UI as Dashboard
    participant API as /api/searches
    participant Q as Queue
    participant SE as Search Engine
    participant DB as SQLite
    participant AE as Apply Engine
    participant AG as AI Agents
    participant LLM as Ollama / OpenAI
    participant PW as Playwright
    participant P as Job Portal

    U->>UI: Create search (portal + keywords)
    UI->>API: POST /api/searches
    API->>DB: Insert JobSearch
    API->>Q: enqueueSearch(searchId)
    Q->>SE: discoverJobs(portalUrl, keywords)
    SE->>PW: launch context, navigate, harvest links
    PW->>P: GET portal results page
    P-->>PW: HTML with job links
    SE-->>Q: DiscoveredJob[]
    Q->>DB: Insert Application rows (PENDING)
    loop For each new Application (within daily limit)
        Q->>AE: enqueueApply(applicationId)
        AE->>PW: probePortal — detect form fields
        AE->>AG: synthesizeQuestions(unknown fields)
        AG->>LLM: chat/completions (JSON mode)
        LLM-->>AG: questions / answers
        AE->>DB: Update formSnapshot, status
        alt HUMAN_APPROVAL_MODE = true
            AE->>DB: status = AWAITING_APPROVAL
            U->>API: POST /api/applications/{id}/approve
            API->>Q: enqueueApply (resume)
        end
        AE->>PW: fillForm + clickNextOrSubmit
        PW->>P: Submit application
        AE->>DB: status = SUBMITTED / FAILED + logs
    end
```

## Queue modes

JobGenie ships with two execution modes; the right one is chosen
automatically by probing `REDIS_URL` at boot
([src/lib/queue.ts](../src/lib/queue.ts)).

| Mode | When it's used | Job execution | Worker process |
|---|---|---|---|
| **Redis** | `REDIS_URL` reachable | BullMQ → durable jobs, retries, concurrency | Run `npm run worker` separately |
| **Inline** | Redis unreachable | `setImmediate` inside the Next.js process | Not needed — web process does the work |

Inline mode keeps local dev (and free-tier hosting like Fly.io) zero-dependency.

## Deployment topologies

```mermaid
flowchart TB
    subgraph Local["Local dev — current"]
        L1["Next.js dev :3000"]
        L2["Ollama :11434"]
        L3["(inline queue)"]
        L4["SQLite ./dev.db"]
    end

    subgraph Tunnel["Public via Cloudflare Tunnel"]
        T1["*.trycloudflare.com"] --> L1
    end

    subgraph Prod["Production-ish (Fly.io / Render / VPS)"]
        P1["Next.js container"]
        P2["Optional worker container"]
        P3[("Volume<br/>SQLite + uploads")]
        P4["Hosted LLM<br/>Groq / OpenAI"]
        P5[("Redis (optional)")]
        P1 --> P3
        P1 --> P4
        P1 -.-> P5
        P2 -.-> P5
        P2 --> P3
    end
```

## Key files

| Concern | File |
|---|---|
| Data model | [prisma/schema.prisma](../prisma/schema.prisma) |
| Auth | [src/lib/auth.ts](../src/lib/auth.ts) · [src/lib/session.ts](../src/lib/session.ts) |
| Queue + inline fallback | [src/lib/queue.ts](../src/lib/queue.ts) |
| AI client + prompts | [src/lib/ai/openai.ts](../src/lib/ai/openai.ts) · [src/lib/ai/agent.ts](../src/lib/ai/agent.ts) |
| Browser primitives | [src/lib/automation/browser.ts](../src/lib/automation/browser.ts) |
| Portal inspector | [src/lib/automation/inspector.ts](../src/lib/automation/inspector.ts) |
| Form filler | [src/lib/automation/filler.ts](../src/lib/automation/filler.ts) |
| Job discovery | [src/lib/automation/searchEngine.ts](../src/lib/automation/searchEngine.ts) |
| Apply orchestration | [src/lib/automation/applyEngine.ts](../src/lib/automation/applyEngine.ts) |
| Worker entrypoint | [src/worker/index.ts](../src/worker/index.ts) |
| Route error helper | [src/lib/route.ts](../src/lib/route.ts) |
