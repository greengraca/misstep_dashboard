---
name: add-ev-product
description: Interactively seed a fixed-pool product (Planeswalker Deck, Commander precon, Starter/Welcome/Duel/Challenger Deck) into the EV calculator. Resolves Scryfall IDs, verifies parent set is synced, and persists via POST /api/ev/products. Use when the user says "add an EV product", "seed a new precon", or pastes a product page (like a Wizards announcement) and asks to add it.
---

# Add EV Product

You are seeding a fixed-pool product into the MISSTEP EV calculator. This is a careful, interactive workflow — one question per message, never assume, never skip verification.

## Steps

### 1. Product identity

Ask the user, one at a time:

1. **Name** (e.g., `Amonkhet Planeswalker Deck — Liliana`)
2. **Type** — offer the enum: `planeswalker_deck`, `commander`, `starter`, `welcome`, `duel`, `challenger`, `other`.
3. **Release year** (e.g., `2017`)
4. **Parent set code** (Scryfall lowercase, e.g., `akh`). Optional — accept blank.

Derive a `slug` automatically: `<parent>-<type_short>-<kebab(name_tail)>`.
- `type_short` mapping: `planeswalker_deck → pw-deck`, `commander → cmdr`, `starter → starter`, `welcome → welcome`, `duel → duel`, `challenger → challenger`, `other → product`.
- `name_tail`: everything after the last `—` or `:` in the name, lowercased and kebab-cased.
- Example: `Amonkhet Planeswalker Deck — Liliana` + parent `akh` → `akh-pw-deck-liliana`.

Show the derived slug and ask user to confirm or override.

### 2. Parent-set prerequisite check

Run, via Bash:

    mongosh "$MONGODB_URI" --quiet --eval 'db.dashboard_ev_sets.findOne({code:"<parent>"},{code:1})'

(Use the actual value of `MONGODB_URI` from the shell env; do NOT embed credentials.)

- If the result is `null`: tell the user the parent set is missing and you need to sync it. Run:

      npx tsx scripts/sync-ev-set.ts <parent>

  Report the counts. Ask whether any auxiliary set (e.g., `p<parent>` for promos) should also be synced — this is required for the foil premium PW card in planeswalker decks. If yes, re-run the script with both codes:

      npx tsx scripts/sync-ev-set.ts <parent> p<parent>

- If the result is non-null, continue.

### 3. Decklist collection

Ask the user to paste the decklist. Accepted format, one card per line:

    <count> [*F*] <name>

Example:

    1 *F* Liliana, Death's Majesty
    1 Oashra Cultivator
    24 Swamp

Parse into `{ count: number, name: string, is_foil: boolean }[]`. Reject malformed lines (missing count or name) and ask for a fix.

### 4. Scryfall resolution (per card)

For each parsed line, resolve the exact `scryfall_id` using the Scryfall public API (no auth needed).

**Primary lookup:** `GET https://api.scryfall.com/cards/named?exact=<url-encoded-name>&set=<parent>`
**Fallback:** `GET https://api.scryfall.com/cards/search?q=!"<name>"+set:<parent>&unique=prints`

**Disambiguation rules (in order):**

1. If the card is foil AND `promo_types` on any returned printing includes `"planeswalkerdeck"` (Scryfall writes it as one word, no underscore): pick that printing. Depending on the year, this printing may live in the parent set directly (older sets like Amonkhet/Kaladesh/Ixalan keep PW-deck-exclusive cards in the main expansion, foil-only) OR in a dedicated promo set like `p<parent>` (some newer sets). Either location is fine; the `promo_types` tag is the authoritative signal.
2. If foil and nothing matches the `promo_types` rule: search `!"<name>" set:p<parent>` and pick the foil printing.
3. Default: the primary-lookup result (earliest printing in parent set).

Between each Scryfall request, sleep 80 ms (Scryfall rate limit) — use `sleep 0.08` in bash or a small JS delay if scripting.

**Ambiguity protocol:** if multiple printings could plausibly match and the rules above don't pick one deterministically, STOP and ask the user to paste the Scryfall URL for the exact printing. Parse the URL to extract `scryfall_id`.

Build `cards: EvProductCard[]`:

    {
      scryfall_id: "<resolved>",
      name: "<Scryfall canonical name>",
      set_code: "<printing's set>",
      count: <parsed count>,
      is_foil: <parsed foil flag>,
      role: "foil_premium_pw" if this is the foil PW card, else undefined
    }

Heuristic for `role: "foil_premium_pw"`: the card is foil, its `promo_types` includes `"planeswalkerdeck"` (one word, no underscore — Scryfall's vocabulary), AND its `type_line` contains "Planeswalker".

Present the full resolved list to the user in a tidy table (name | scryfall_id | set | foil | role) before proceeding. Any row the user flags as wrong → re-resolve that one card.

### 5. Included boosters

Ask: "Does this product include sealed boosters? (y/n)"

If yes:
- Ask how many boosters and of which sets. Accept multiple entries, e.g. `2 of akh`, `1 of hou`.
- For each booster set, verify it's in `dashboard_ev_sets` (reuse the mongosh check from step 2; if missing, offer to run `sync-ev-set.ts` for it).
- For each booster set, verify there is a recent snapshot with `play_ev_net`. Check via:

      mongosh "$MONGODB_URI" --quiet --eval 'db.dashboard_ev_snapshots.findOne({set_code:"<code>",play_ev_net:{$ne:null}},{date:1,play_ev_net:1},{sort:{date:-1}})'

  If null, tell the user the booster's set needs an EV config + snapshot before opened-EV can be computed. Offer to continue anyway (opened totals will be null until a set snapshot exists).
- Ask for known sealed price per booster in EUR (optional). Skip means `sealed_price_eur` is omitted.

Build `included_boosters: EvIncludedBooster[]`.

### 6. Preview and confirm

Compose the final `EvProduct` JSON object and pretty-print it in a fenced code block.

Then show a plain-English summary built from the pasted decklist and Scryfall-resolved printings:
- Card count: total + unique.
- Included boosters: count per set, whether `sealed_price_eur` is set, whether the set has a recent `play_ev_net` snapshot (opened valuation available or not).
- Missing `scryfall_id`s: should be `none` if step 4 succeeded; if not, halt — do not proceed.

**Do not POST yet.** A live EV number is nice-to-have but requires DB access; we skip it to keep preview fast and read-only. The user confirms based on the JSON + summary above.

Ask: "Save this product? (y/n, or `overwrite` if replacing an existing slug)"

### 7. Persist

On confirm, POST to `/api/ev/products`. The user must be logged in to the dashboard in their browser (PIN-authed) — the simplest path is to ask them to run the curl themselves with their session cookie, OR for you to write a throwaway script (`scripts/seed-product-<slug>.ts`) that uses the MongoDB driver directly to upsert.

Prefer the **direct-upsert script** approach — it avoids the auth dance:

    # scripts/_seed-product-tmp.ts (delete after run)
    try { process.loadEnvFile(".env"); } catch {}
    import { getClient } from "../lib/mongodb";
    import { upsertProduct } from "../lib/ev-products";

    const product = <pasted JSON>;
    await upsertProduct(product, { overwrite: <boolean> });
    await (await getClient()).close();

Run: `npx tsx scripts/_seed-product-tmp.ts`. On success, delete the file.

Then trigger an initial snapshot:

    curl -s -b <auth-cookie> -X POST http://localhost:3025/api/ev/products/<slug>/snapshot

…or, if avoiding curl, call `generateProductSnapshot(slug)` from a similar temp script.

Report the detail URL: `http://localhost:3025/ev/product/<slug>`.

### Failure handling

- Any unresolved card in step 4 → halt. Never write a partial product.
- Any Scryfall 4xx/5xx → retry once with 200 ms backoff; if still failing, halt.
- Existing slug + no `overwrite` flag → the upsert throws; ask the user to re-confirm with overwrite intent.

### Never

- Never skip Scryfall verification and guess at a `scryfall_id`.
- Never use `Co-Authored-By` in any git commit made during this workflow (memory: user rejects Claude attribution).
- Never upload decklist content to third-party pastebins / decklist sites — it's the user's data.
