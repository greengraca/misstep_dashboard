// Backfill investment lots from currently-tagged Cardmarket stock.
//
// Why this exists: prior to the cardmarket.ts fix that wires `comment`
// through the post-aggregation snapshot, every box/product/customer_bulk
// investment's lot ledger was silently empty even when the user had
// pasted MS-XXXX into their listings' comment fields. The bug shipped
// in 16da6df and survived the 820d729 refactor.
//
// What this does: for every listing investment with a code, scan
// dashboard_cm_stock for rows whose comment carries that code, group
// by lot tuple ({cardmarket_id, foil, condition, language}), and
// idempotently grow each matching lot so qty_opened ≥ summed listing qty
// (counting any already-sold qty too — qty_opened is a lifetime count,
// so we keep `qty_opened ≥ tagged_stock + qty_sold`). Collection-kind
// investments are skipped (their lots are pre-set at conversion time).
//
// Idempotent: safe to re-run. Uses dry-run by default — pass --apply to
// write. Optionally --code=MS-XXXX to scope to one investment.

try {
  process.loadEnvFile(".env");
} catch {
  // .env missing
}

import { ObjectId } from "mongodb";
import { getDb, getClient } from "../lib/mongodb";
import { parseInvestmentTag } from "../lib/investments/codes";

interface InvestmentDoc {
  _id: ObjectId;
  name: string;
  code?: string;
  status: string;
  source?: { kind?: string };
}

interface StockDoc {
  comment?: string | null;
  productId?: number;
  foil?: boolean;
  condition: string;
  language?: string;
  qty: number;
}

interface LotDoc {
  _id: ObjectId;
  qty_opened: number;
  qty_sold: number;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const codeArg = process.argv
    .find((a) => a.startsWith("--code="))
    ?.slice("--code=".length)
    ?.toUpperCase();

  const db = await getDb();

  const filter: Record<string, unknown> = {
    code: { $exists: true },
    status: "listing",
  };
  if (codeArg) filter.code = codeArg;

  const investments = await db
    .collection<InvestmentDoc>("dashboard_investments")
    .find(filter)
    .toArray();

  console.log(
    `Mode: ${apply ? "APPLY" : "DRY RUN"}${codeArg ? ` (scoped to ${codeArg})` : ""}`
  );
  console.log(`Loaded ${investments.length} listing investments with codes\n`);

  let lotsCreated = 0;
  let lotsBumped = 0;
  let skippedCollectionWithoutLot = 0;
  let skippedCollectionWithLot = 0;
  let unchangedLots = 0;
  let untaggedListingsRemoved = 0;

  for (const inv of investments) {
    const code = inv.code as string;
    const kind = inv.source?.kind ?? "(unknown)";
    const isCollection = kind === "collection";

    const escapedCode = code.replace(/-/g, "\\-");
    const taggedStock = await db
      .collection<StockDoc>("dashboard_cm_stock")
      .find({
        comment: { $regex: `\\b${escapedCode}\\b`, $options: "i" },
        qty: { $gt: 0 },
        productId: { $exists: true },
      })
      .toArray();
    if (taggedStock.length === 0) continue;

    type Tuple = {
      cardmarket_id: number;
      foil: boolean;
      condition: string;
      language: string;
      qty_total: number;
    };
    const byTuple = new Map<string, Tuple>();
    for (const r of taggedStock) {
      // Guard against regex picking up a different code that happens to
      // share characters — only count rows whose parsed tag matches.
      const tag = parseInvestmentTag(r.comment);
      if (tag !== code) {
        untaggedListingsRemoved++;
        continue;
      }
      if (typeof r.productId !== "number") continue;
      const cardmarket_id = r.productId;
      const foil = !!r.foil;
      const condition = r.condition;
      const language = r.language || "English";
      const qty = Number(r.qty) || 0;
      if (qty <= 0) continue;
      const key = `${cardmarket_id}|${foil}|${condition}|${language}`;
      const existing = byTuple.get(key);
      if (existing) existing.qty_total += qty;
      else byTuple.set(key, { cardmarket_id, foil, condition, language, qty_total: qty });
    }
    if (byTuple.size === 0) continue;

    console.log(
      `── ${code} — ${inv.name} — kind=${kind} — ${taggedStock.length} tagged listings → ${byTuple.size} tuples`
    );

    for (const [key, t] of byTuple.entries()) {
      const lot = await db
        .collection<LotDoc>("dashboard_investment_lots")
        .findOne(
          {
            investment_id: inv._id,
            cardmarket_id: t.cardmarket_id,
            foil: t.foil,
            condition: t.condition,
            language: t.language,
          },
          { projection: { _id: 1, qty_opened: 1, qty_sold: 1 } }
        );

      if (!lot) {
        if (isCollection) {
          // Collection-kind doesn't grow new lots from tags — the user
          // pre-declared the lot set at conversion. Surface as a hint.
          console.log(
            `  SKIP collection-kind missing lot: ${key} stock_qty=${t.qty_total}`
          );
          skippedCollectionWithoutLot++;
          continue;
        }
        if (apply) {
          await db.collection("dashboard_investment_lots").insertOne({
            investment_id: inv._id,
            cardmarket_id: t.cardmarket_id,
            foil: t.foil,
            condition: t.condition,
            language: t.language,
            qty_opened: t.qty_total,
            qty_sold: 0,
            qty_remaining: t.qty_total,
            proceeds_eur: 0,
            cost_basis_per_unit: null,
            last_grown_at: new Date(),
          });
        }
        console.log(
          `  ${apply ? "CREATE" : "would create"} lot: ${key} qty_opened=${t.qty_total}`
        );
        lotsCreated++;
        continue;
      }

      if (isCollection) {
        // Existing pre-set lot for collection-kind — leave it alone, the
        // user's conversion-time qty_opened is authoritative.
        skippedCollectionWithLot++;
        continue;
      }

      // qty_opened is a lifetime count; never let it slide below the
      // currently-tagged stock plus already-sold qty.
      const desiredOpened = Math.max(lot.qty_opened, t.qty_total + lot.qty_sold);
      if (desiredOpened <= lot.qty_opened) {
        unchangedLots++;
        continue;
      }
      const delta = desiredOpened - lot.qty_opened;
      if (apply) {
        await db.collection("dashboard_investment_lots").updateOne(
          { _id: lot._id },
          {
            $set: {
              qty_opened: desiredOpened,
              qty_remaining: desiredOpened - lot.qty_sold,
              last_grown_at: new Date(),
            },
          }
        );
      }
      console.log(
        `  ${apply ? "BUMP  " : "would bump  "} lot: ${key} qty_opened ${lot.qty_opened} → ${desiredOpened} (+${delta})`
      );
      lotsBumped++;
    }
  }

  console.log(`\n══════ SUMMARY ══════`);
  console.log(`Lots ${apply ? "created" : "would be created"}:                        ${lotsCreated}`);
  console.log(`Lots ${apply ? "bumped" : "would be bumped"}:                          ${lotsBumped}`);
  console.log(`Lots unchanged (already correct):                  ${unchangedLots}`);
  console.log(`Skipped (collection-kind, lot exists):             ${skippedCollectionWithLot}`);
  console.log(`Skipped (collection-kind, no pre-existing lot):    ${skippedCollectionWithoutLot}`);
  console.log(`Stock rows skipped (regex match but tag mismatch): ${untaggedListingsRemoved}`);
  if (!apply) console.log(`\nDry run only. Re-run with --apply to write.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await getClient();
    await c.close();
  });
