import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { logActivity } from "@/lib/activity";

const COLLECTION = "dashboard_tasks";

export async function getAll() {
  const db = await getDb();
  return db.collection(COLLECTION).find().sort({ createdAt: -1 }).toArray();
}

export async function create(data: Record<string, unknown>, userName: string) {
  const db = await getDb();
  const doc = { ...data, createdAt: new Date(), updatedAt: new Date() };
  const result = await db.collection(COLLECTION).insertOne(doc);
  logActivity("create", "task", result.insertedId.toString(), `Created by ${userName}`, "system", userName);
  return { ...doc, _id: result.insertedId };
}

export async function update(id: string, data: Record<string, unknown>, userName: string) {
  const db = await getDb();
  const { _id, ...updateData } = data;
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...updateData, updatedAt: new Date() } }
  );
  logActivity("update", "task", id, `Updated by ${userName}`, "system", userName);
  return { success: true };
}

export async function remove(id: string) {
  const db = await getDb();
  await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  logActivity("delete", "task", id, "Deleted", "system", "system");
}
