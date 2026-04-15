import { withAuthReadParams, withAuthParams } from "@/lib/api-helpers";
import {
  ensureJumpstartWeights, appendJumpstartSession,
  getJumpstartThemes, seedJumpstartThemes, hasJumpstartSeedData,
} from "@/lib/ev";
import type { EvJumpstartSessionSubmit } from "@/lib/types";

async function ensureThemes(code: string) {
  let themes = await getJumpstartThemes(code);
  if (!themes && hasJumpstartSeedData(code)) {
    await seedJumpstartThemes(code);
    themes = await getJumpstartThemes(code);
  }
  return themes;
}

export const GET = withAuthReadParams<{ code: string }>(async (_req, params) => {
  const code = params.code.toLowerCase();
  await ensureThemes(code);
  const data = await ensureJumpstartWeights(code);
  return { data };
}, "ev-jumpstart-weights-get");

export const POST = withAuthParams<{ code: string }>(async (req, _session, params) => {
  const code = params.code.toLowerCase();
  const themes = await ensureThemes(code);
  if (!themes) {
    return Response.json(
      { error: `No Jumpstart theme data available for set ${code}` },
      { status: 404 }
    );
  }

  const body = (await req.json()) as Partial<EvJumpstartSessionSubmit>;
  const tier_counts = {
    common: Math.max(0, Number(body?.tier_counts?.common ?? 0)),
    rare: Math.max(0, Number(body?.tier_counts?.rare ?? 0)),
    mythic: Math.max(0, Number(body?.tier_counts?.mythic ?? 0)),
  };
  const theme_counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(body?.theme_counts ?? {})) {
    const n = Math.max(0, Number(v));
    if (n > 0) theme_counts[k] = n;
  }
  const packs = Math.max(0, Number(body?.packs ?? 0));
  if (packs === 0) {
    return Response.json({ error: "packs must be > 0" }, { status: 400 });
  }

  const data = await appendJumpstartSession(code, { tier_counts, theme_counts, packs });
  return { data };
}, "ev-jumpstart-weights-submit");
