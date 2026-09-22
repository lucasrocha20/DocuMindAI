// Loaded before every test file (unit and e2e). It makes the suite hermetic:
// nothing here may reach a real external service or the developer's live data.
import 'dotenv/config';

// Any accidental call through the real OpenAI client hits a dead local port
// and fails immediately instead of going to the internet with a real key.
process.env.OPENAI_API_KEY = 'test-key';
process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9';

// Redis logical DB 1, so a dev server on DB 0 can neither consume test jobs
// nor have its own jobs consumed (and failed) by a test's worker.
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
redisUrl.pathname = '/1';
process.env.REDIS_URL = redisUrl.toString();

// Effectively no rate limiting, so ordinary tests can make many quick requests from one IP.
// The security spec lowers these itself to test the limiter.
process.env.THROTTLE_LIMIT = '100000';
process.env.UPLOAD_RATE_LIMIT = '100000';

// Uploads go to the per-run temp directory from global-setup.ts, never to the
// developer's uploads/ folder. Fail loudly rather than fall back to it.
const uploadDir = process.env.TEST_UPLOAD_DIR;
if (!uploadDir) {
  throw new Error('TEST_UPLOAD_DIR is not set. Run tests through the vitest configs, which load test/global-setup.ts.');
}
process.env.UPLOAD_DIR = uploadDir;
