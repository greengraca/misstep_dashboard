import { withAuthParams } from "@/lib/api-helpers";
import { getConfig, getSetByCode, getCardsForSet, simulateBoxOpening, getDefaultPlayBoosterConfig, getDefaultCollectorBoosterConfig, getDefaultJumpstartBoosterConfig, getDefaultMB2BoosterConfig, collectExtraSetCodes } from "@/lib/ev";

export const POST = withAuthParams<{ code: string }>(async (req, _session, params) => {
  const body = await req.json();
  const boosterType = (body.booster || "play") as "play" | "collector";
  const iterations = Math.max(1, Math.min(body.iterations || 10000, 50000));
  const floor = body.floor ?? 0.25;
  const boxCost = body.boxCost ?? undefined;
  const quantity = body.quantity ?? 1;

  const config = await getConfig(params.code);
  let boosterConfig;
  if (config) {
    boosterConfig = boosterType === "play" ? config.play_booster : config.collector_booster;
  }
  if (!boosterConfig) {
    const set = await getSetByCode(params.code);
    const isMB2 = set?.name?.toLowerCase().includes("mystery booster 2");
    // Detect Jumpstart by name only — set_type "draft_innovation" also covers
    // Modern Horizons, Commander Legends, Conspiracy, LOTR, etc., none of which
    // use Jumpstart boosters.
    const isJumpstart = !isMB2 && !!set?.name?.toLowerCase().includes("jumpstart");
    boosterConfig = boosterType === "play"
      ? (isMB2 ? getDefaultMB2BoosterConfig() : isJumpstart ? getDefaultJumpstartBoosterConfig() : getDefaultPlayBoosterConfig())
      : getDefaultCollectorBoosterConfig();
  }

  const feeRate = config?.fee_rate ?? 0.05;
  const { cards } = await getCardsForSet(params.code, { boosterOnly: false, limit: 10000 });
  // Cross-set pools (Masterpieces, SPG, cross-set commanders): must match
  // the hydration the /api/ev/calculate route does or MC mean drifts below
  // deterministic because outcomes filtered by foreign set_codes match zero
  // cards and silently contribute €0.
  for (const extra of collectExtraSetCodes(boosterConfig, params.code)) {
    const { cards: extraCards } = await getCardsForSet(extra, { boosterOnly: false, limit: 10000 });
    cards.push(...extraCards);
  }

  const data = simulateBoxOpening(cards, boosterConfig, {
    siftFloor: floor,
    feeRate,
    iterations,
    boxCost,
    quantity,
  });

  return { data };
}, "ev-simulate");
