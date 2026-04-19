"use client";

// Global "view discount" — a UI-only adjustment that subtracts a percentage
// from displayed prices everywhere (grid cards, detail totals, decklists).
// Backed by localStorage so it persists across sessions and is shared
// between every component that calls useDiscount(). Mutations broadcast a
// custom `ev-discount-change` event so all subscribers re-render in sync
// (the native `storage` event only fires across tabs, not within one).

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "ev:discount";
const EVENT_NAME = "ev-discount-change";
const DEFAULT_PERCENT = 15;

export interface DiscountState {
  enabled: boolean;
  percent: number;
}

function load(): DiscountState {
  if (typeof window === "undefined") return { enabled: false, percent: DEFAULT_PERCENT };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: false, percent: DEFAULT_PERCENT };
    const parsed = JSON.parse(raw) as Partial<DiscountState>;
    const percent =
      typeof parsed.percent === "number" && parsed.percent >= 0 && parsed.percent <= 100
        ? parsed.percent
        : DEFAULT_PERCENT;
    return { enabled: parsed.enabled === true, percent };
  } catch {
    return { enabled: false, percent: DEFAULT_PERCENT };
  }
}

function save(state: DiscountState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable (private mode etc.) — silently ignore.
  }
}

export function useDiscount() {
  // SSR-safe initial state. We hydrate from localStorage in the effect below.
  const [state, setState] = useState<DiscountState>({ enabled: false, percent: DEFAULT_PERCENT });
  // Mirror state into a ref so `update()` can compute the next value without
  // performing side effects inside React's setState reducer (doing
  // window.dispatchEvent during a reducer triggers other useDiscount()
  // subscribers' setState during render, which React forbids).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    setState(load());
    const sync = () => setState(load());
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((partial: Partial<DiscountState>) => {
    const next = { ...stateRef.current, ...partial };
    stateRef.current = next;
    setState(next);
    save(next);
    // Notify other useDiscount() instances. Safe here — we're in an event
    // handler (the toggle's onChange), not inside a render or reducer.
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  const apply = useCallback(
    <T extends number | null | undefined>(price: T): T => {
      if (price == null || !state.enabled) return price;
      return ((price as number) * (1 - state.percent / 100)) as T;
    },
    [state.enabled, state.percent]
  );

  return {
    enabled: state.enabled,
    percent: state.percent,
    setEnabled: (v: boolean) => update({ enabled: v }),
    setPercent: (v: number) => update({ percent: v }),
    apply,
  };
}
