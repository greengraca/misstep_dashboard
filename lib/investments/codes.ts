// Investment provenance codes — short tags that the user pastes into a
// Cardmarket listing's comment so the listing (and its eventual sale)
// attributes back to the right investment.
//
// Format: `MS-XXXX` where XXXX is 4 hex chars. ~65k codes total, plenty
// for a personal trading operation. Collisions handled by retry on a
// unique index.

import { randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import { COL_INVESTMENTS } from "./db";

/** `\bMS-[0-9A-Fa-f]{4}\b` — extracts a code from anywhere in a free-text
 *  comment. The first match wins; subsequent codes are ignored. Returns
 *  the code uppercased (`"MS-A4B2"`) or null when no match. */
export function parseInvestmentTag(comment: string | null | undefined): string | null {
  if (!comment) return null;
  const m = comment.match(/\bMS-[0-9A-F]{4}\b/i);
  return m ? m[0].toUpperCase() : null;
}

function randomCode(): string {
  // 2 bytes → 4 hex chars; uppercase for readability.
  return `MS-${randomBytes(2).toString("hex").toUpperCase()}`;
}

/**
 * Generate a code that doesn't collide with any existing investment.
 * Retries on the (extremely rare) collision against the unique index.
 * Throws after 32 attempts — a non-issue at human scale, but bounds the
 * loop in case of an index misconfiguration.
 */
export async function generateUniqueInvestmentCode(db: Db): Promise<string> {
  for (let i = 0; i < 32; i++) {
    const candidate = randomCode();
    const exists = await db
      .collection(COL_INVESTMENTS)
      .findOne({ code: candidate }, { projection: { _id: 1 } });
    if (!exists) return candidate;
  }
  throw new Error("generateUniqueInvestmentCode: 32 collisions in a row — index misconfigured?");
}
