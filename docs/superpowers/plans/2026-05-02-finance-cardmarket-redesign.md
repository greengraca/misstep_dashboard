# Finance + Cardmarket UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `app/(dashboard)/finance` and `app/(dashboard)/cardmarket` up to the visual quality of Storage Setup, the Create Investment modal, and EV set cards, by extracting shared primitives and rewriting both pages around them.

**Architecture:** Lift presentational primitives (`Panel`, `H1`, `H2`, `H3`, `Field`, `Note`, `KindCard`) out of their current inline definitions in `StorageSetupContent` and `CreateInvestmentModal`, plus add three new primitives (`StatusPill`, `MetricRow`, `Pagination`). Then rewrite the two target page components on top of those primitives, swap hand-rolled charts for Recharts, and sweep the cosmetic bugs catalogued in the spec. Each task is one git commit; the branch is independently revertable per-commit if any change is unwanted.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript 5.9, Tailwind CSS 4, Recharts 3.8, SWR 2, Lucide icons. CSS tokens defined in `app/globals.css`.

**Spec:** [`docs/superpowers/specs/2026-05-02-finance-cardmarket-polish-design.md`](../specs/2026-05-02-finance-cardmarket-polish-design.md)

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `components/dashboard/page-shell.tsx` | **Create** | Exports `Panel`, `H1`, `H2`, `H3`, `Field`, `Note`. Source: lifted from `StorageSetupContent.tsx` and `CreateInvestmentModal.tsx`. |
| `components/dashboard/kind-card.tsx` | **Create** | Exports `KindCard`. Source: lifted from `CreateInvestmentModal.tsx`. |
| `components/dashboard/status-pill.tsx` | **Create** | New presentational primitive — `rounded-full` tinted chip, 6 tones. |
| `components/dashboard/metric-row.tsx` | **Create** | New presentational primitive — small horizontal row of label/value tiles for inline numeric stats. |
| `components/dashboard/pagination.tsx` | **Create** | New presentational primitive — Prev / page-of / Next. |
| `components/system/StorageSetupContent.tsx` | **Modify** | Replace inline `Panel/H1/H2/H3/Note` definitions with imports. Storage-specific helpers (`Code`, `Pre`, `CheckItem`, `Lightbox`, `PartImage`, `PartChip`, etc.) stay in-file. |
| `components/investments/CreateInvestmentModal.tsx` | **Modify** | Replace inline `Field/KindCard` definitions with imports. |
| `components/finance/FinanceContent.tsx` | **Modify** | Full redesign per spec: page-shell H1/H2 wrappers, new Add button styling, KindCard-driven Add Transaction modal, native date input, MetricRow for CM Revenue, ConfirmModal for delete. |
| `components/cardmarket/CardmarketContent.tsx` | **Modify** | Full redesign per spec: page-shell wrappers, Recharts charts, FoilStar swap, bg-primary bug fix, Orders rhythm polish, Sync Activity pill rewrite. |

## Verification Approach

This is a presentational redesign with no business logic, no API, and no data-shape changes. Verification is:

- **Automated:** `npm run typecheck` after each task. Must pass.
- **Visual:** `npm run dev` and a manual click-through per the spec's "Manual verification" section. The dev server is on port 3025.

This codebase has no React component tests (Vitest is configured but only exercises `lib/` business logic). Adding `@testing-library/react` + `jsdom` infrastructure is out of scope for this branch — the spec is explicit about manual visual verification per commit.

---

## Task 1: Extract Panel / H1 / H2 / H3 / Field / Note into page-shell

**Files:**
- Create: `components/dashboard/page-shell.tsx`
- Modify: `components/system/StorageSetupContent.tsx` (delete inline `Panel`, `H1`, `H2`, `H3`, `Note` at lines 35–258, add import)
- Modify: `components/investments/CreateInvestmentModal.tsx` (delete inline `Field` at lines 28–53, add import)

The lifted primitives are byte-for-byte identical to the originals — no visual change is intended. The point of this task is purely to make them reusable from Finance and Cardmarket.

- [ ] **Step 1: Create `components/dashboard/page-shell.tsx`**

```tsx
"use client";

import { AlertTriangle } from "lucide-react";

interface PanelProps {
  children: React.ReactNode;
  /** Optional 3px left border in the given color — used to tint a section without overpowering the surface. */
  accent?: string;
  /** Tighter padding for nested panels (e.g. an expanded order's detail block inside the Orders Panel). */
  inset?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Panel({ children, accent, inset, className, style }: PanelProps) {
  return (
    <div
      className={`p-4 sm:p-6 ${className ?? ""}`}
      style={{
        background: "var(--surface-gradient)",
        backdropFilter: "var(--surface-blur)",
        border: "var(--surface-border)",
        boxShadow: "var(--surface-shadow)",
        borderRadius: "var(--radius)",
        borderLeft: accent ? `3px solid ${accent}` : undefined,
        padding: inset ? "16px 18px" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface H1Props {
  children: React.ReactNode;
  /** Optional muted line under the title — for "Income, expenses, reimbursements" style scene-setters. */
  subtitle?: React.ReactNode;
}

export function H1({ children, subtitle }: H1Props) {
  return (
    <div>
      <h1
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: 0,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
        }}
      >
        {children}
      </h1>
      {subtitle && (
        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            margin: "6px 0 0",
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

interface H2Props {
  children: React.ReactNode;
  id?: string;
  /** Rendered in accent color, 16px, to the left of the title. */
  icon?: React.ReactNode;
}

export function H2({ children, id, icon }: H2Props) {
  return (
    <h2
      id={id}
      style={{
        fontSize: 18,
        fontWeight: 600,
        color: "var(--text-primary)",
        margin: "0 0 14px",
        letterSpacing: "-0.01em",
        display: "flex",
        alignItems: "center",
        gap: 10,
        scrollMarginTop: 80,
      }}
    >
      {icon && <span style={{ color: "var(--accent)", display: "inline-flex" }}>{icon}</span>}
      {children}
    </h2>
  );
}

interface H3Props {
  children: React.ReactNode;
}

export function H3({ children }: H3Props) {
  return (
    <h3
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: "var(--text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        margin: "20px 0 10px",
        fontFamily: "var(--font-mono)",
      }}
    >
      {children}
    </h3>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
  hint?: string;
}

/** Form-field wrapper used by all modal forms. 10px mono uppercase muted label,
 *  child input, optional muted hint underneath. Pair with the `appraiser-field`
 *  CSS class on the input itself for hover/focus states. */
export function Field({ label, children, hint }: FieldProps) {
  return (
    <label className="block">
      <div
        className="text-[10px] uppercase tracking-wider mb-1"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
      >
        {label}
      </div>
      {children}
      {hint && (
        <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </div>
      )}
    </label>
  );
}

type NoteTone = "info" | "warn" | "danger" | "success";

interface NoteProps {
  tone?: NoteTone;
  icon?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}

export function Note({ tone = "info", icon, title, children }: NoteProps) {
  const palette = {
    info: { bg: "var(--accent-light)", border: "var(--accent-border)", color: "var(--accent)" },
    warn: { bg: "var(--warning-light)", border: "rgba(251,191,36,0.3)", color: "var(--warning)" },
    danger: { bg: "var(--error-light)", border: "var(--error-border)", color: "var(--error)" },
    success: { bg: "var(--success-light)", border: "rgba(52,211,153,0.3)", color: "var(--success)" },
  }[tone];
  return (
    <div
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 8,
        padding: "12px 14px",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        fontSize: 13,
        lineHeight: 1.6,
        color: "var(--text-secondary)",
        margin: "10px 0",
      }}
    >
      <span style={{ color: palette.color, flexShrink: 0, marginTop: 2 }}>
        {icon ?? <AlertTriangle size={16} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div style={{ fontWeight: 600, color: palette.color, marginBottom: 4, fontSize: 13 }}>
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Modify `StorageSetupContent.tsx` to import from page-shell**

Delete the inline `Panel` (lines 35–60), `H1` (lines 62–77), `H2` (lines 79–99), `H3` (lines 101–117), and `Note` (lines 204–258) functions. Replace the existing `lucide-react` import block by adding nothing new (`AlertTriangle` is no longer used directly here because `Note` brings its own default icon) — keep the existing AlertTriangle import only if other call sites in this file pass `<AlertTriangle />` as the explicit icon prop (search the file; if so, leave it).

Add this import near the top of the file, alongside the existing imports:

```tsx
import { Panel, H1, H2, H3, Note } from "@/components/dashboard/page-shell";
```

The rest of `StorageSetupContent.tsx` is untouched.

- [ ] **Step 3: Modify `CreateInvestmentModal.tsx` to import Field from page-shell**

Delete the inline `Field` function (lines 28–53). Add this import alongside the existing imports near the top:

```tsx
import { Field } from "@/components/dashboard/page-shell";
```

The rest of the file is untouched (KindCard stays inline for now — it's lifted in Task 2).

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS, no TypeScript errors.

- [ ] **Step 5: Run dev server and verify no visual regression**

```bash
npm run dev
```

Open `http://localhost:3025/system/storage-setup` and confirm the page renders identically to before (every Panel, H1, H2, H3, and Note in the page is using the lifted versions). Then open the Investments page, click "+ New Investment", and confirm every Field label still renders with the same 10px mono uppercase muted styling. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/page-shell.tsx components/system/StorageSetupContent.tsx components/investments/CreateInvestmentModal.tsx
git commit -m "feat(dashboard): extract Panel/H1/H2/H3/Field/Note primitives

Lift inline definitions out of StorageSetupContent and CreateInvestmentModal
into components/dashboard/page-shell.tsx so finance, cardmarket, and any
future page can compose with the same surface and typography language.

No visual change to existing surfaces."
```

---

## Task 2: Extract KindCard primitive

**Files:**
- Create: `components/dashboard/kind-card.tsx`
- Modify: `components/investments/CreateInvestmentModal.tsx` (delete inline `KindCard` at lines 55–111, add import)

- [ ] **Step 1: Create `components/dashboard/kind-card.tsx`**

```tsx
"use client";

interface KindCardProps {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

/** Selectable card used by modal flows that begin with a kind picker
 *  (e.g. "what kind of investment / transaction is this?").
 *  - inactive: bg-card, subtle border
 *  - hover (inactive): brighten bg + border
 *  - active: accent-tint background + accent border + 1px ring */
export function KindCard({ active, icon, title, description, onClick }: KindCardProps) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="flex flex-col items-start gap-3 p-4 rounded-xl text-left transition-all"
      style={{
        background: active ? "var(--accent-light)" : "var(--bg-card)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
        boxShadow: active ? "0 0 0 1px var(--accent)" : "none",
      }}
      onMouseEnter={(e) => {
        if (active) return;
        e.currentTarget.style.borderColor = "var(--border-hover)";
        e.currentTarget.style.background = "var(--bg-card-hover)";
      }}
      onMouseLeave={(e) => {
        if (active) return;
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.background = "var(--bg-card)";
      }}
    >
      <div
        className="p-2 rounded-lg"
        style={{ background: active ? "rgba(63,206,229,0.20)" : "var(--accent-light)" }}
      >
        {icon}
      </div>
      <div>
        <div
          className="text-sm font-semibold"
          style={{ color: active ? "var(--accent)" : "var(--text-primary)" }}
        >
          {title}
        </div>
        <div
          className="text-[11px] mt-1 leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          {description}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Modify `CreateInvestmentModal.tsx`**

Delete the inline `KindCard` function (lines 55–111 in the original; line numbers may have shifted by ~26 lines after Task 1's `Field` deletion — search for `function KindCard(`).

Add this import alongside the existing imports:

```tsx
import { KindCard } from "@/components/dashboard/kind-card";
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Visual verification**

```bash
npm run dev
```

Open Investments, click "+ New Investment", confirm the three KindCards render and behave exactly as before (hover brightens, click selects, active state shows accent tint + ring). Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/kind-card.tsx components/investments/CreateInvestmentModal.tsx
git commit -m "feat(dashboard): extract KindCard primitive

Lift inline definition out of CreateInvestmentModal into
components/dashboard/kind-card.tsx for reuse by the upcoming
Add Transaction modal redesign on the Finance page."
```

---

## Task 3: Add StatusPill and Pagination primitives

**Files:**
- Create: `components/dashboard/status-pill.tsx`
- Create: `components/dashboard/pagination.tsx`

(MetricRow lands in Task 6 alongside its first caller, per the spec.)

- [ ] **Step 1: Create `components/dashboard/status-pill.tsx`**

```tsx
"use client";

export type StatusPillTone = "info" | "accent" | "success" | "warning" | "danger" | "muted";

interface StatusPillProps {
  tone?: StatusPillTone;
  children: React.ReactNode;
  className?: string;
}

const TONE_PALETTE: Record<StatusPillTone, { bg: string; color: string }> = {
  info:    { bg: "rgba(96,165,250,0.10)",  color: "var(--info)"    },
  accent:  { bg: "var(--accent-light)",    color: "var(--accent)"  },
  success: { bg: "var(--success-light)",   color: "var(--success)" },
  warning: { bg: "var(--warning-light)",   color: "var(--warning)" },
  danger:  { bg: "var(--error-light)",     color: "var(--error)"   },
  muted:   { bg: "rgba(255,255,255,0.05)", color: "var(--text-muted)" },
};

/** Small `rounded-full` tinted chip. Used for inline status / count badges
 *  next to section headings and for stat tags on cards. */
export function StatusPill({ tone = "muted", children, className = "" }: StatusPillProps) {
  const palette = TONE_PALETTE[tone];
  return (
    <span
      className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium ${className}`}
      style={{
        background: palette.bg,
        color: palette.color,
        fontFamily: "var(--font-mono)",
      }}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Create `components/dashboard/pagination.tsx`**

```tsx
"use client";

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, total, pageSize, onChange }: PaginationProps) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;
  const canPrev = page > 1;
  const canNext = page < lastPage;

  function buttonStyle(enabled: boolean): React.CSSProperties {
    return {
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      color: enabled ? "var(--text-primary)" : "var(--text-muted)",
      opacity: enabled ? 1 : 0.4,
      cursor: enabled ? "pointer" : "not-allowed",
    };
  }

  return (
    <div
      className="flex items-center justify-between mt-3 pt-3"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        Page {page} of {lastPage}
      </span>
      <div className="flex gap-2">
        <button
          disabled={!canPrev}
          onClick={() => onChange(page - 1)}
          className="px-3 py-1 rounded text-xs"
          style={buttonStyle(canPrev)}
        >
          Prev
        </button>
        <button
          disabled={!canNext}
          onClick={() => onChange(page + 1)}
          className="px-3 py-1 rounded text-xs"
          style={buttonStyle(canNext)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS. (No callers yet; this just verifies the new files compile.)

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/status-pill.tsx components/dashboard/pagination.tsx
git commit -m "feat(dashboard): add StatusPill and Pagination primitives

StatusPill: rounded-full tinted chip with 6 tones, used by upcoming
Cardmarket Sync Activity rewrite and section-heading count badges.

Pagination: shared Prev/page-of/Next, used by Cardmarket orders table
and any future paginated table."
```

---

## Task 4: Finance — adopt page-shell + bug sweep

**File:** `components/finance/FinanceContent.tsx`

This is the first surgical pass on Finance: lift the page header, wrap the two main sections in `Panel`s with `H2`-with-icon, fix the broken Add button, replace `confirm()` with `ConfirmModal`, and drop the redundant `var(--error, #ef4444)` fallbacks. The Add Transaction modal is **not yet** redesigned in this task — it gets rewritten in Task 5 to keep the diffs separable.

- [ ] **Step 1: Add new imports**

At the top of `FinanceContent.tsx`, add:

```tsx
import { useState, useTransition } from "react";
// ... existing imports ...
import { Panel, H1, H2 } from "@/components/dashboard/page-shell";
import { StatusPill } from "@/components/dashboard/status-pill";
import ConfirmModal from "@/components/dashboard/confirm-modal";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Banknote,
  ShoppingBag,
  Package,
  Landmark,
  PlusCircle,
  Clock,
  CheckCircle,
  Pencil,
  Trash2,
  Receipt,        // NEW — used by Transactions H2
} from "lucide-react";
```

- [ ] **Step 2: Add ConfirmModal state and rewrite delete handler**

Add two new state hooks alongside the existing `editingTx` / `submitting` state (around line 110):

```tsx
const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);
```

Replace `handleDelete` (lines 221–230) with:

```tsx
function requestDelete(tx: Transaction) {
  setDeletingTx(tx);
}

async function confirmDelete() {
  const tx = deletingTx;
  if (!tx) return;
  await fetch("/api/finance", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: tx._id }),
  });
  setDeletingTx(null);
  mutate();
  globalMutate("/api/finance/pending-reimbursements");
}
```

In the action-column render (line 323), change `handleDelete(t)` to `requestDelete(t)`.

In the mobile card render (around line 539), there's no delete button — leave as is.

- [ ] **Step 3: Drop `var(--error, #ef4444)` fallbacks**

Find every occurrence of `var(--error, #ef4444)` in the file (there are several in the amount column render, the mobile card, and the type toggle) and replace with `var(--error)`. Same for `var(--warning, #f59e0b)` → `var(--warning)`. Same for `var(--error-light, rgba(239,68,68,0.1))` → `var(--error-light)`. Same for `var(--success-light, rgba(34,197,94,0.1))` → `var(--success-light)`.

Apply replace-all once per token.

- [ ] **Step 4: Replace the page header**

Replace the existing header div (lines 339–369):

```tsx
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
  <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
    Finance
  </h1>
  <div className="flex items-center gap-3">
    <MonthPicker
      value={month}
      onChange={(m) => startTransition(() => setMonth(m))}
      maxMonth={getCurrentMonth()}
    />
    <button
      onClick={openAdd}
      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      style={{
        background: "rgba(251, 191, 36, 0.15)",
        color: "var(--accent)",
        border: "1px solid rgba(251, 191, 36, 0.35)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(251, 191, 36, 0.25)";
        e.currentTarget.style.borderColor = "rgba(251, 191, 36, 0.50)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(251, 191, 36, 0.15)";
        e.currentTarget.style.borderColor = "rgba(251, 191, 36, 0.35)";
      }}
    >
      <PlusCircle size={16} /> Add
    </button>
  </div>
</div>
```

with:

```tsx
<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
  <H1 subtitle="Income, expenses, and reimbursements">Finance</H1>
  <div className="flex items-center gap-3">
    <MonthPicker
      value={month}
      onChange={(m) => startTransition(() => setMonth(m))}
      maxMonth={getCurrentMonth()}
    />
    <button
      onClick={openAdd}
      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
      style={{
        background: "var(--accent)",
        color: "var(--accent-text)",
        border: "1px solid var(--accent)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
    >
      <PlusCircle size={16} /> Add transaction
    </button>
  </div>
</div>
```

- [ ] **Step 5: Wrap CM Revenue in a Panel with H2**

Replace the existing CM Revenue block (lines 412–465) with:

```tsx
{cmRev && cmRev.orderCount > 0 && (
  <Panel>
    <div className="flex items-center justify-between mb-3">
      <H2 icon={<ShoppingBag size={16} />}>Cardmarket Revenue</H2>
      <StatusPill tone="muted">{cmRev.orderCount} orders</StatusPill>
    </div>
    {/* The 5-stat row is replaced by MetricRow in Task 6.
        For this task, keep the existing inline grid so the Panel/H2 swap
        can be reviewed in isolation. */}
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
      <div>
        <span style={{ color: "var(--text-muted)" }}>Total Sales</span>
        <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
          €{cmRev.totalSales.toFixed(2)}
        </p>
      </div>
      <div>
        <span style={{ color: "var(--text-muted)" }}>Gross</span>
        <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
          €{cmRev.grossArticleValue.toFixed(2)}
        </p>
      </div>
      <div>
        <span style={{ color: "var(--text-muted)" }}>Fees</span>
        <p className="text-sm font-medium mt-0.5" style={{ color: "var(--error)", fontFamily: "var(--font-mono)" }}>
          -€{(cmRev.sellingFees + cmRev.trusteeFees).toFixed(2)}
        </p>
      </div>
      <div>
        <span style={{ color: "var(--text-muted)" }}>Shipping Costs</span>
        <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          €{cmRev.shippingCosts.toFixed(2)}
        </p>
      </div>
      <div>
        <span style={{ color: "var(--text-muted)" }}>Net Revenue</span>
        <p className="text-sm font-medium mt-0.5" style={{ color: "var(--success)", fontFamily: "var(--font-mono)" }}>
          €{cmRev.netRevenue.toFixed(2)}
        </p>
      </div>
    </div>
  </Panel>
)}
```

- [ ] **Step 6: Wrap Transactions in a Panel with H2**

Replace the existing Transactions block (lines 467–548) with:

```tsx
<Panel>
  <H2 icon={<Receipt size={16} />}>Transactions</H2>
  <DataTable
    columns={columns}
    data={transactions}
    keyField="_id"
    defaultSortKey="date"
    defaultSortDir="desc"
    emptyMessage="No transactions this month."
    rowHover
    renderMobileCard={(t) => (
      <div
        className="flex items-center justify-between gap-2 p-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {t.description}
          </p>
          <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
            {new Date(t.date + "T00:00:00").toLocaleDateString("pt-PT")} · {t.category}
            {t.paid_by && ` · ${t.paid_by}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {t.type === "expense" && t.paid_by && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleReimburse(t); }}
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              {t.reimbursed ? (
                <CheckCircle size={14} style={{ color: "var(--success)" }} />
              ) : (
                <Clock size={14} style={{ color: "var(--warning)" }} />
              )}
            </button>
          )}
          <span
            className="text-sm font-medium"
            style={{
              color: t.type === "income" ? "var(--success)" : "var(--error)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {t.type === "income" ? "+" : "-"}€{Math.abs(t.amount).toFixed(2)}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(t); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            aria-label="Edit"
          >
            <Pencil size={14} />
          </button>
        </div>
      </div>
    )}
  />
</Panel>
```

Also rename the Reimb. column header. In the columns array (around line 287), change `label: "Reimb."` to `label: "Reimbursed"`.

- [ ] **Step 7: Add the ConfirmModal at the end of the JSX**

Inside the outer `<div>` wrapper, just before its closing `</div>`, add:

```tsx
<ConfirmModal
  open={!!deletingTx}
  onClose={() => setDeletingTx(null)}
  onConfirm={confirmDelete}
  title="Delete transaction"
  message={deletingTx ? `Delete "${deletingTx.description}"? This cannot be undone.` : ""}
  confirmLabel="Delete"
  variant="danger"
/>
```

- [ ] **Step 8: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Visual verification**

```bash
npm run dev
```

Open `/finance`. Verify:
- Header reads "Finance" at 32px bold with the muted subtitle "Income, expenses, and reimbursements" beneath.
- "Add transaction" button is solid cyan (`var(--accent)`) with dark text — no warm-yellow.
- "Cardmarket Revenue" and "Transactions" sections are now glass `Panel`s with leading accent-colored icons (ShoppingBag, Receipt) in the H2.
- Click the trash icon on any transaction — a `ConfirmModal` appears (no native browser dialog), red "Delete" button, "Cancel" button.
- Inspect the type toggle in the existing Add Transaction modal — it still uses the old colored 3-button layout (that's fixed in Task 5).

Stop dev server.

- [ ] **Step 10: Commit**

```bash
git add components/finance/FinanceContent.tsx
git commit -m "refactor(finance): adopt page-shell primitives + bug sweep

- H1 with subtitle, 32px to match Storage Setup
- Wrap CM Revenue and Transactions in glass Panels with icon H2s
- Replace amber/cyan Add button with proper accent CTA
- Replace native confirm() for delete with ConfirmModal (variant=danger)
- Drop redundant var(--error, #ef4444) / var(--warning, #f59e0b) fallbacks
- Rename 'Reimb.' column header to 'Reimbursed'

Add Transaction modal redesign lands in the next commit."
```

---

## Task 5: Finance — Add Transaction KindCard rework

**File:** `components/finance/FinanceContent.tsx`

Replace the 3-button colored type toggle with a `KindCard` row, replace the 3-Select date picker with a single `<input type="date">`, switch all inputs to `appraiser-field`, and switch labels to the `Field` primitive. Submit/Cancel buttons match the Create Investment modal exactly.

- [ ] **Step 1: Update imports**

Remove unused imports that became dead after this task. After applying all the edits below, the form no longer uses `MONTH_OPTIONS`, `getYearOptions`, `daysInMonth`, `todayParts`, or `buildDateStr` for date assembly. Keep `todayParts` only if you use it elsewhere; otherwise delete the helper. Same for `daysInMonth`, `MONTH_OPTIONS`, `buildDateStr`, `getYearOptions`. Also stop importing `Select` if it's no longer used after this task — but Category and Paid By selects keep using it, so the import stays.

Add new imports at the top of `FinanceContent.tsx`:

```tsx
import { Field } from "@/components/dashboard/page-shell";
import { KindCard } from "@/components/dashboard/kind-card";
import {
  // ... existing icons ...
  TrendingDown,    // already imported
  TrendingUp,      // already imported — also used for Income KindCard
  Banknote,        // already imported — also used for Withdrawal KindCard
  // For Expense KindCard:
  ArrowDownRight,
} from "lucide-react";
```

- [ ] **Step 2: Replace form date state with a single ISO string**

Find the existing form date state (around line 114):

```tsx
const [formDay, setFormDay] = useState(todayParts().day);
const [formMonth, setFormMonth] = useState(todayParts().month);
const [formYear, setFormYear] = useState(todayParts().year);
```

Replace with:

```tsx
const [formDate, setFormDate] = useState(isoToday());
```

Add `isoToday` and the field/button style helpers near the top of the file (above the component, alongside the other helpers):

```tsx
function isoToday(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const fieldStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
};
```

Delete the now-unused `todayParts`, `daysInMonth`, `buildDateStr`, `MONTH_OPTIONS`, and `getYearOptions` helpers. Delete the inline `inputStyle` and `labelClass` constants — `appraiser-field` + `fieldStyle` + `Field` replace them.

- [ ] **Step 3: Update `openAdd` and `openEdit`**

Find `openAdd` (around line 157) and replace its date-init block:

```tsx
function openAdd() {
  setEditingTx(null);
  setFormDate(isoToday());
  setFormType("expense");
  setFormCategory("shipping");
  setFormDescription("");
  setFormAmount("");
  setFormPaidBy("");
  setModalOpen(true);
}
```

Find `openEdit` (around line 171) and replace its date-init block:

```tsx
function openEdit(tx: Transaction) {
  setEditingTx(tx);
  setFormDate(tx.date); // already ISO YYYY-MM-DD
  setFormType(tx.type);
  setFormCategory(tx.category);
  setFormDescription(tx.description);
  setFormAmount(String(tx.amount));
  setFormPaidBy(tx.paid_by || "");
  setModalOpen(true);
}
```

- [ ] **Step 4: Update `handleSubmit` payload**

In `handleSubmit` (around line 185), the only change is the `date` field — it now reads `formDate` directly instead of calling `buildDateStr(formDay, formMonth, formYear)`. The rest of the function (the `try`/`catch`, the `fetch` calls, the `mutate()` calls) is unchanged. Replace the existing `const payload = {…};` block with:

```tsx
const payload = {
  date: formDate,
  type: formType,
  category: formType === "withdrawal" ? "withdrawal" : formCategory,
  description: formDescription,
  amount: parseFloat(formAmount),
  paid_by: formType === "expense" && formPaidBy ? formPaidBy : null,
};
```

- [ ] **Step 5: Replace the modal body**

Replace the entire Modal block (`<Modal open={modalOpen} ... </Modal>`, around lines 551–719) with:

```tsx
<Modal
  open={modalOpen}
  onClose={() => setModalOpen(false)}
  title={editingTx ? "Edit transaction" : "Add transaction"}
  maxWidth="max-w-2xl"
>
  <form onSubmit={handleSubmit} className="flex flex-col gap-5">
    {/* Kind picker */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <KindCard
        active={formType === "expense"}
        onClick={() => setFormType("expense")}
        icon={<ArrowDownRight size={22} style={{ color: "var(--accent)" }} />}
        title="Expense"
        description="Money out — shipping, supplies, fees, or anything you paid for."
      />
      <KindCard
        active={formType === "income"}
        onClick={() => setFormType("income")}
        icon={<TrendingUp size={22} style={{ color: "var(--accent)" }} />}
        title="Income"
        description="Manual income — direct sales, refunds, or anything not coming from Cardmarket."
      />
      <KindCard
        active={formType === "withdrawal"}
        onClick={() => setFormType("withdrawal")}
        icon={<Banknote size={22} style={{ color: "var(--accent)" }} />}
        title="Withdrawal"
        description="Money pulled out of the Cardmarket balance into your own account."
      />
    </div>

    {/* Form body — fades in once a kind is picked */}
    <div className="flex flex-col gap-3 animate-[fadeIn_0.2s_ease]">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input
            type="date"
            required
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
            className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
            style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
          />
        </Field>
        <Field label="Amount (€)">
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            value={formAmount}
            onChange={(e) => setFormAmount(e.target.value)}
            placeholder="0.00"
            className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
            style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
          />
        </Field>
      </div>

      {formType !== "withdrawal" && (
        <Field label="Category">
          <Select
            value={formCategory}
            onChange={setFormCategory}
            options={CATEGORIES}
            className="w-full"
          />
        </Field>
      )}

      <Field label="Description">
        <input
          type="text"
          required
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
          placeholder="e.g. Shipping order #1234"
          className="appraiser-field w-full px-3 py-2 rounded-lg text-sm"
          style={fieldStyle}
        />
      </Field>

      {formType === "expense" && (
        <Field label="Paid by" hint="Set this if a team member fronted the cost — used for reimbursements.">
          <Select
            value={formPaidBy}
            onChange={setFormPaidBy}
            options={paidByOptions}
            className="w-full"
            placeholder="Select member..."
          />
        </Field>
      )}
    </div>

    {/* Actions — match Create Investment modal */}
    <div className="flex justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={() => setModalOpen(false)}
        className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting || !formDescription || !formAmount}
        className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
        style={{
          background: submitting || !formDescription || !formAmount ? "var(--bg-card)" : "var(--accent)",
          color: submitting || !formDescription || !formAmount ? "var(--text-muted)" : "var(--accent-text)",
          border: "1px solid var(--accent)",
          opacity: submitting || !formDescription || !formAmount ? 0.6 : 1,
          cursor: submitting || !formDescription || !formAmount ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? "Saving…" : editingTx ? "Update transaction" : "Add transaction"}
      </button>
    </div>
  </form>
</Modal>
```

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

If you see "TypeScript error: 'todayParts' is defined but never used" or similar for any of the helpers you deleted, double-check the Edit and confirm the helper is fully removed (search the file for the name).

- [ ] **Step 7: Visual verification**

```bash
npm run dev
```

Open `/finance`. Click "+ Add transaction":
- The modal opens at `max-w-2xl` width (wider than before).
- Three KindCards appear at the top: Expense / Income / Withdrawal, each with an icon and one-line description, exactly like the Create Investment modal's three cards.
- Click each KindCard — accent ring appears, the form fields below stay visible.
- Date is now a single `<input type="date">` rendered through `appraiser-field` (focus turns the border accent-cyan).
- Amount uses mono font.
- Category dropdown only shows when type is Expense or Income (hidden for Withdrawal).
- Paid by dropdown only shows when type is Expense.
- Description is required; Add button is disabled until both Description and Amount are filled.
- Submit button is solid cyan with dark text when active.
- Pick "Expense", fill description "Test", amount "1.00", click "Add transaction" — the row appears in the table.
- Click the pencil icon on the new row — the modal opens with the Expense card pre-active and the date populated.
- Cancel — modal closes with no changes.
- Delete the test row via the trash icon — ConfirmModal appears, click Delete, row disappears.

Stop dev server.

- [ ] **Step 8: Commit**

```bash
git add components/finance/FinanceContent.tsx
git commit -m "feat(finance): redesign Add Transaction with KindCard flow

Replace the 3-button colored type toggle with the same KindCard pattern
the Create Investment modal uses. Replace the 3-Select Day/Month/Year
date picker with a single native date input rendered through
appraiser-field. Switch every label to the Field primitive (10px mono
uppercase muted) for consistency with Create Investment.

Submit and Cancel buttons match the Create Investment modal exactly:
solid accent CTA, muted ghost cancel."
```

---

## Task 6: Finance — Cardmarket Revenue MetricRow

**Files:**
- Create: `components/dashboard/metric-row.tsx`
- Modify: `components/finance/FinanceContent.tsx` (replace the inline 5-stat grid inside the Cardmarket Revenue Panel with `<MetricRow items={…} />`)

- [ ] **Step 1: Create `components/dashboard/metric-row.tsx`**

```tsx
"use client";

export type MetricTone = "default" | "success" | "danger" | "muted";

export interface MetricRowItem {
  label: string;
  value: string;
  tone?: MetricTone;
}

interface MetricRowProps {
  items: MetricRowItem[];
}

const TONE_COLOR: Record<MetricTone, string> = {
  default: "var(--text-primary)",
  success: "var(--success)",
  danger:  "var(--error)",
  muted:   "var(--text-muted)",
};

/** Inline row of 4–6 small numeric stats. Each tile is label-above /
 *  mono-value-below. Used for breakdown strips that don't deserve full
 *  StatCards (Cardmarket Revenue, EV per-rarity contributions, etc.). */
export function MetricRow({ items }: MetricRowProps) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((m) => (
        <div
          key={m.label}
          className="flex flex-col gap-1 p-3 rounded-lg"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span
            className="text-[10px] uppercase tracking-wider"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            {m.label}
          </span>
          <span
            className="text-base font-semibold"
            style={{
              color: TONE_COLOR[m.tone ?? "default"],
              fontFamily: "var(--font-mono)",
            }}
          >
            {m.value}
          </span>
        </div>
      ))}
    </div>
  );
}
```

The inline-grid uses an explicit `grid-template-columns` with `repeat(N, ...)` instead of `grid-cols-5` so any caller can pass 4, 5, or 6 items without a Tailwind class change. On mobile this still produces a single horizontal row that scrolls if cramped (the parent `<Panel>` has `overflow` defaults that work fine here).

- [ ] **Step 2: Modify FinanceContent — import MetricRow and replace the inline grid**

Add import:

```tsx
import { MetricRow } from "@/components/dashboard/metric-row";
```

Inside the CM Revenue Panel (the block from Task 4 step 5), replace the inline `<div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">…</div>` block with:

```tsx
<MetricRow
  items={[
    { label: "Total Sales",     value: `€${cmRev.totalSales.toFixed(2)}` },
    { label: "Gross",           value: `€${cmRev.grossArticleValue.toFixed(2)}` },
    { label: "Fees",            value: `-€${(cmRev.sellingFees + cmRev.trusteeFees).toFixed(2)}`, tone: "danger" },
    { label: "Shipping",        value: `€${cmRev.shippingCosts.toFixed(2)}`, tone: "muted" },
    { label: "Net Revenue",     value: `€${cmRev.netRevenue.toFixed(2)}`, tone: "success" },
  ]}
/>
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Visual verification**

```bash
npm run dev
```

Open `/finance` for a month with Cardmarket sales:
- "Cardmarket Revenue" Panel renders with H2 + ShoppingBag icon + muted "N orders" pill on the right.
- Below it: 5 metric tiles in a single row, each with a 10px mono uppercase label above and a mono value below, color-coded (Fees red, Shipping muted, Net green, others primary).
- Each tile has its own subtle bg-card surface — the row has visual rhythm rather than being a flat strip.

Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/metric-row.tsx components/finance/FinanceContent.tsx
git commit -m "feat(finance): card-rhythm Cardmarket Revenue with MetricRow

Add MetricRow primitive — small inline row of 4–6 numeric stats with
label-above / mono-value-below tiles. Apply to the Cardmarket Revenue
panel so the breakdown reads as proper card surfaces instead of a flat
text grid."
```

---

## Task 7: Cardmarket — adopt page-shell + bug sweep

**File:** `components/cardmarket/CardmarketContent.tsx`

Lift the page header, wrap each top-level section (Balance History, Sales Pipeline, Orders, Sync Activity) in a `Panel` with `H2`-with-icon, and fix every cosmetic bug listed in the spec. Charts stay hand-rolled in this task — they're swapped for Recharts in Task 8 to keep diffs separable.

- [ ] **Step 1: Update imports**

At the top of `CardmarketContent.tsx`:

```tsx
import {
  DollarSign, Package, ShoppingCart, TrendingDown, RefreshCw,
  ChevronDown, ChevronUp, Check, Printer, Loader2,
  TrendingUp,    // NEW — Balance History H2 icon
  Activity,      // NEW — Sales Pipeline H2 icon
  Zap,           // NEW — Sync Activity H2 icon
} from "lucide-react";
import { Panel, H1, H2 } from "@/components/dashboard/page-shell";
import { StatusPill } from "@/components/dashboard/status-pill";
import { FoilStar } from "@/components/dashboard/cm-sprite";
```

- [ ] **Step 2: Drop the unused `surfaceStyle` constant**

Delete (around line 101):

```tsx
const surfaceStyle = {
  background: "var(--surface-gradient)",
  backdropFilter: "var(--surface-blur)",
  border: "1px solid rgba(255,255,255,0.10)",
};
```

It's replaced by `<Panel>`. Every site that referenced `surfaceStyle` is rewritten below.

- [ ] **Step 3: Replace the page header**

Replace lines 282–304 (the `<div className="flex flex-wrap items-center justify-between gap-3">…</div>` header):

```tsx
<div className="flex flex-wrap items-start justify-between gap-3">
  <H1 subtitle="Passive sync via browser extension">Cardmarket</H1>
  <button
    onClick={async () => {
      setRefreshing(true);
      await Promise.all([mutateStatus(), mutateOrders(), mutateBalance(), mutatePipeline()]);
      setRefreshing(false);
    }}
    disabled={refreshing}
    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
    style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      color: refreshing ? "var(--accent)" : "var(--text-secondary)",
      cursor: refreshing ? "not-allowed" : "pointer",
      opacity: refreshing ? 0.8 : 1,
    }}
  >
    {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
    {refreshing ? "Refreshing…" : "Refresh"}
  </button>
</div>
```

- [ ] **Step 4: Replace Balance History panel (still hand-rolled chart in this task)**

Replace lines 358–382:

```tsx
{balance?.history?.length > 0 && (
  <Panel>
    <H2 icon={<TrendingUp size={16} />}>Balance History</H2>
    <div className="flex items-end gap-1 w-full" style={{ height: "80px" }}>
      {balance.history.map((snap: { balance: number; extractedAt: string }, i: number) => {
        const min = Math.min(...balance.history.map((s: { balance: number }) => s.balance));
        const max = Math.max(...balance.history.map((s: { balance: number }) => s.balance));
        const range = max - min || 1;
        const h = ((snap.balance - min) / range) * 60 + 20;
        return (
          <div
            key={i}
            className="flex-1 min-w-0 rounded-t"
            style={{
              height: `${h}%`,
              background: "var(--accent)",
              opacity: 0.6 + (i / balance.history.length) * 0.4,
            }}
            title={`${formatEur(snap.balance)} — ${new Date(snap.extractedAt).toLocaleDateString("pt-PT")}`}
          />
        );
      })}
    </div>
  </Panel>
)}
```

- [ ] **Step 5: Move Sales Pipeline outside the legacy panel wrapper**

The existing `<PipelineChart history={…} />` call (around line 386) renders its own `<div className="p-4 rounded-xl overflow-hidden" style={surfaceStyle}>` internally. Modify the `PipelineChart` function (around line 638) to use `<Panel>` and `<H2>` instead. Replace lines 659–667 of the function body:

```tsx
return (
  <Panel>
    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
      <H2 icon={<Activity size={16} />}>
        Sales Pipeline
        <span className="ml-1 text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>
          Balance + U + P + S over the last 30 days
        </span>
      </H2>
      <div className="flex flex-wrap items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
        <span className="inline-flex items-center gap-1" title="CM wallet balance">
          {legendDot(PIPELINE_COLORS.balance)} Bal {formatEur(latest?.balance)}
        </span>
        <span className="inline-flex items-center gap-1" title="Unpaid orders">
          {legendDot(PIPELINE_COLORS.unpaid)} U {formatEur(latest?.unpaid)}
        </span>
        <span className="inline-flex items-center gap-1" title="Paid, awaiting shipment">
          {legendDot(PIPELINE_COLORS.paid)} P {formatEur(latest?.paid)}
        </span>
        <span className="inline-flex items-center gap-1" title="Trustee-Sent (money still held by CM trustee)">
          {legendDot(PIPELINE_COLORS.sent)} S {formatEur(latest?.sent)}
        </span>
      </div>
    </div>
    {/* Bars + footer unchanged in this task; Task 8 replaces them with Recharts. */}
    <div className="flex items-end gap-1 w-full" style={{ height: "80px" }}>
      {history.map((p, i) => {
        const totalPct = (p.total / max) * 100;
        const balPct = (p.balance / max) * 100;
        const uPct = (p.unpaid / max) * 100;
        const pPct = (p.paid / max) * 100;
        const sPct = (p.sent / max) * 100;
        const tooltip = [
          formatDay(p.date),
          `Bal: ${formatEur(p.balance)}`,
          `U: ${formatEur(p.unpaid)}`,
          `P: ${formatEur(p.paid)}`,
          `S: ${formatEur(p.sent)}`,
          `Total: ${formatEur(p.total)}`,
          p.source === "snapshot" ? "(snapshot)" : "(reconstructed)",
        ].join(" · ");
        return (
          <div
            key={`${p.date}-${i}`}
            title={tooltip}
            className="flex-1 min-w-0 flex flex-col justify-end"
            style={{ height: "100%", opacity: p.total > 0 ? 0.6 + (i / history.length) * 0.4 : 0.25 }}
          >
            <div
              style={{
                height: `${totalPct}%`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                borderTopLeftRadius: 2,
                borderTopRightRadius: 2,
                overflow: "hidden",
              }}
            >
              {uPct > 0 && <div style={{ flex: uPct, background: PIPELINE_COLORS.unpaid }} />}
              {pPct > 0 && <div style={{ flex: pPct, background: PIPELINE_COLORS.paid }} />}
              {sPct > 0 && <div style={{ flex: sPct, background: PIPELINE_COLORS.sent }} />}
              {balPct > 0 && <div style={{ flex: balPct, background: PIPELINE_COLORS.balance }} />}
            </div>
          </div>
        );
      })}
    </div>
    <div className="flex justify-between mt-1 text-[9px]" style={{ color: "var(--text-muted)" }}>
      <span>{formatDay(history[0].date)}</span>
      <span>{formatDay(history[history.length - 1].date)}</span>
    </div>
  </Panel>
);
```

- [ ] **Step 6: Replace the Orders panel wrapper**

Replace the outer `<div className="rounded-xl overflow-hidden" style={surfaceStyle}>` opening tag (line 390) and the matching closing `</div>` (line 570) with `<Panel>…</Panel>`. Inside, restructure the header row to use H2 + StatusPill + the direction toggle, and fix the two `var(--bg-primary)` bugs. Replace lines 391–414 with:

```tsx
<div className="flex flex-wrap items-center justify-between gap-3 mb-3">
  <H2 icon={<ShoppingCart size={16} />}>Orders</H2>

  {/* Sales / Purchases toggle */}
  <div
    className="flex rounded-lg overflow-hidden text-xs"
    style={{ border: "1px solid var(--border)" }}
  >
    {(["sale", "purchase"] as const).map((d) => (
      <button
        key={d}
        onClick={() => handleDirectionToggle(d)}
        className="px-3 py-1.5 font-medium transition-all"
        style={{
          background: direction === d ? "var(--accent)" : "transparent",
          color: direction === d ? "var(--accent-text)" : "var(--text-muted)",
        }}
      >
        {d === "sale" ? "Sales" : "Purchases"}
      </button>
    ))}
  </div>
</div>
```

The status-tab strip (lines 416–450) stays as-is — already uses correct accent tokens.

For the Print All button (around line 458), replace the inline style:

```tsx
<button
  onClick={() => printEnvelopes(orders.orders.filter((o: CmOrder) => !o.printed))}
  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
  style={{ background: "var(--accent)", color: "var(--accent-text)" }}
>
  <Printer size={13} /> Print All Envelopes
</button>
```

- [ ] **Step 7: Fix the master "printed" checkbox color**

In the table head (around line 484), replace the inline color:

```tsx
<button
  onClick={() => toggleAllPrinted(!allPrinted, orders.orders)}
  title={allPrinted ? "Unmark all as printed" : "Mark all as printed"}
  className="w-4 h-4 rounded border-2 flex items-center justify-center transition-colors"
  style={{
    borderColor: "var(--warning)",
    background: allPrinted ? "var(--warning)" : "transparent",
    cursor: "pointer",
  }}
>
  {allPrinted && (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-6" stroke="var(--bg-page)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )}
</button>
```

- [ ] **Step 8: Replace the FOIL text with FoilStar**

In the items table inside `OrderRow` (around line 943):

```tsx
<td className="py-1" style={{ color: "var(--text-primary)" }}>
  {item.name}
  {item.foil && <span className="ml-1 inline-flex align-middle"><FoilStar size={11} /></span>}
</td>
```

- [ ] **Step 9: Drop `var(--warning, #f59e0b)` fallbacks**

Search the file for `var(--warning, #f59e0b)` and replace with `var(--warning)`. There's one in `OrderRow`'s `syncColor` block. Same for any `#f44336` literal in `syncColor` — replace with `var(--error)`.

- [ ] **Step 10: Wrap Sync Activity in a Panel with H2**

Replace lines 573–612:

```tsx
{status?.recentLogs?.length > 0 && (
  <Panel>
    <H2 icon={<Zap size={16} />}>Sync Activity</H2>
    <div className="flex flex-col gap-1">
      {status.recentLogs.slice(0, 10).map((log: CmSyncLogEntry, i: number) => (
        <div key={i} className="py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusPill tone="accent">{log.dataType}</StatusPill>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {log.stats.added > 0 && `+${log.stats.added}`}
                {log.stats.updated > 0 && ` ~${log.stats.updated}`}
                {log.stats.skipped > 0 && ` =${log.stats.skipped}`}
                {(log.stats as Record<string, number>).removed > 0 && ` -${(log.stats as Record<string, number>).removed}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {log.submittedBy}
              </span>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {formatAgo(log.receivedAt)}
              </span>
            </div>
          </div>
          {log.details && (
            <div className="mt-0.5 text-[10px] pl-1" style={{ color: "var(--text-muted)" }}>
              {log.details}
            </div>
          )}
        </div>
      ))}
    </div>
  </Panel>
)}
```

(The cryptic `+N ~M =K -L` text stays in this task — it's rewritten as explicit StatusPills in Task 9.)

- [ ] **Step 11: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 12: Visual verification**

```bash
npm run dev
```

Open `/cardmarket`. Verify:
- Header: "Cardmarket" at 32px bold + muted "Passive sync via browser extension" subtitle.
- Refresh button on the right, unchanged.
- StatCards row, unchanged.
- Balance History: glass `Panel`, H2 "Balance History" with TrendingUp icon in accent color.
- Sales Pipeline: glass `Panel`, H2 "Sales Pipeline" with Activity icon, legend chips on the right of the H2 row.
- Orders: glass `Panel`, H2 "Orders" with ShoppingCart icon on the left, Sales/Purchases toggle on the right (no visible white text — the active toggle now has dark text on cyan).
- Switch to Paid tab + Sales: "Print All Envelopes" button is solid cyan with dark visible text (no longer broken).
- Master printed checkbox in the Paid tab is amber-warning instead of hand-rolled `#eab308`.
- Expand any sale order with foil items — `FOIL` text is replaced with the foil-star sprite.
- Sync Activity: glass `Panel`, H2 "Sync Activity" with Zap icon, accent pill for `dataType`.

Stop dev server.

- [ ] **Step 13: Commit**

```bash
git add components/cardmarket/CardmarketContent.tsx
git commit -m "refactor(cardmarket): adopt page-shell primitives + bug sweep

- H1 with subtitle, 32px to match Storage Setup and Finance
- Wrap Balance History, Sales Pipeline, Orders, Sync Activity in
  glass Panels with icon H2s
- Fix var(--bg-primary) bug on direction toggle and Print All button
  (token does not exist; was rendering browser-default text)
- Replace 'FOIL' text in order items with <FoilStar /> sprite
- Replace hand-rolled #eab308 printed checkbox with var(--warning)
- Drop redundant var(--warning, #f59e0b) and #f44336 fallbacks
- Drop unused surfaceStyle constant

Charts stay hand-rolled here; Recharts swap is the next commit."
```

---

## Task 8: Cardmarket — replace hand-rolled charts with Recharts

**File:** `components/cardmarket/CardmarketContent.tsx`

Replace the Balance History `<div>`-bar chart and the Sales Pipeline `<div>`-stacked-bar chart with proper Recharts components. Both retain the same data shape and tooltip information. Recharts is already in `package.json` (^3.8.0) and used elsewhere (`EvHistoryChart`, `EvSimulationPanel`, `StockChart`).

- [ ] **Step 1: Update imports**

Add to `CardmarketContent.tsx`:

```tsx
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
```

- [ ] **Step 2: Add a small Recharts tooltip component for Balance History**

Above `export default function CardmarketContent`, add:

```tsx
function BalanceTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { extractedAt: string } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div
      style={{
        background: "rgba(15, 20, 25, 0.95)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 11,
        color: "var(--text-primary)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)" }}>
        € {p.value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace the Balance History `<Panel>` body**

Find the Balance History block (from Task 7 step 4). Replace its inner `<div className="flex items-end gap-1 …">…</div>` with:

```tsx
<div style={{ width: "100%", height: 100 }}>
  <ResponsiveContainer>
    <AreaChart
      data={balance.history.map((s: { balance: number; extractedAt: string }) => ({
        balance: s.balance,
        extractedAt: s.extractedAt,
        label: new Date(s.extractedAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" }),
      }))}
      margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
    >
      <defs>
        <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <XAxis dataKey="label" hide />
      <YAxis hide domain={["auto", "auto"]} />
      <Tooltip content={<BalanceTooltip />} cursor={{ stroke: "var(--accent)", strokeOpacity: 0.4, strokeDasharray: "3 3" }} />
      <Area
        type="monotone"
        dataKey="balance"
        stroke="var(--accent)"
        strokeWidth={2}
        fill="url(#balanceFill)"
        isAnimationActive={false}
      />
    </AreaChart>
  </ResponsiveContainer>
</div>
```

- [ ] **Step 4: Replace the Sales Pipeline `<Panel>` body**

In the `PipelineChart` function, replace the entire bars-and-axis block (the `<div className="flex items-end gap-1 …">…</div>` + the date footer, around lines 684–740 in the original) with:

```tsx
function PipelineTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: PipelinePoint }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      style={{
        background: "rgba(15, 20, 25, 0.95)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 11,
        color: "var(--text-primary)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        fontFamily: "var(--font-mono)",
      }}
    >
      <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>{formatDay(p.date)}</div>
      <div>Bal: {formatEur(p.balance)}</div>
      <div>U: {formatEur(p.unpaid)}</div>
      <div>P: {formatEur(p.paid)}</div>
      <div>S: {formatEur(p.sent)}</div>
      <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>Total: {formatEur(p.total)}</div>
      <div style={{ marginTop: 2, fontSize: 10, color: "var(--text-muted)" }}>
        ({p.source})
      </div>
    </div>
  );
}
```

Define `PipelineTooltip` inside the `PipelineChart` function (so it has closure access to `formatDay` and `formatEur`), then in the JSX replace the bars + footer with:

```tsx
<div style={{ width: "100%", height: 140 }}>
  <ResponsiveContainer>
    <BarChart
      data={history}
      margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
      barCategoryGap={2}
    >
      <XAxis
        dataKey="date"
        tickFormatter={formatDay}
        interval="preserveStartEnd"
        tick={{ fontSize: 9, fill: "var(--text-muted)" }}
        axisLine={{ stroke: "var(--border)" }}
        tickLine={false}
      />
      <YAxis hide domain={[0, "auto"]} />
      <Tooltip
        content={<PipelineTooltip />}
        cursor={{ fill: "rgba(255,255,255,0.04)" }}
      />
      <Bar dataKey="balance" stackId="pipeline" fill={PIPELINE_COLORS.balance} isAnimationActive={false} />
      <Bar dataKey="sent"    stackId="pipeline" fill={PIPELINE_COLORS.sent}    isAnimationActive={false} />
      <Bar dataKey="paid"    stackId="pipeline" fill={PIPELINE_COLORS.paid}    isAnimationActive={false} />
      <Bar dataKey="unpaid"  stackId="pipeline" stackOrder="reverse" fill={PIPELINE_COLORS.unpaid} radius={[2, 2, 0, 0]} isAnimationActive={false} />
    </BarChart>
  </ResponsiveContainer>
</div>
```

The Recharts stack order matters: declaring `balance` first puts it at the bottom, then `sent`, then `paid`, then `unpaid` at the top. The `radius={[2, 2, 0, 0]}` on the topmost bar gives the stack rounded top corners. The `stackOrder="reverse"` prop is the official Recharts way to flip a single bar's render position; since we declared in bottom-up order it can stay default — remove that prop if Recharts version 3.8 doesn't support it. (Verified by checking your existing `EvSimulationPanel.tsx`'s stacked bar usage if needed.)

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: PASS. Watch for any Recharts type complaints — if `stackOrder` triggers an "unknown prop" error, drop that line (the bottom-up `<Bar>` order is already correct).

- [ ] **Step 6: Visual verification**

```bash
npm run dev
```

Open `/cardmarket`. Verify:
- Balance History: smooth area sparkline filling the panel width, faint gradient fill (cyan → transparent). Hover anywhere — a small dark-glass tooltip appears with the day (DD/MM) and the EUR balance.
- Sales Pipeline: stacked bar chart, same color order as before (info Bal at bottom → success Sent → accent Paid → warning Unpaid at top). X axis shows first/middle/last date labels at 9px muted. Hover a bar — tooltip lists Bal, U, P, S, Total, and (snapshot/reconstructed).
- Both charts render full-width inside their Panels with breathing room.
- Resize the browser narrower — `ResponsiveContainer` shrinks the chart cleanly.

Stop dev server.

- [ ] **Step 7: Commit**

```bash
git add components/cardmarket/CardmarketContent.tsx
git commit -m "feat(cardmarket): replace hand-rolled charts with Recharts

Balance History becomes a smooth area sparkline (AreaChart) with a
gradient fill and a dark-glass hover tooltip showing date + EUR.

Sales Pipeline becomes a real stacked BarChart with the same bottom-to-
top color order (Bal → Sent → Paid → Unpaid), a compact muted X axis,
and a tooltip listing all four legs plus Total and the snapshot/
reconstructed source flag.

Recharts is already in the dep tree and used by EvHistoryChart,
EvSimulationPanel, and StockChart — same dependency, same idiom."
```

---

## Task 9: Cardmarket — Orders rhythm + Sync Activity pills

**File:** `components/cardmarket/CardmarketContent.tsx`

Final pass. Brighten the Orders table row hover, swap the inline expanded-detail block for a real `<Panel inset>`, swap the bare pagination buttons for the new `<Pagination>` primitive, and rewrite the Sync Activity cryptic `+N ~M =K -L` text as explicit `StatusPill`s.

- [ ] **Step 1: Add imports**

```tsx
import { Pagination } from "@/components/dashboard/pagination";
```

(`Panel` and `StatusPill` are already imported from Task 7.)

- [ ] **Step 2: Brighten OrderRow hover**

In `OrderRow` (the `<tr onMouseEnter…>` around line 817), replace:

```tsx
onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
```

with:

```tsx
onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
```

- [ ] **Step 3: Replace the expanded order detail container with `<Panel inset>`**

In `OrderRow`, the expanded detail block (around line 887) currently wraps everything in:

```tsx
<div
  className="px-4 py-3 mx-2 mb-2 rounded-lg"
  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}
>
  {items.length > 0 ? (
```

Replace that opening `<div>` (and its matching `</div>` at the end of the expanded block) with:

```tsx
<div className="px-2 pb-2">
  <Panel inset>
    {items.length > 0 ? (
      // ...existing content...
    ) : (
      // ...existing empty state...
    )}
  </Panel>
</div>
```

The wrapping `<td>` already has `padding: 0`; the new outer `<div>` adds horizontal/bottom inset so the inset Panel doesn't touch the table edges.

- [ ] **Step 4: Replace the inline pagination block with the Pagination primitive**

Find the pagination block (lines 532–562). Replace the entire `{orders.total > 20 && (…)}` block with:

```tsx
{orders?.total != null && (
  <Pagination
    page={orderPage}
    total={orders.total}
    pageSize={20}
    onChange={setOrderPage}
  />
)}
```

`Pagination` itself returns `null` when there's only one page, so the outer guard is just protecting the access of `orders.total`.

- [ ] **Step 5: Rewrite Sync Activity stats as StatusPills**

Replace the entire log row inner `<div className="flex items-center justify-between">…</div>` (around lines 579–602 of Task 7's output) with:

```tsx
<div className="flex items-center justify-between gap-3">
  <div className="flex items-center gap-2 flex-wrap">
    <StatusPill tone="accent">{log.dataType}</StatusPill>
    {log.stats.added > 0 && (
      <StatusPill tone="success">+{log.stats.added} added</StatusPill>
    )}
    {log.stats.updated > 0 && (
      <StatusPill tone="info">~{log.stats.updated} updated</StatusPill>
    )}
    {log.stats.skipped > 0 && (
      <StatusPill tone="muted">={log.stats.skipped} skipped</StatusPill>
    )}
    {(log.stats as Record<string, number>).removed > 0 && (
      <StatusPill tone="danger">-{(log.stats as Record<string, number>).removed} removed</StatusPill>
    )}
  </div>
  <div className="flex items-center gap-2 shrink-0">
    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
      {log.submittedBy}
    </span>
    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
      {formatAgo(log.receivedAt)}
    </span>
  </div>
</div>
```

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Visual verification**

```bash
npm run dev
```

Open `/cardmarket`:
- Hover an order row — background brightens noticeably (`var(--bg-card-hover)`), not the near-invisible hover from before.
- Click a row to expand — the detail block renders inside a real glass `Panel` with the inset padding, indented from the row edges, glass treatment matching the rest of the page.
- If there are >20 orders for the active tab, scroll to the bottom — pagination shows "Page 1 of N" + Prev/Next buttons in the new shared style.
- Open Sync Activity — each row shows the dataType accent pill plus 1–4 colored stat pills (`+12 added` green, `~3 updated` blue, `=5 skipped` muted, `-1 removed` red). Zero-count pills don't render.

Stop dev server.

- [ ] **Step 8: Commit**

```bash
git add components/cardmarket/CardmarketContent.tsx
git commit -m "feat(cardmarket): polish Orders rhythm + Sync Activity pills

Orders table:
- Row hover brightens to var(--bg-card-hover) instead of the near-
  invisible 2% white that was there before
- Expanded detail wraps in <Panel inset> with proper glass treatment
  and inset padding from the row edges
- Pagination uses the new shared Pagination primitive

Sync Activity:
- Cryptic '+N ~M =K -L' string becomes explicit colored StatusPills
  (success / info / muted / danger). Zero-count pills hidden."
```

---

## After Task 9

The branch contains 9 commits on top of `main`. Each is independently revertable via `git revert <sha>`.

- [ ] **Final visual check** — `npm run dev`, walk through Storage Setup, Investments + Create Investment modal, Finance, Cardmarket. Confirm Storage Setup and the Investment modal look identical to before (Tasks 1–2 were intended to be visually invisible). Confirm Finance and Cardmarket now read as siblings of those reference surfaces.

- [ ] **Hand-off to user.** The user reviews. If approved → `gh pr create` (or merge directly). If scrapped → `git checkout main && git branch -D ui/redesign-finance-cardmarket`.

---

## Self-review notes

Spec coverage walk-through:

- [x] Bug fixes (6 items in spec) — Tasks 4 (`var(--error)` fallback drop, Add button color, ConfirmModal swap) and 7 (`var(--bg-primary)` fix, FoilStar swap, hand-rolled `#eab308` swap). Note `var(--bg-primary)` fix lands in Task 7 step 6 (toggle) and Task 7 step 6 again (Print All button) — both addressed.
- [x] Shared primitives — `Panel/H1/H2/H3/Field/Note` (Task 1), `KindCard` (Task 2), `StatusPill/Pagination` (Task 3), `MetricRow` (Task 6). All 7 listed in the spec are accounted for.
- [x] Finance — header (Task 4), CM Revenue Panel + MetricRow (Tasks 4 + 6), Transactions Panel (Task 4), Add Transaction KindCard rework (Task 5).
- [x] Cardmarket — header (Task 7), 4 panel wrappers (Task 7), Recharts (Task 8), Orders rhythm (Task 9), Sync Activity pills (Task 9).
- [x] Per-task manual verification matches the spec's Manual Verification section.
- [x] No placeholders — every code block is concrete; no "TBD" / "implement later" / "similar to Task N".
- [x] Type consistency — `KindCardProps`, `FieldProps`, `PanelProps`, `H1Props/H2Props`, `StatusPillTone`, `MetricRowItem` all defined once, used consistently.
