import Papa from "papaparse";
import type { CardInput } from "./types";

export class DelverCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelverCsvError";
  }
}

function parseQty(raw: string | undefined): number {
  if (!raw) return 1;
  const m = raw.trim().match(/^(\d+)x?$/i);
  if (!m) return 1;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Pull "Condition" and "Language" out of the legacy combined column
 * "(Condition,Language)" — e.g. "(, )" / "(, Portuguese)" / "(NM, English)".
 * Returns trimmed strings; empty when not present.
 */
function parseCombinedConditionLanguage(raw: string | undefined): { condition: string; language: string } {
  if (!raw) return { condition: "", language: "" };
  const inner = raw.trim().replace(/^\(/, "").replace(/\)$/, "");
  const parts = inner.split(",");
  const condition = (parts[0] ?? "").trim();
  const language = (parts[1] ?? "").trim();
  return { condition, language };
}

function parseFoil(raw: string | undefined): boolean {
  return (raw || "").trim().toLowerCase() === "foil";
}

function parseCardmarketId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseDelverCsv(csvText: string): CardInput[] {
  if (!csvText || !csvText.trim()) {
    throw new DelverCsvError("Empty CSV");
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    delimiter: "\t", // Delver Lens exports TSV despite the .csv extension
  });

  if (!parsed.data.length) {
    throw new DelverCsvError(
      parsed.errors[0]?.message
        ? `CSV parse failed: ${parsed.errors[0].message}`
        : "CSV contained no rows"
    );
  }

  const headers = parsed.meta.fields ?? [];
  if (!headers.includes("Scryfall ID")) {
    throw new DelverCsvError(
      "CSV must include a 'Scryfall ID' column — export from Delver Lens with Scryfall ID enabled."
    );
  }

  // Format detection: newer Delver Lens exports split condition + language into
  // separate columns; older exports use a single "(Condition,Language)" column.
  // Support both — we read whichever is present.
  const hasCombinedColumn = headers.includes("(Condition,Language)");
  const hasSplitColumns = headers.includes("Condition") || headers.includes("Language");

  const cards: CardInput[] = [];
  for (const row of parsed.data) {
    const scryfallId = (row["Scryfall ID"] || "").trim();
    if (!scryfallId) continue; // skip rows with missing ID — partial exports

    let condition = "";
    let language = "";
    if (hasSplitColumns) {
      condition = (row["Condition"] || "").trim();
      language = (row["Language"] || "").trim();
    } else if (hasCombinedColumn) {
      const split = parseCombinedConditionLanguage(row["(Condition,Language)"]);
      condition = split.condition;
      language = split.language;
    }

    cards.push({
      name: (row["Name"] || "").trim() || scryfallId, // Scryfall will overwrite on resolve
      scryfallId,
      cardmarket_id: parseCardmarketId(row["CardMarket ID"]),
      qty: parseQty(row["QuantityX"]),
      foil: parseFoil(row["Foil"]),
      language: language || "English",
      ...(condition ? { condition } : {}),
    });
  }

  if (!cards.length) {
    throw new DelverCsvError("No rows with Scryfall ID found");
  }

  return cards;
}
