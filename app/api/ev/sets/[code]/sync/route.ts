import { withAuthParams } from "@/lib/api-helpers";
import { syncCards } from "@/lib/ev";
import { logActivity } from "@/lib/activity";

// Note: mb2 used to dispatch to a dedicated `syncMB2Cards` that fetched the
// plst pickup reprints over /cards/collection. Pickups now live under their
// real `set: "plst"` and the EV pool is composed via VIRTUAL_POOLS at read
// time (lib/ev-virtual-pools.ts), so the per-set Sync only needs to refresh
// the 385 native mb2 cards. The full plst catalog stays fresh via the 3-day
// Scryfall bulk sync (.github/workflows/ev-sync.yml).
export const POST = withAuthParams<{ code: string }>(async (_req, session, params) => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      try {
        const result = await syncCards(params.code, (pct) => send({ pct, phase: "Syncing cards..." }));
        logActivity("sync", "ev_cards", params.code, `Synced ${result.total} cards`, "system", session.user?.name || "unknown");
        send({ done: true, data: result });
      } catch (err) {
        send({ error: String(err) });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
}, "ev-set-sync");
