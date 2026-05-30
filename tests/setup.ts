// Isolate tests from the dev DB and external services.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./test.db";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:1"; // unreachable on purpose
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test";
process.env.OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:1";
process.env.OPENAI_MODEL = process.env.OPENAI_MODEL ?? "test-model";
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "test-secret";
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads-test";
process.env.HUMAN_APPROVAL_MODE = "true";
process.env.DAILY_APPLICATION_LIMIT = "10";
process.env.PLAYWRIGHT_HEADLESS = "true";
