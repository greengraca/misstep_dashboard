import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import {
  getInvestment,
  listLots,
  LOT_SORT_FIELDS,
  type LotSortField,
} from "@/lib/investments/service";

export const GET = withAuthParams<{ id: string }>(async (req, _s, { id }) => {
  const inv = await getInvestment(id);
  if (!inv) return NextResponse.json({ error: "investment not found" }, { status: 404 });
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const foilParam = url.searchParams.get("foil");
  const foil = foilParam === "true" ? true : foilParam === "false" ? false : undefined;
  const language = url.searchParams.get("language") ?? undefined;
  const minRemainingStr = url.searchParams.get("minRemaining");
  const minRemaining =
    minRemainingStr && !Number.isNaN(Number(minRemainingStr))
      ? Number(minRemainingStr)
      : undefined;
  const sortRaw = url.searchParams.get("sort");
  const sort = (LOT_SORT_FIELDS as readonly string[]).includes(sortRaw ?? "")
    ? (sortRaw as LotSortField)
    : undefined;
  const dirRaw = url.searchParams.get("dir");
  const dir: "asc" | "desc" | undefined =
    dirRaw === "asc" || dirRaw === "desc" ? dirRaw : undefined;
  const pageStr = url.searchParams.get("page");
  const pageSizeStr = url.searchParams.get("pageSize");
  const page =
    pageStr && !Number.isNaN(Number(pageStr)) ? Number(pageStr) : undefined;
  const pageSize =
    pageSizeStr && !Number.isNaN(Number(pageSizeStr))
      ? Number(pageSizeStr)
      : undefined;
  const result = await listLots({
    id,
    search,
    foil,
    language,
    minRemaining,
    sort,
    dir,
    page,
    pageSize,
  });
  return result;
}, "investments-lots-list");
