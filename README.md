# Davis — AI Sales Development Representative

Davis automates your outbound sales pipeline. It finds prospects, researches them, writes personalized emails, tracks replies, and captures meeting insights — so you can focus on closing.

## What it does

- **Lead Discovery** — Scrapes LinkedIn and other platforms to find prospects matching your ICP
- **Deep Research** — Analyzes prospect activity, posts, and company data to find pain points and buying signals
- **Personalized Outreach** — Generates hyper-personalized emails using multi-stage AI workflows (LangGraph + Groq)
- **Reply Tracking** — Monitors email responses, analyzes sentiment, and auto-generates follow-ups
- **Meeting Intelligence** — Adds bots to meetings, captures transcripts, extracts action items, and builds a searchable knowledge base

## Architecture

```
Frontend (Next.js)          Backend (FastAPI)           Storage
├── Landing page            ├── AI SDR services         ├── Supabase (PostgreSQL)
├── Dashboard               ├── Meeting AI services     ├── Redis (caching)
├── Prospect management     ├── Knowledge base          └── Pinecone (vectors)
├── Email editor            └── Auth
└── Meeting viewer
                            External Services
                            ├── Groq (LLM)
                            ├── MeetingBaaS (meeting bots)
                            └── Jina AI (embeddings)
```

## Tech stack

**Frontend:** Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, Recharts
**Backend:** FastAPI, LangChain, LangGraph, Groq
**Infra:** Supabase, Redis, Pinecone, Docker, Railway, Vercel

## Getting started

### Prerequisites

- Node.js 18+, Python 3.9+
- Supabase, Redis, Pinecone accounts
- Groq API key
- Gmail API credentials (for email tracking)

### Frontend

```bash
cd frontend
cp .env.example .env.local  # fill in your keys
npm install
npm run dev                 # http://localhost:3000
```

### Backend

```bash
cd backend
cp .env.example .env        # fill in your keys
pip install -r requirements.txt
uvicorn main:app --reload   # http://localhost:8000
```

Or use Docker:

```bash
cd backend
cp .env.example .env
docker-compose up -d
```

### Environment variables

**Frontend** (`.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=<your-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-key>
```

**Backend** (`.env`):
```
SUPABASE_URL=<your-url>
SUPABASE_ANON_KEY=<your-key>
GROQ_API_KEY=<your-key>
PINECONE_API_KEY=<your-key>
REDIS_HOST=localhost
REDIS_PORT=6379
LINKEDIN_EMAIL=<email>
LINKEDIN_PASSWORD=<password>
GMAIL_CREDENTIALS=<path-to-credentials.json>
MEETING_API_KEY=<your-key>
```

## Deployment

- **Frontend** → Vercel (connect repo, set env vars, deploy)
- **Backend** → Railway (connect repo, set env vars, start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`)

## License

MIT

---

Built by [Mohd Jami](mailto:mohdjamikhann@gmail.com)
