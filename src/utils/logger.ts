type Level = "debug" | "info" | "warn" | "error";

export function createLogger(level: Level) {
  const levels: Record<Level, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };
  const threshold = levels[level] ?? 20;

  const log = (lvl: Level, msg: string, meta?: Record<string, unknown>) => {
    if (levels[lvl] < threshold) return;
    const payload = meta ? ` ${JSON.stringify(meta)}` : "";
    // console used intentionally; structured enough for now
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: lvl,
        msg,
        time: new Date().toISOString(),
        ...meta,
      })
    );
  };

  return {
    debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
