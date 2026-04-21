import { withAuthParams } from "@/lib/api-helpers";
import { listLots } from "@/lib/investments/service";

export const GET = withAuthParams<{ id: string }>(async (req, _s, { id }) => {
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const foilParam = url.searchParams.get("foil");
  const foil = foilParam === "true" ? true : foilParam === "false" ? false : undefined;
  const minRemainingStr = url.searchParams.get("minRemaining");
  const minRemaining =
    minRemainingStr && !Number.isNaN(Number(minRemainingStr))
      ? Number(minRemainingStr)
      : undefined;
  const lots = await listLots({ id, search, foil, minRemaining });
  return { lots };
}, "investments-lots-list");
