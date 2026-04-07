export const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.error || `HTTP ${r.status}`);
  }
  return r.json();
};
