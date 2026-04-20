"use client";

import { useState } from "react";
import { FoilStar, LanguageFlag } from "@/components/dashboard/cm-sprite";
import type { AppraiserCard } from "@/lib/appraiser/types";

interface Props {
  collectionId: string;
  cards: AppraiserCard[];
  onCardChanged: () => void;
}

const OFFER_OPTIONS = [5, 10, 15, 20] as const;

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

  const th = { textAlign: "left" as const, padding: "8px 10px", fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" as const, fontFamily: "var(--font-mono)" };
  const td = { padding: "8px 10px", borderTop: "1px solid var(--border)", fontSize: 13 };

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Set / CN</th>
              <th style={th}>Lang</th>
              <th style={th}>Foil</th>
              <th style={th}>Qty</th>
              <th style={th}>From</th>
              <th style={th}>Trend</th>
              <th style={th}>
                Offer{" "}
                <select value={offerPct} onChange={(e) => setOfferPct(Number(e.target.value))}
                  style={{ background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 4px" }}>
                  {OFFER_OPTIONS.map((p) => <option key={p} value={p}>-{p}%</option>)}
                </select>
              </th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c._id}>
                <td style={{ ...td, display: "flex", alignItems: "center", gap: 8 }}>
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
                </td>
                <td style={td}>{c.set ? `${c.set.toUpperCase()}${c.collectorNumber ? " #" + c.collectorNumber : ""}` : "?"}</td>
                <td style={td}>
                  <LanguageFlag language={c.language} />
                </td>
                <td style={td}>
                  <button
                    onClick={() => putCard(c._id, { foil: !c.foil })}
                    title={c.foil ? "Click to un-foil" : "Click to mark foil"}
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    {c.foil ? <FoilStar /> : <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </button>
                </td>
                <td style={td}>
                  {editingQty === c._id ? (
                    <input type="number" min={1} value={qtyValue}
                      onChange={(e) => setQtyValue(e.target.value)}
                      onBlur={async () => {
                        const q = parseInt(qtyValue, 10);
                        if (q > 0) await putCard(c._id, { qty: q });
                        setEditingQty(null);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      autoFocus
                      style={{ width: 48, padding: "2px 6px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)" }} />
                  ) : (
                    <span onClick={() => { setEditingQty(c._id); setQtyValue(String(c.qty)); }}
                      title="Click to edit quantity"
                      style={{
                        cursor: "pointer",
                        padding: "2px 6px",
                        borderRadius: 4,
                        borderBottom: "1px dashed var(--text-muted)",
                        transition: "background 120ms, color 120ms",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                        e.currentTarget.style.color = "var(--text-primary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "inherit";
                      }}>
                      {c.qty}
                    </span>
                  )}
                </td>
                <td style={td}>{eur(c.fromPrice)}</td>
                <td style={td}>{eur(c.trendPrice)}</td>
                <td style={{ ...td, color: "var(--accent)", fontWeight: 600 }}>
                  {eur(c.fromPrice !== null ? c.fromPrice * (1 - offerPct / 100) : null)}
                </td>
                <td style={td}>
                  <button onClick={() => deleteCard(c._id)}
                    title="Remove card"
                    style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16 }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 16, padding: "12px 16px", borderTop: "1px solid var(--border)", flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
        <span>{totalCards} card{totalCards !== 1 ? "s" : ""}</span>
        <span>From: <strong>{eur(totalFrom)}</strong></span>
        <span>Trend: <strong>{eur(totalTrend)}</strong></span>
        {OFFER_OPTIONS.map((p) => (
          <span key={p} style={{ color: p === offerPct ? "var(--accent)" : "var(--text-secondary)" }}>
            -{p}%: <strong>{eur(totalFrom * (1 - p / 100))}</strong>
          </span>
        ))}
        <button onClick={copyAll}
          style={{ marginLeft: "auto", padding: "6px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text-secondary)", cursor: "pointer" }}>
          Copy
        </button>
      </div>
    </div>
  );
}
