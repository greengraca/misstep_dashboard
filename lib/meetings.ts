import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { logActivity } from "@/lib/activity";

const MEETINGS_COLLECTION = "dashboard_meetings";
const NOTES_COLLECTION = "dashboard_meeting_notes";

export async function getAll() {
  const db = await getDb();
  const meetings = await db.collection(MEETINGS_COLLECTION).find().sort({ date: -1 }).toArray() as Array<{ _id: ObjectId; [key: string]: unknown }>;
  // Attach notes inline
  const ids = meetings.map(m => m._id);
  const notes = await db.collection(NOTES_COLLECTION).find({ meetingId: { $in: ids.map(id => id.toString()) } }).toArray() as unknown as Array<{ meetingId: string; content: string }>;
  const notesMap = Object.fromEntries(notes.map(n => [n.meetingId, n.content]));
  return meetings.map(m => ({ ...m, notes: notesMap[m._id.toString()] ?? null }));
}

export async function create(data: Record<string, unknown>, userName: string) {
  const db = await getDb();
  const { notes, ...meetingData } = data;
  const doc = { ...meetingData, createdAt: new Date(), updatedAt: new Date() };
  const result = await db.collection(MEETINGS_COLLECTION).insertOne(doc);
  if (notes) {
    await db.collection(NOTES_COLLECTION).insertOne({
      meetingId: result.insertedId.toString(),
      content: notes,
      updatedAt: new Date(),
    });
  }
  logActivity("create", "meeting", result.insertedId.toString(), `Created by ${userName}`, "system", userName);
  return { ...doc, _id: result.insertedId, notes: notes ?? null };
}

export async function update(id: string, data: Record<string, unknown>, userName: string) {
  const db = await getDb();
  const { _id, notes, ...updateData } = data;
  await db.collection(MEETINGS_COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...updateData, updatedAt: new Date() } }
  );
  if (notes !== undefined) {
    await db.collection(NOTES_COLLECTION).updateOne(
      { meetingId: id },
      { $set: { content: notes, updatedAt: new Date() } },
      { upsert: true }
    );
  }
  logActivity("update", "meeting", id, `Updated by ${userName}`, "system", userName);
  return { success: true };
}

export async function remove(id: string) {
  const db = await getDb();
  await db.collection(MEETINGS_COLLECTION).deleteOne({ _id: new ObjectId(id) });
  await db.collection(NOTES_COLLECTION).deleteOne({ meetingId: id });
  logActivity("delete", "meeting", id, "Deleted", "system", "system");
}
