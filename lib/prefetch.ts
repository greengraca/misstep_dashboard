import { preload } from "swr";
import { fetcher } from "@/lib/fetcher";

const ROUTE_PREFETCH_MAP: Record<string, string[]> = {
  "/": ["/api/home/stats"],
  "/analytics": ["/api/analytics"],
  "/finance": ["/api/finance"],
  "/meetings": ["/api/meetings"],
  "/tasks": ["/api/tasks"],
  "/activity": ["/api/activity"],
  "/settings": ["/api/settings"],
};

const recentlyPrefetched = new Map<string, number>();
const DEBOUNCE_MS = 60_000;

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
