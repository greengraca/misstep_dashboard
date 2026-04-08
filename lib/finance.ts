import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { logActivity } from "@/lib/activity";
import type { Transaction, PendingReimbursement } from "@/lib/types";

const COLLECTION = "dashboard_transactions";

export async function getTransactions(month: string): Promise<Transaction[]> {
  const db = await getDb();
  const docs = await db
    .collection(COLLECTION)
    .find({ month })
    .sort({ date: -1 })
    .toArray();
  return docs as unknown as Transaction[];
}

export async function create(
  data: {
    date: string;
    type: string;
    category: string;
    description: string;
    amount: number;
    paid_by?: string | null;
  },
  userName: string
): Promise<Transaction> {
  const db = await getDb();
  const now = new Date().toISOString();
  const month = data.date.slice(0, 7); // "YYYY-MM" from "YYYY-MM-DD"

  const doc = {
    month,
    date: data.date,
    type: data.type,
    category: data.category,
    description: data.description,
    amount: data.amount,
    paid_by: data.paid_by || null,
    reimbursed: false,
    reimbursed_at: null,
    created_at: now,
    updated_at: now,
  };

  const result = await db.collection(COLLECTION).insertOne(doc);
  logActivity("create", "transaction", result.insertedId.toString(), `${data.type}: ${data.description}`, "system", userName);
  return { ...doc, _id: result.insertedId.toString() } as unknown as Transaction;
}

export async function update(
  id: string,
  data: Record<string, unknown>,
  userName: string
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const { _id, created_at, ...updateData } = data;

  // Recalculate month if date changed
  if (typeof updateData.date === "string") {
    updateData.month = (updateData.date as string).slice(0, 7);
  }

  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...updateData, updated_at: now } }
  );
  logActivity("update", "transaction", id, `Updated by ${userName}`, "system", userName);
}

export async function remove(id: string, userName: string): Promise<void> {
  const db = await getDb();
  await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  logActivity("delete", "transaction", id, `Deleted by ${userName}`, "system", userName);
}

export async function getPendingReimbursements(): Promise<PendingReimbursement[]> {
  const db = await getDb();
  const docs = await db
    .collection(COLLECTION)
    .find({
      type: "expense",
      paid_by: { $ne: null, $exists: true },
      reimbursed: { $ne: true },
    })
    .sort({ date: -1 })
    .toArray();

  return docs.map((d) => ({
    id: d._id.toString(),
    description: d.description as string,
    amount: d.amount as number,
    paid_by: d.paid_by as string,
    date: d.date as string,
  }));
}

export async function reimburse(id: string, userName: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { reimbursed: true, reimbursed_at: now, updated_at: now } }
  );
  logActivity("update", "transaction", id, "Marked as reimbursed", "system", userName);
}

export async function unreimburse(id: string, userName: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { reimbursed: false, reimbursed_at: null, updated_at: now } }
  );
  logActivity("update", "transaction", id, "Unmarked reimbursement", "system", userName);
}
