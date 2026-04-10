import { withAuthParams } from "@/lib/api-helpers";
import { getConfig, getSetByCode, getCardsForSet, simulateBoxOpening, getDefaultPlayBoosterConfig, getDefaultCollectorBoosterConfig, getDefaultJumpstartBoosterConfig } from "@/lib/ev";

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
    const isJumpstart = set?.set_type === "draft_innovation" || set?.name?.toLowerCase().includes("jumpstart");
    boosterConfig = boosterType === "play"
      ? (isJumpstart ? getDefaultJumpstartBoosterConfig() : getDefaultPlayBoosterConfig())
      : getDefaultCollectorBoosterConfig();
  }

  const feeRate = config?.fee_rate ?? 0.05;
  const { cards } = await getCardsForSet(params.code, { boosterOnly: false, limit: 10000 });

  const data = simulateBoxOpening(cards, boosterConfig, {
    siftFloor: floor,
    feeRate,
    iterations,
    boxCost,
    quantity,
  });

  return { data };
}, "ev-simulate");
