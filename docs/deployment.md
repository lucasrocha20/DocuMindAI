# Deployment

The app needs four things, and nothing else:

1. **The backend**: one container (API and worker in the same process).
2. **PostgreSQL** (managed service or your own).
3. **Redis** (managed service or your own).
4. **The frontend**: static files, served by any static host.

Plus persistent disk for uploaded PDFs (see [Storage](#storage)).

> This was verified locally: the production image was built, migrated against a fresh database, booted with `NODE_ENV=production`, and driven through a real upload. It has not been deployed to any hosting platform, so treat platform-specific steps as things to adapt.

## Backend image

`backend/Dockerfile` is a two-stage build. It installs dependencies, generates the Prisma client, compiles, and produces a runtime image that runs as the non-root `node` user, exposes port 3000, and has a Docker `HEALTHCHECK` on `/health`.

```bash
docker build -t documind-backend backend
```

### 1. Apply database migrations

Migrations are a separate, explicit step, so a deploy never changes the schema by surprise. The image includes what it needs:

```bash
docker run --rm -e DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB" \
  documind-backend npm run prisma:deploy
```

Run this on every release that adds a migration (`backend/prisma/migrations/`).

### 2. Run the backend

```bash
docker run -d --name documind-backend -p 3000:3000 \
  -e DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require" \
  -e REDIS_URL="rediss://:PASSWORD@REDIS_HOST:6379" \
  -e OPENAI_API_KEY="<your key>" \
  -e CORS_ORIGIN="https://your-frontend.example.com" \
  -e TRUST_PROXY=1 \
  -v documind-uploads:/data/uploads \
  documind-backend
```

`NODE_ENV=production` is already set in the image. In that mode the app **refuses to start** if the API key is a placeholder, the database password is a default one (`documind`, `postgres`, `password`), or `CORS_ORIGIN` is missing, and it says which one. Swagger (`/docs`) is off unless you set `ENABLE_SWAGGER=true`.

See [Configuration](../README.md#configuration) for every variable. Secrets belong in your platform's secret store, not in the image or the repository.

### Check it

```bash
curl https://your-api.example.com/health      # {"status":"ok", ...}
docker inspect --format '{{.State.Health.Status}}' documind-backend   # healthy
```

## Frontend

The dashboard is a static single-page app. The API address is fixed **at build time**:

```bash
cd frontend
VITE_API_URL=https://your-api.example.com npm run build
```

Upload the contents of `frontend/dist/` to any static host. Two things to configure on the host:

- **Serve `index.html` for unknown paths.** The dashboard uses client-side routes (`/invoices/<id>`), so a direct visit or refresh on one must not return a 404. For nginx this is `try_files $uri /index.html;`. (Untested here, so check your host's equivalent.)
- The backend's `CORS_ORIGIN` must be exactly the frontend's origin (scheme, host, port), or the browser will block API calls.

## Behind a reverse proxy

Terminate TLS at the proxy. Then:

- Set `TRUST_PROXY` to the number of proxies in front of the app, so rate limiting sees each client's real IP instead of the proxy's. Leave it unset if there is no proxy; the app then ignores `X-Forwarded-For`, so clients can't fake their address.
- Allow request bodies of at least **10 MB** (nginx: `client_max_body_size 11m;`), or the proxy will reject uploads before the app sees them.

## Storage

Uploaded PDFs are written to `UPLOAD_DIR` (`/data/uploads` in the image) with owner-only permissions. In production that path must be a **persistent volume**, or uploads disappear on every redeploy while their database rows remain.

This is a real constraint of the current design: because files live on local disk, the backend should run as **a single instance** (or several sharing the same volume). Nothing deletes old files, and there is no virus scanning. Moving to object storage would mean replacing `StorageService` (about 30 lines), which is the only code that touches files.

## Production checklist

- [ ] `OPENAI_API_KEY` set to a real key (and a spending limit set with OpenAI, since every upload makes one paid call)
- [ ] `DATABASE_URL` uses a strong password, TLS (`sslmode=require`), and a least-privilege role rather than the Postgres superuser
- [ ] `REDIS_URL` points at a Redis with a password and TLS (`rediss://`)
- [ ] `CORS_ORIGIN` is the frontend's exact origin
- [ ] `TRUST_PROXY` matches your proxy setup
- [ ] Uploads directory is a persistent volume, and backed up if the PDFs matter
- [ ] Migrations applied (`npm run prisma:deploy`)
- [ ] Frontend built with the right `VITE_API_URL`, and the host falls back to `index.html`
- [ ] **Authentication is in front of it.** The app has none. Do not expose it to the public internet as-is.

## Things to know

- **Image size is about 920 MB.** Most of it is the Prisma CLI, kept in the image so the same image can run migrations. A leaner setup would run migrations from the build stage instead.
- **Rate limits are counted in memory per instance.** With several instances the effective limit multiplies. A shared store would be needed.
- **Failed background jobs are not reconciled.** If Redis loses a job or the worker dies mid-way, that document can stay `PENDING` or `PROCESSING`; nothing sweeps for it.
- **There is no CI configuration** in this repository. The checks in the README are run by hand.
