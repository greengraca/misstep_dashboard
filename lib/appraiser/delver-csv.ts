import Papa from "papaparse";
import type { CardInput } from "./types";

export class DelverCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelverCsvError";
  }
}

// Placeholder — swap in real column mapping once a Delver Lens sample CSV arrives.
// Keep the signature stable: `(csvText) => CardInput[]` on success, throws DelverCsvError on failure.
export function parseDelverCsv(csvText: string): CardInput[] {
  if (!csvText || !csvText.trim()) {
    throw new DelverCsvError("Empty CSV");
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length && parsed.data.length === 0) {
    throw new DelverCsvError(`CSV parse failed: ${parsed.errors[0].message}`);
  }

  // TODO swap this in once a Delver Lens sample is provided.
  throw new DelverCsvError(
    "Unknown CSV format — send a sample Delver Lens CSV so we can wire the column mapping."
  );
}
