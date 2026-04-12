# Finance: Shipping Profit & Treasury Account Cards

## Overview

Add two new stat cards to the finance tab and a new transaction category.

## New Category: `"direct"`

- Add `"direct"` to `TransactionCategory` union type
- Displayed as **"Direct Transaction"** in the UI
- Available for **income** and **expense** types (not withdrawal)
- Represents sales/purchases made directly with others, outside Cardmarket
- Existing "other" transactions that represent direct sales will be manually recategorized by the user

## Card 1: Shipping Profit

**Formula:** `CM Shipping Collected` - `Shipping Expenses`

- `CM Shipping Collected` = `cmRev.shippingCosts` (from `/api/ext/revenue`)
- `Shipping Expenses` = sum of transactions where `type === "expense"` AND `category === "shipping"`
- Icon: `Package` (Lucide)
- Value is green when positive (expected default — CM shipping is overpriced)
- Falls back to 0 for CM shipping when no CM data available

## Card 2: Treasury Account

**Formula:** `Withdrawals` - `Checked Reimbursements` + `Direct Income` - `Direct Expenses`

- `Withdrawals` = sum of transactions where `type === "withdrawal"`
- `Checked Reimbursements` = sum of transactions where `type === "expense"` AND `reimbursed === true`
- `Direct Income` = sum of transactions where `type === "income"` AND `category === "direct"`
- `Direct Expenses` = sum of transactions where `type === "expense"` AND `category === "direct"`
- Icon: `Landmark` (Lucide)
- Value is green when positive

## Card Order

Income | Expenses | Withdrawals | Net Balance | Shipping Profit | Treasury Account

Grid remains `repeat(auto-fit, minmax(200px, 1fr))` — 6 cards auto-wrap.

## Files to Change

1. **`lib/types.ts`** — add `"direct"` to `TransactionCategory`
2. **`components/finance/FinanceContent.tsx`**:
   - Add `{ value: "direct", label: "Direct Transaction" }` to `CATEGORIES`
   - Add `Package` and `Landmark` to Lucide imports
   - Compute `shippingProfit` and `treasuryAccount` values alongside existing stats
   - Add two new `<StatCard>` components after Net Balance

No API route changes. No database migration. All computation is client-side, matching existing pattern.
