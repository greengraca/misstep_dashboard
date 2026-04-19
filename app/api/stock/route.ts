import { NextResponse } from "next/server";
import { withAuthRead } from "@/lib/api-helpers";
import {
  searchStock,
  STOCK_SORT_FIELDS,
  STOCK_CONDITIONS,
  type StockSortField,
  type StockCondition,
} from "@/lib/stock";

function parseOptionalNumber(v: string | null): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export const GET = withAuthRead(async (req) => {
  const sp = req.nextUrl.searchParams;

  const name = sp.get("name") || undefined;
  const set = sp.get("set") || undefined;
  const language = sp.get("language") || undefined;

  const conditionRaw = sp.get("condition");
  let condition: StockCondition | undefined;
  if (conditionRaw) {
    if (!(STOCK_CONDITIONS as readonly string[]).includes(conditionRaw)) {
      return NextResponse.json({ error: "invalid condition" }, { status: 400 });
    }
    condition = conditionRaw as StockCondition;
  }

  const foilRaw = sp.get("foil");
  let foil: boolean | undefined;
  if (foilRaw !== null && foilRaw !== "") {
    if (foilRaw !== "true" && foilRaw !== "false") {
      return NextResponse.json({ error: "invalid foil" }, { status: 400 });
    }
    foil = foilRaw === "true";
  }

  const signedRaw = sp.get("signed");
  let signed: boolean | undefined;
  if (signedRaw !== null && signedRaw !== "") {
    if (signedRaw !== "true" && signedRaw !== "false") {
      return NextResponse.json({ error: "invalid signed" }, { status: 400 });
    }
    signed = signedRaw === "true";
  }

  const minPrice = parseOptionalNumber(sp.get("minPrice"));
  const maxPrice = parseOptionalNumber(sp.get("maxPrice"));
  const minQty = parseOptionalNumber(sp.get("minQty"));
  const minOverpricedPct = parseOptionalNumber(sp.get("minOverpricedPct"));
  for (const [label, v] of [
    ["minPrice", minPrice],
    ["maxPrice", maxPrice],
    ["minQty", minQty],
  ] as const) {
    if (Number.isNaN(v)) {
      return NextResponse.json({ error: `invalid ${label}` }, { status: 400 });
    }
    if (typeof v === "number" && v < 0) {
      return NextResponse.json({ error: `${label} must be >= 0` }, { status: 400 });
    }
  }
  if (Number.isNaN(minOverpricedPct)) {
    return NextResponse.json({ error: "invalid minOverpricedPct" }, { status: 400 });
  }

  const sortRaw = sp.get("sort") || "lastSeenAt";
  if (!(STOCK_SORT_FIELDS as readonly string[]).includes(sortRaw)) {
    return NextResponse.json({ error: "invalid sort" }, { status: 400 });
  }
  const sort = sortRaw as StockSortField;

  const dirRaw = sp.get("dir") || "desc";
  if (dirRaw !== "asc" && dirRaw !== "desc") {
    return NextResponse.json({ error: "invalid dir" }, { status: 400 });
  }

  const pageParsed = parseOptionalNumber(sp.get("page"));
  const pageSizeParsed = parseOptionalNumber(sp.get("pageSize"));
  if (Number.isNaN(pageParsed) || Number.isNaN(pageSizeParsed)) {
    return NextResponse.json({ error: "invalid pagination" }, { status: 400 });
  }
  const page = Math.max(1, Math.floor(pageParsed ?? 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(pageSizeParsed ?? 50)));

  const result = await searchStock({
    name,
    set,
    condition,
    foil,
    language,
    minPrice: typeof minPrice === "number" ? minPrice : undefined,
    maxPrice: typeof maxPrice === "number" ? maxPrice : undefined,
    minQty: typeof minQty === "number" ? minQty : undefined,
    minOverpricedPct:
      typeof minOverpricedPct === "number" ? minOverpricedPct / 100 : undefined,
    signed,
    sort,
    dir: dirRaw,
    page,
    pageSize,
  });

  return result;
}, "stock-search");
