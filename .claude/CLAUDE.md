
# Project Guidelines

## Project
AI Invoice Processing SaaS MVP.

## Stack
- TypeScript
- NestJS
- React + Vite
- PostgreSQL
- Prisma
- Redis
- BullMQ
- OpenAI API
- Zod
- Vitest or Jest

## Architecture
- Modular monolith.
- Keep modules simple and cohesive.
- Avoid unnecessary abstractions.
- Do not introduce microservices.
- Do not implement full DDD unless justified.
- Prefer readable, maintainable code.
- Do not implement overengeneering

## Backend Rules
- Validate all external input.
- Use DTOs for API input.
- Use Zod to validate AI responses.
- Never trust LLM-generated data without validation.
- Never commit secrets.
- Use environment variables.
- Handle processing failures explicitly.

## Development Process
Before implementing:
1. Inspect the existing code.
2. Explain the planned changes.
3. Implement the smallest solution.
4. Run relevant tests.
5. Run lint and type checks.
6. Summarize changes and remaining issues.

Do not modify unrelated files.
Do not install dependencies without explaining why.