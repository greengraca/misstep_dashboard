import { getDb } from "@/lib/mongodb";

const COLLECTION = "dashboard_analytics_data";

export async function getAnalytics() {
  const db = await getDb();
  const docs = await db.collection(COLLECTION).find().sort({ date: 1 }).toArray() as unknown as Array<{
    date: string | Date;
    views: number;
    category?: string;
    label?: string;
  }>;

  if (docs.length === 0) {
    return {
      totalViews: 0,
      avgDaily: 0,
      peakDay: "—",
      trend: 0,
      timeSeries: [],
      byCategory: [],
      barData: [],
    };
  }

  const totalViews = docs.reduce((s, d) => s + (d.views ?? 0), 0);
  const avgDaily = Math.round(totalViews / docs.length);

  let peak = docs[0];
  for (const d of docs) {
    if ((d.views ?? 0) > (peak.views ?? 0)) peak = d;
  }
  const peakDay = peak ? new Date(peak.date).toLocaleDateString() : "—";

  const half = Math.floor(docs.length / 2);
  const firstHalf = docs.slice(0, half).reduce((s, d) => s + (d.views ?? 0), 0);
  const secondHalf = docs.slice(half).reduce((s, d) => s + (d.views ?? 0), 0);
  const trend = firstHalf > 0 ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100) : 0;

  const timeSeries = docs.map(d => ({
    date: new Date(d.date).toLocaleDateString(),
    views: d.views ?? 0,
  }));

  const categoryMap: Record<string, number> = {};
  for (const d of docs) {
    const cat = d.category ?? "Other";
    categoryMap[cat] = (categoryMap[cat] ?? 0) + (d.views ?? 0);
  }
  const byCategory = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));

  const labelMap: Record<string, number> = {};
  for (const d of docs) {
    const lbl = d.label ?? "Unknown";
    labelMap[lbl] = (labelMap[lbl] ?? 0) + (d.views ?? 0);
  }
  const barData = Object.entries(labelMap).map(([label, count]) => ({ label, count }));

  return { totalViews, avgDaily, peakDay, trend, timeSeries, byCategory, barData };
}
