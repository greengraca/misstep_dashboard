import { after } from "next/server";
import { getDb } from "@/lib/mongodb";

export type ErrorLogLevel = "error" | "warn" | "info";

let ttlEnsured = false;

async function ensureIndexes() {
  if (ttlEnsured) return;
  try {
    const db = await getDb();
    const col = db.collection("dashboard_error_log");
    await col.createIndex(
      { created_at: 1 },
      { expireAfterSeconds: 30 * 24 * 60 * 60, name: "ttl_30d" }
    );
    await col.createIndex(
      { level: 1, timestamp: -1 },
      { name: "level_timestamp" }
    );
    ttlEnsured = true;
  } catch {
    // Indexes may already exist — that's fine
    ttlEnsured = true;
  }
}

export function logError(
  level: ErrorLogLevel,
  source: string,
  message: string,
  details: Record<string, unknown> | null = null
): void {
  const doLog = async () => {
    if (!process.env.MONGODB_URI) return;
    try {
      await ensureIndexes();
      const db = await getDb();
      await db.collection("dashboard_error_log").insertOne({
        level,
        source,
        message,
        details,
        timestamp: new Date().toISOString(),
        created_at: new Date(),
      });
    } catch (err) {
      console.error("Failed to write error log:", err);
    }
  };
  try {
    after(doLog);
  } catch {
    doLog();
  }
}

/** Log an API error (fire-and-forget) */
export function logApiError(source: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logError("error", source, message, stack ? { stack } : null);
}

/** Log an auth failure (fire-and-forget) */
export function logAuthFailure(source: string, details: Record<string, unknown> | null = null): void {
  logError("warn", source, "Authentication failure", details);
}
