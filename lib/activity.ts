import { after } from "next/server";
import { getDb } from "@/lib/mongodb";

export type ActivityAction = "create" | "update" | "delete" | "sync" | "join" | "leave" | "detect" | "end";

let indexesEnsured = false;

async function ensureIndexes() {
  if (indexesEnsured) return;
  try {
    const db = await getDb();
    const col = db.collection("dashboard_activity_log");
    await col.createIndex({ timestamp: -1 }, { name: "timestamp_desc" });
    await col.createIndex(
      { entity_type: 1, timestamp: -1 },
      { name: "entity_type_timestamp" }
    );
    indexesEnsured = true;
  } catch {
    // Indexes may already exist — that's fine
    indexesEnsured = true;
  }
}

/**
 * Log activity to the audit trail. Deferred via after() so it doesn't
 * block the API response. Safe to call without await.
 */
export function logActivity(
  action: ActivityAction,
  entityType: string,
  entityId: string,
  details: string | Record<string, unknown>,
  userId: string,
  userName: string
): void {
  const doLog = async () => {
    try {
      await ensureIndexes();
      const db = await getDb();
      await db.collection("dashboard_activity_log").insertOne({
        action,
        entity_type: entityType,
        entity_id: entityId,
        details,
        user_id: userId,
        user_name: userName,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to log activity:", err);
    }
  };
  try {
    after(doLog);
  } catch {
    // Outside request context (e.g., scripts/tests) — fire and forget
    doLog();
  }
}
