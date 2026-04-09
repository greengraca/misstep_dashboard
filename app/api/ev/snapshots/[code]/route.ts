import { withAuthReadParams } from "@/lib/api-helpers";
import { getSnapshots } from "@/lib/ev";

export const GET = withAuthReadParams<{ code: string }>(async (req, params) => {
  const days = parseInt(req.nextUrl.searchParams.get("days") || "90", 10);
  const data = await getSnapshots(params.code, days);
  return { data };
}, "ev-snapshots-read");
