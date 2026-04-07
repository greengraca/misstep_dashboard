import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { logActivity } from "@/lib/activity";

const COLLECTION = "dashboard_transactions";

export async function getAll() {
  const db = await getDb();
  const data = await db.collection(COLLECTION).find().sort({ date: -1 }).toArray();

  // Build monthly breakdown for chart
  const monthlyMap: Record<string, { income: number; expenses: number }> = {};
  for (const t of data as unknown as Array<{ date: string | Date; type: string; amount: number }>) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap[key]) monthlyMap[key] = { income: 0, expenses: 0 };
    if (t.type === "income") monthlyMap[key].income += t.amount;
    else monthlyMap[key].expenses += t.amount;
  }
  const monthly = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, vals]) => ({ month, ...vals }));

  return { data, monthly };
}

export async function create(data: Record<string, unknown>, userName: string) {
  const db = await getDb();
  const doc = { ...data, createdAt: new Date(), updatedAt: new Date() };
  const result = await db.collection(COLLECTION).insertOne(doc);
  logActivity("create", "transaction", result.insertedId.toString(), `Created by ${userName}`, "system", userName);
  return { ...doc, _id: result.insertedId };
}

export async function update(id: string, data: Record<string, unknown>, userName: string) {
  const db = await getDb();
  const { _id, ...updateData } = data;
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...updateData, updatedAt: new Date() } }
  );
  logActivity("update", "transaction", id, `Updated by ${userName}`, "system", userName);
  return { success: true };
}

export async function remove(id: string) {
  const db = await getDb();
  await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  logActivity("delete", "transaction", id, "Deleted", "system", "system");
}
