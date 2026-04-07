"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface SensitiveDataContextValue {
  hidden: boolean;
  setHidden: (value: boolean) => void;
}

const SensitiveDataContext = createContext<SensitiveDataContextValue>({
  hidden: false,
  setHidden: () => {},
});

const STORAGE_KEY = "misstep-hide-sensitive";

export function SensitiveDataProvider({ children }: { children: ReactNode }) {
  const [hidden, setHiddenState] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "true") setHiddenState(true);
    } catch {}
  }, []);

  function setHidden(value: boolean) {
    setHiddenState(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {}
  }

  return (
    <SensitiveDataContext.Provider value={{ hidden, setHidden }}>
      {children}
    </SensitiveDataContext.Provider>
  );
}

export function useSensitiveData() {
  return useContext(SensitiveDataContext);
}
