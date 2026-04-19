import { withAuthReadParams } from "@/lib/api-helpers";
import { getConfig, getSetByCode, getCardsForSet, calculateEv, getDefaultPlayBoosterConfig, getDefaultCollectorBoosterConfig, getDefaultJumpstartBoosterConfig, getDefaultMB2BoosterConfig, getDefaultDraftBoosterConfig, isDraftBoosterEra, collectExtraSetCodes, masterpieceRefFor } from "@/lib/ev";
import { getDb } from "@/lib/mongodb";
import type { EvBoosterConfig } from "@/lib/types";

async function setNamesByCode(codes: string[]): Promise<Record<string, string>> {
  if (codes.length === 0) return {};
  const db = await getDb();
  const docs = await db
    .collection("dashboard_ev_sets")
    .find({ code: { $in: codes } }, { projection: { code: 1, name: 1 } })
    .toArray();
  const out: Record<string, string> = {};
  for (const d of docs) out[d.code as string] = d.name as string;
  return out;
}

/**
 * Strip outcomes whose set_codes don't include the primary set (i.e.
 * masterpieces / cross-set pools) and renormalize each affected slot's
 * remaining outcome probabilities to sum to 1. Returns a new config so the
 * default helpers' return values aren't mutated across requests.
 */
function withoutMasterpieces(config: EvBoosterConfig, primarySetCode: string): EvBoosterConfig {
  const slots = config.slots.map((slot) => {
    const filtered = slot.outcomes.filter((o) => {
      const codes = o.filter.set_codes;
      if (!codes || codes.length === 0) return true;
      return codes.includes(primarySetCode);
    });
    if (filtered.length === slot.outcomes.length) return slot;
    const total = filtered.reduce((s, o) => s + o.probability, 0);
    if (total <= 0) return { ...slot, outcomes: filtered };
    const rescaled = filtered.map((o) => ({ ...o, probability: o.probability / total }));
    return { ...slot, outcomes: rescaled };
  });
  return { ...config, slots };
}

export const GET = withAuthReadParams<{ code: string }>(async (req, params) => {
  const boosterType = (req.nextUrl.searchParams.get("booster") || "play") as "play" | "collector";
  const floor = parseFloat(req.nextUrl.searchParams.get("floor") || "0.25");
  const masterpiecesEnabled = req.nextUrl.searchParams.get("masterpieces") !== "off";

  const config = await getConfig(params.code);
  let boosterConfig;
  if (config) {
    boosterConfig = boosterType === "play" ? config.play_booster : config.collector_booster;
  }
  if (!boosterConfig) {
    const set = await getSetByCode(params.code);
    const isMB2 = set?.name?.toLowerCase().includes("mystery booster 2");
    const isJumpstart = !isMB2 && (set?.set_type === "draft_innovation" || set?.name?.toLowerCase().includes("jumpstart"));
    const isDraftEra = !isMB2 && !isJumpstart && isDraftBoosterEra(set);
    boosterConfig = boosterType === "play"
      ? (isMB2 ? getDefaultMB2BoosterConfig()
        : isJumpstart ? getDefaultJumpstartBoosterConfig()
        : isDraftEra ? getDefaultDraftBoosterConfig({ masterpiece: masterpieceRefFor(params.code) })
        : getDefaultPlayBoosterConfig())
      : getDefaultCollectorBoosterConfig();
  }

  if (!masterpiecesEnabled) {
    boosterConfig = withoutMasterpieces(boosterConfig, params.code);
  }

  const feeRate = config?.fee_rate ?? 0.05;
  const { cards } = await getCardsForSet(params.code, { boosterOnly: false, limit: 10000 });
  // Cross-set pools (e.g. Masterpieces from mp2): fetch referenced sets and
  // merge into the calc's card pool. matchCardsToFilter respects set_codes.
  for (const extra of collectExtraSetCodes(boosterConfig, params.code)) {
    const { cards: extraCards } = await getCardsForSet(extra, { boosterOnly: false, limit: 10000 });
    cards.push(...extraCards);
  }

  const data = calculateEv(cards, boosterConfig, {
    siftFloor: floor,
    feeRate,
    setCode: params.code,
    boosterType,
  });

  // Set names for any set referenced in the top tables — used to build
  // Cardmarket links on card name cells.
  const referencedCodes = [
    ...new Set([
      ...data.top_ev_cards.map((c) => c.set),
      ...data.top_price_cards.map((c) => c.set),
    ]),
  ];
  const set_names = await setNamesByCode(referencedCodes);

  return { data, set_names };
}, "ev-calculate");
