import { withAuthParams } from "@/lib/api-helpers";
import { syncCards, syncMB2Cards } from "@/lib/ev";
import { logActivity } from "@/lib/activity";

export const POST = withAuthParams<{ code: string }>(async (_req, session, params) => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      try {
        if (params.code === "mb2") {
          const result = await syncMB2Cards((pct, phase) => send({ pct, phase }));
          const totalCards = result.native.total + result.pickups.total;
          logActivity("sync", "ev_cards", params.code, `Synced ${totalCards} cards (${result.native.total} native + ${result.pickups.total} pick-ups)`, "system", session.user?.name || "unknown");
          send({ done: true, data: { added: result.native.added + result.pickups.added, updated: result.native.updated + result.pickups.updated, total: totalCards } });
        } else {
          const result = await syncCards(params.code, (pct) => send({ pct, phase: "Syncing cards..." }));
          logActivity("sync", "ev_cards", params.code, `Synced ${result.total} cards`, "system", session.user?.name || "unknown");
          send({ done: true, data: result });
        }
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
