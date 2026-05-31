export const env = {
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  openaiKey: process.env.OPENAI_API_KEY ?? "ollama",
  openaiModel: process.env.OPENAI_MODEL ?? "llama3.1",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "http://localhost:11434/v1",
  nextauthSecret: process.env.NEXTAUTH_SECRET ?? "dev-secret",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  headless: (process.env.PLAYWRIGHT_HEADLESS ?? "true") === "true",
  humanApproval: (process.env.HUMAN_APPROVAL_MODE ?? "true") === "true",
  dailyLimit: Number(process.env.DAILY_APPLICATION_LIMIT ?? 25),
  userAgent:
    process.env.USER_AGENT ??
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};
