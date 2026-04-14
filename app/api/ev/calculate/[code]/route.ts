import { withAuthReadParams } from "@/lib/api-helpers";
import { getConfig, getSetByCode, getCardsForSet, calculateEv, getDefaultPlayBoosterConfig, getDefaultCollectorBoosterConfig, getDefaultJumpstartBoosterConfig, getDefaultMB2BoosterConfig } from "@/lib/ev";

export const GET = withAuthReadParams<{ code: string }>(async (req, params) => {
  const boosterType = (req.nextUrl.searchParams.get("booster") || "play") as "play" | "collector";
  const floor = parseFloat(req.nextUrl.searchParams.get("floor") || "0.25");

  const config = await getConfig(params.code);
  let boosterConfig;
  if (config) {
    boosterConfig = boosterType === "play" ? config.play_booster : config.collector_booster;
  }
  if (!boosterConfig) {
    const set = await getSetByCode(params.code);
    const isMB2 = set?.name?.toLowerCase().includes("mystery booster 2");
    const isJumpstart = !isMB2 && (set?.set_type === "draft_innovation" || set?.name?.toLowerCase().includes("jumpstart"));
    boosterConfig = boosterType === "play"
      ? (isMB2 ? getDefaultMB2BoosterConfig() : isJumpstart ? getDefaultJumpstartBoosterConfig() : getDefaultPlayBoosterConfig())
      : getDefaultCollectorBoosterConfig();
  }

  const feeRate = config?.fee_rate ?? 0.05;
  const { cards } = await getCardsForSet(params.code, { boosterOnly: false, limit: 10000 });

  const data = calculateEv(cards, boosterConfig, {
    siftFloor: floor,
    feeRate,
    setCode: params.code,
    boosterType,
  });

  return { data };
}, "ev-calculate");
