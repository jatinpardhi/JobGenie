const levels = ["debug", "info", "warn", "error"] as const;
type Level = (typeof levels)[number];

function log(level: Level, scope: string, msg: string, meta?: unknown) {
  const line = {
    t: new Date().toISOString(),
    level,
    scope,
    msg,
    ...(meta ? { meta } : {}),
  };
  // eslint-disable-next-line no-console
  console[level === "debug" ? "log" : level](JSON.stringify(line));
}

export const logger = {
  child: (scope: string) => ({
    debug: (m: string, meta?: unknown) => log("debug", scope, m, meta),
    info: (m: string, meta?: unknown) => log("info", scope, m, meta),
    warn: (m: string, meta?: unknown) => log("warn", scope, m, meta),
    error: (m: string, meta?: unknown) => log("error", scope, m, meta),
  }),
};
