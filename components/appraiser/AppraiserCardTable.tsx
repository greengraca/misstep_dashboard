"use client";

import { useState } from "react";
import Select from "@/components/dashboard/select";
import { FoilStar, LanguageFlag } from "@/components/dashboard/cm-sprite";
import type { AppraiserCard } from "@/lib/appraiser/types";
import { sectionHeader, btnSecondary, btnGhost } from "./ui";

interface Props {
  collectionId: string;
  cards: AppraiserCard[];
  onCardChanged: () => void;
}

const OFFER_OPTIONS = [5, 10, 15, 20] as const;
const OFFER_SELECT_OPTIONS = OFFER_OPTIONS.map((p) => ({ value: String(p), label: `-${p}%` }));

function eur(n: number | null): string {
  if (n === null || n === undefined) return "--";
  return n.toFixed(2).replace(".", ",") + " €";
}

export default function AppraiserCardTable({ collectionId, cards, onCardChanged }: Props) {
  const [offerPct, setOfferPct] = useState<number>(5);
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [qtyValue, setQtyValue] = useState("");

  const putCard = async (cardId: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/appraiser/collections/${collectionId}/cards/${cardId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) onCardChanged();
  };

  const deleteCard = async (cardId: string) => {
    await fetch(`/api/appraiser/collections/${collectionId}/cards/${cardId}`, { method: "DELETE" });
    onCardChanged();
  };

  const totalCards = cards.reduce((s, c) => s + c.qty, 0);
  const totalFrom = cards.reduce((s, c) => s + (c.fromPrice ?? 0) * c.qty, 0);
  const totalTrend = cards.reduce((s, c) => s + (c.trendPrice ?? 0) * c.qty, 0);

  const copyAll = async () => {
    const header = `Name\tSet\tCN\tLang\tFoil\tQty\tFrom\tTrend\tOffer -${offerPct}%`;
    const lines = cards.map((c) => [
      c.name, c.set.toUpperCase(), c.collectorNumber, c.language,
      c.foil ? "foil" : "", c.qty,
      eur(c.fromPrice), eur(c.trendPrice),
      eur(c.fromPrice !== null ? c.fromPrice * (1 - offerPct / 100) : null),
    ].join("\t"));
    const summary = [
      "",
      `Total cards: ${totalCards}`,
      `Total From: ${eur(totalFrom)}`,
      `Total Trend: ${eur(totalTrend)}`,
      `Offer -${offerPct}%: ${eur(totalFrom * (1 - offerPct / 100))}`,
    ];
    await navigator.clipboard.writeText([header, ...lines, ...summary].join("\n"));
  };

  if (cards.length === 0) return null;

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 11,
    color: "var(--text-muted)",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
    background: "var(--bg-card)",
    borderBottom: "1px solid var(--border)",
  };
  const td: React.CSSProperties = {
    padding: "10px 12px",
    borderTop: "1px solid var(--border)",
    fontSize: 13,
    color: "var(--text-primary)",
    verticalAlign: "middle",
  };

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <h3 style={sectionHeader}>Cards</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
          <span>Offer</span>
          <Select
            value={String(offerPct)}
            onChange={(v) => setOfferPct(Number(v))}
            options={OFFER_SELECT_OPTIONS}
            size="sm"
          />
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Set / CN</th>
              <th style={th}>Lang</th>
              <th style={th}>Foil</th>
              <th style={th}>Qty</th>
              <th style={{ ...th, textAlign: "right" }}>From</th>
              <th style={{ ...th, textAlign: "right" }}>Trend</th>
              <th style={{ ...th, textAlign: "right" }}>Offer -{offerPct}%</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr
                key={c._id}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                style={{ transition: "background 120ms" }}
              >
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {c.imageUrl && <img src={c.imageUrl} alt="" style={{ width: 24, height: 34, objectFit: "cover", borderRadius: 3 }} />}
                    {c.cardmarketUrl ? (
                      <a href={c.foil ? `${c.cardmarketUrl}${c.cardmarketUrl.includes("?") ? "&" : "?"}isFoil=Y` : c.cardmarketUrl}
                        target="_blank" rel="noopener noreferrer"
                        style={{ color: "var(--accent)", textDecoration: "none" }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                        title="Open on Cardmarket — your extension will scrape prices">
                        {c.name} ↗
                      </a>
                    ) : c.name}
                  </div>
                </td>
                <td style={{ ...td, color: "var(--text-secondary)" }}>
                  {c.set ? `${c.set.toUpperCase()}${c.collectorNumber ? " #" + c.collectorNumber : ""}` : "?"}
                </td>
                <td style={td}>
                  <LanguageFlag language={c.language} />
                </td>
                <td style={td}>
                  <button
                    onClick={() => putCard(c._id, { foil: !c.foil })}
                    title={c.foil ? "Click to un-foil" : "Click to mark foil"}
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center" }}
                  >
                    {c.foil ? <FoilStar /> : <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </button>
                </td>
                <td style={td}>
                  {editingQty === c._id ? (
                    <input
                      className="appraiser-field"
                      type="number"
                      min={1}
                      value={qtyValue}
                      onChange={(e) => setQtyValue(e.target.value)}
                      onBlur={async () => {
                        const q = parseInt(qtyValue, 10);
                        if (q > 0) await putCard(c._id, { qty: q });
                        setEditingQty(null);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      autoFocus
                      style={{
                        width: 56,
                        padding: "4px 8px",
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        color: "var(--text-primary)",
                        fontSize: 13,
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => { setEditingQty(c._id); setQtyValue(String(c.qty)); }}
                      title="Click to edit quantity"
                      style={{
                        cursor: "pointer",
                        padding: "2px 6px",
                        borderRadius: 4,
                        borderBottom: "1px dashed var(--text-muted)",
                        transition: "background 120ms, color 120ms",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--bg-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}>
                      {c.qty}
                    </span>
                  )}
                </td>
                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>{eur(c.fromPrice)}</td>
                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{eur(c.trendPrice)}</td>
                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 600 }}>
                  {eur(c.fromPrice !== null ? c.fromPrice * (1 - offerPct / 100) : null)}
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button
                    onClick={() => deleteCard(c._id)}
                    title="Remove card"
                    style={{ ...btnGhost, fontSize: 18, lineHeight: 1 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--error)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 16, padding: "12px 16px", borderTop: "1px solid var(--border)", flexWrap: "wrap", alignItems: "center", fontSize: 13, background: "var(--bg-card)" }}>
        <span style={{ color: "var(--text-muted)" }}>{totalCards} card{totalCards !== 1 ? "s" : ""}</span>
        <span>From: <strong style={{ fontFamily: "var(--font-mono)" }}>{eur(totalFrom)}</strong></span>
        <span style={{ color: "var(--text-secondary)" }}>Trend: <strong style={{ fontFamily: "var(--font-mono)" }}>{eur(totalTrend)}</strong></span>
        {OFFER_OPTIONS.map((p) => (
          <span key={p} style={{ color: p === offerPct ? "var(--accent)" : "var(--text-muted)" }}>
            -{p}%: <strong style={{ fontFamily: "var(--font-mono)" }}>{eur(totalFrom * (1 - p / 100))}</strong>
          </span>
        ))}
        <button onClick={copyAll} style={{ ...btnSecondary, marginLeft: "auto" }}>Copy</button>
      </div>
    </div>
  );
}
