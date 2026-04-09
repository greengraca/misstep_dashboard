import { withAuthReadParams, withAuthParams } from "@/lib/api-helpers";
import {
  getConfig, saveConfig, getSetByCode,
  getDefaultPlayBoosterConfig, getDefaultCollectorBoosterConfig, getDefaultJumpstartBoosterConfig,
} from "@/lib/ev";
import type { EvConfigInput } from "@/lib/types";

export const GET = withAuthReadParams<{ code: string }>(async (_req, params) => {
  const config = await getConfig(params.code);
  if (config) return { data: config };

  // Detect set type for appropriate defaults
  const set = await getSetByCode(params.code);
  const isJumpstart = set?.set_type === "draft_innovation" || set?.name?.toLowerCase().includes("jumpstart");

  return {
    data: {
      _id: "",
      set_code: params.code,
      updated_at: "",
      updated_by: "",
      sift_floor: 0.25,
      fee_rate: 0.05,
      play_booster: isJumpstart ? getDefaultJumpstartBoosterConfig() : getDefaultPlayBoosterConfig(),
      collector_booster: isJumpstart ? null : getDefaultCollectorBoosterConfig(),
    },
  };
}, "ev-config-read");

export const PUT = withAuthParams<{ code: string }>(async (req, session, params) => {
  const body = (await req.json()) as EvConfigInput;
  await saveConfig(params.code, body, session.user?.name || "unknown");
  return { data: { success: true } };
}, "ev-config-save");
