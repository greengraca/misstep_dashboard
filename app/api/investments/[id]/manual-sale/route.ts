import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { recordManualSale } from "@/lib/investments/manual-sales";

interface Body {
  cardmarketId?: unknown;
  foil?: unknown;
  condition?: unknown;
  language?: unknown;
  qty?: unknown;
  unitPriceEur?: unknown;
  wasListed?: unknown;
  date?: unknown;
  note?: unknown;
}

export const POST = withAuthParams<{ id: string }>(async (req, _s, { id }) => {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const cardmarketId = Number(body.cardmarketId);
  const qty = Number(body.qty);
  const unitPriceEur = Number(body.unitPriceEur);
  const condition = typeof body.condition === "string" ? body.condition : "";
  const language = typeof body.language === "string" ? body.language : "English";
  const foil = body.foil === true;
  const wasListed = body.wasListed === true;
  const dateStr = typeof body.date === "string" ? body.date : null;
  const date = dateStr ? new Date(dateStr) : new Date();
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined;

  if (!Number.isFinite(cardmarketId) || cardmarketId <= 0) {
    return NextResponse.json({ error: "cardmarketId required" }, { status: 400 });
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: "qty must be > 0" }, { status: 400 });
  }
  if (!Number.isFinite(unitPriceEur) || unitPriceEur < 0) {
    return NextResponse.json({ error: "unitPriceEur must be ≥ 0" }, { status: 400 });
  }
  if (!condition) {
    return NextResponse.json({ error: "condition required" }, { status: 400 });
  }
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  const db = await getDb();
  const result = await recordManualSale({
    db,
    investmentId: id,
    cardmarketId,
    foil,
    condition,
    language,
    qty,
    unitPriceEur,
    wasListed,
    date,
    note,
  });

  switch (result.status) {
    case "ok":
      return NextResponse.json(result, { status: 201 });
    case "no-investment":
      return NextResponse.json({ error: "investment not found" }, { status: 404 });
    case "frozen":
      return NextResponse.json({ error: "investment is closed or archived" }, { status: 403 });
    case "cannot-grow-collection-kind":
      return NextResponse.json(
        { error: "off-the-books sales not allowed for collection-kind investments" },
        { status: 422 }
      );
    case "insufficient-remaining":
      return NextResponse.json(
        { error: `not enough remaining (have ${result.have}, want ${result.want})`, ...result },
        { status: 422 }
      );
  }
}, "investments-manual-sale");
