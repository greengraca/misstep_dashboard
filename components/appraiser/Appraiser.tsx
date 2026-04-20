// components/appraiser/Appraiser.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import CollectionSelector from "./CollectionSelector";
import AppraiserInput from "./AppraiserInput";
import AppraiserCardTable from "./AppraiserCardTable";
import type { AppraiserCard, AppraiserCollection } from "@/lib/appraiser/types";

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
});

const STORAGE_KEY = "appraiser_selectedCollection";

export default function Appraiser() {
  const [selectedId, setSelectedId] = useState<string>("");

  // Hydrate selection from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored) setSelectedId(stored);
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  };

  const listSwr = useSWR<{ collections: AppraiserCollection[] }>("/api/appraiser/collections", fetcher);
  const collections = listSwr.data?.collections ?? [];

  const detailKey = selectedId ? `/api/appraiser/collections/${selectedId}` : null;
  const detailSwr = useSWR<{ collection: AppraiserCollection; cards: AppraiserCard[] }>(
    detailKey,
    fetcher,
    {
      refreshInterval: (data) => {
        if (!data?.cards?.length) return 0;
        // Poll every 3s while any card is awaiting a CM scrape
        const hasPending = data.cards.some((c) => c.fromPrice === null && c.status !== "error");
        return hasPending ? 3000 : 0;
      },
    }
  );
  const cards = detailSwr.data?.cards ?? [];

  const handleCollectionChanged = useCallback(() => {
    listSwr.mutate();
    if (selectedId) detailSwr.mutate();
  }, [listSwr, detailSwr, selectedId]);

  const handleCardsAdded = useCallback(() => {
    detailSwr.mutate();
    listSwr.mutate();
  }, [detailSwr, listSwr]);

  const handleCardChanged = useCallback(() => {
    detailSwr.mutate();
    listSwr.mutate();
  }, [detailSwr, listSwr]);

  const handleAfterRefresh = useCallback(async () => {
    await Promise.all([detailSwr.mutate(), listSwr.mutate()]);
  }, [detailSwr, listSwr]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>Appraiser</h1>

      <CollectionSelector
        collections={collections}
        selectedId={selectedId}
        onSelect={handleSelect}
        onChanged={handleCollectionChanged}
        onAfterRefresh={handleAfterRefresh}
      />

      {selectedId ? (
        <>
          <AppraiserInput collectionId={selectedId} onCardsAdded={handleCardsAdded} />
          <AppraiserCardTable
            collectionId={selectedId}
            cards={cards}
            onCardChanged={handleCardChanged}
          />
        </>
      ) : (
        <p style={{ color: "var(--text-muted)", padding: 20, textAlign: "center" }}>
          Select or create a collection to start appraising cards.
        </p>
      )}
    </div>
  );
}
