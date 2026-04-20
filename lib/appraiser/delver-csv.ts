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

function parseLanguage(raw: string | undefined): string {
  if (!raw) return "English";
  // Format: "(Condition, Language)" — e.g. "(, )" or "(, Portuguese)" or "(NM, English)"
  const inner = raw.trim().replace(/^\(/, "").replace(/\)$/, "");
  const parts = inner.split(",");
  if (parts.length < 2) return "English";
  const lang = parts[1].trim();
  return lang || "English";
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

  const cards: CardInput[] = [];
  for (const row of parsed.data) {
    const scryfallId = (row["Scryfall ID"] || "").trim();
    if (!scryfallId) continue; // skip rows with missing ID — partial exports
    cards.push({
      name: (row["Name"] || "").trim() || scryfallId, // Scryfall will overwrite on resolve
      scryfallId,
      cardmarket_id: parseCardmarketId(row["CardMarket ID"]),
      qty: parseQty(row["QuantityX"]),
      foil: parseFoil(row["Foil"]),
      language: parseLanguage(row["(Condition,Language)"]),
    });
  }

  if (!cards.length) {
    throw new DelverCsvError("No rows with Scryfall ID found");
  }

  return cards;
}
