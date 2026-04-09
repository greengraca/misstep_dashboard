import { withAuthReadParams, withAuthParams } from "@/lib/api-helpers";
import {
  getConfig, getCardsForSet,
  calculateJumpstartEv, simulateJumpstartBox,
  getJumpstartThemes, seedJumpstartThemes, hasJumpstartSeedData,
} from "@/lib/ev";

/** Load themes from DB, auto-seed from hardcoded data if DB is empty */
async function loadThemes(code: string) {
  let themes = await getJumpstartThemes(code);
  if (!themes && hasJumpstartSeedData(code)) {
    await seedJumpstartThemes(code);
    themes = await getJumpstartThemes(code);
  }
  return themes;
}

export const GET = withAuthReadParams<{ code: string }>(async (req, params) => {
  const floor = parseFloat(req.nextUrl.searchParams.get("floor") || "0.25");
  const code = params.code.toLowerCase();

  const themes = await loadThemes(code);
  if (!themes) {
    return Response.json(
      { error: `No Jumpstart theme data available for set ${code}` },
      { status: 404 }
    );
  }

  const config = await getConfig(code);
  const feeRate = config?.fee_rate ?? 0.05;
  const packsPerBox = config?.play_booster?.packs_per_box ?? 24;
  const { cards } = await getCardsForSet(code, { boosterOnly: false, limit: 10000 });

  const data = calculateJumpstartEv(cards, themes, {
    siftFloor: floor,
    feeRate,
    setCode: code,
    packsPerBox,
  });

  return { data };
}, "ev-jumpstart-calculate");

export const POST = withAuthParams<{ code: string }>(async (req, _session, params) => {
  const body = await req.json();
  const code = params.code.toLowerCase();
  const iterations = Math.min(body.iterations || 10000, 50000);
  const floor = body.floor ?? 0.25;
  const boxCost = body.boxCost ?? undefined;
  const quantity = body.quantity ?? 1;

  const themes = await loadThemes(code);
  if (!themes) {
    return Response.json(
      { error: `No Jumpstart theme data available for set ${code}` },
      { status: 404 }
    );
  }

  const config = await getConfig(code);
  const feeRate = config?.fee_rate ?? 0.05;
  const packsPerBox = config?.play_booster?.packs_per_box ?? 24;
  const { cards } = await getCardsForSet(code, { boosterOnly: false, limit: 10000 });

  const data = simulateJumpstartBox(cards, themes, {
    siftFloor: floor,
    feeRate,
    packsPerBox,
    iterations,
    boxCost,
    quantity,
  });

  return { data };
}, "ev-jumpstart-simulate");
