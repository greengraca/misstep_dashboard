import { preload } from "swr";
import { fetcher } from "@/lib/fetcher";

const ROUTE_PREFETCH_MAP: Record<string, string[]> = {
  "/": ["/api/home/stats"],
  "/finance": ["/api/finance"],
  "/meetings": ["/api/meetings"],
  "/tasks": ["/api/tasks"],
  "/activity": ["/api/activity"],
  "/cardmarket": ["/api/ext/status", "/api/ext/orders?page=1&limit=20"],
  "/ev": ["/api/ev/sets"],
  "/settings": ["/api/settings"],
};

const recentlyPrefetched = new Map<string, number>();
const DEBOUNCE_MS = 15_000;

export function prefetchRouteData(href: string) {
  const keys = ROUTE_PREFETCH_MAP[href];
  if (!keys) return;

  const now = Date.now();
  for (const key of keys) {
    const last = recentlyPrefetched.get(key) || 0;
    if (now - last < DEBOUNCE_MS) continue;
    recentlyPrefetched.set(key, now);
    preload(key, fetcher);
  }
}
