# DocuMind AI: backend

NestJS API and background worker (one process). The project overview, setup, configuration, and limitations are in the [root README](../README.md); design details are in [docs/architecture.md](../docs/architecture.md) and the endpoints in [docs/api.md](../docs/api.md).

## Commands

| Command | Does |
|---|---|
| `npm run start:dev` | Run with reload on `http://localhost:3000` |
| `npm run build` / `npm run start:prod` | Compile to `dist/`, run the compiled app |
| `npm run prisma:deploy` | Apply existing migrations |
| `npm run prisma:migrate` | Create and apply a new migration after editing `prisma/schema.prisma` (then run `npm run prisma:generate`) |
| `npm run lint` / `npx tsc --noEmit` | Lint and type check |
| `npm test` | Unit tests (no infrastructure) |
| `npm run test:e2e` | Integration and end-to-end tests (needs Postgres and Redis) |
| `npm run test:all` / `npm run test:cov` | Everything, optionally with coverage |

`npm install` runs `prisma generate`, which reads `DATABASE_URL`, so create `.env` from `.env.example` **before** installing.

The generated Prisma client (`src/generated/`) is not committed; it is rebuilt by `prisma generate`.

## Layout

```
src/documents/            upload + document endpoints
src/invoices/             invoice endpoints
src/processing/           BullMQ worker (status changes, retries, saving)
src/pdf/                  PDF text extraction
src/invoice-extraction/   InvoiceExtractor interface, Zod schema, OpenAI implementation
src/storage/              the only code that touches uploaded files
src/common/, src/config/  shared pipes/filters, environment validation
src/app.setup.ts          security headers, CORS, Swagger, shutdown hooks
test/                     end-to-end specs, PDF fixtures, test environment setup
```

## Docker

`docker build -t documind-backend .` builds the production image. See [docs/deployment.md](../docs/deployment.md).
