# DocuMindAI
DocuMind AI — Intelligent Document Processing Platform

## Stack
- Backend: NestJS + TypeScript
- Frontend: React + Vite + TypeScript + Tailwind CSS
- Infrastructure: PostgreSQL + Redis (via Docker Compose)

## Getting started

### 1. Start infrastructure
```bash
cp .env.example .env
docker compose up -d
```

### 2. Backend
```bash
cd backend
cp .env.example .env
npm install
npm run start:dev
```
API runs at `http://localhost:3000`. Health check: `GET /health`.

### 3. Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
App runs at `http://localhost:5173` and displays whether the backend API is reachable.

## Project structure
```
backend/    NestJS API (modular monolith)
frontend/   React + Vite dashboard
docker-compose.yml   PostgreSQL + Redis
```

See `.claude/PLAN.md` for the full build roadmap.
