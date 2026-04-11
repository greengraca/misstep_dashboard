// app/api/storage/rebuild/route.ts
import { withAuth } from "@/lib/api-helpers";
import { rebuildStorageSlots } from "@/lib/storage-db";
import { logActivity } from "@/lib/activity";

export const POST = withAuth(async (_req, session) => {
  const result = await rebuildStorageSlots();

  logActivity(
    "sync",
    "storage_slots",
    "rebuild",
    `slots=${result.counts.slots} placed=${result.counts.placedSlots} stale=${result.overrides.staleMissingSlot.length + result.overrides.staleMissingTarget.length + result.overrides.staleRegression.length} durationMs=${result.durationMs}`,
    "system",
    session.user?.name ?? "unknown"
  );

  return { data: result };
}, "storage-rebuild");
