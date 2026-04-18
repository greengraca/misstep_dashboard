import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { logActivity } from "@/lib/activity";

const COLLECTION = "dashboard_team_members";

// Seeds only run when the collection is completely empty — safe to keep
// on; won't overwrite real members if someone renames or deletes.
const SEED_MEMBERS = ["Graça", "Bezugas", "Mil"];

export interface TeamMember {
  _id: string;
  name: string;
  role: string;
  email?: string;
  created_at: string;
}

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  const db = await getDb();
  const col = db.collection(COLLECTION);
  try {
    await col.createIndex({ name: 1 }, { unique: true });
  } catch {
    // index may already exist — fine
  }
  const count = await col.estimatedDocumentCount();
  if (count === 0) {
    const now = new Date().toISOString();
    await col.insertMany(
      SEED_MEMBERS.map((name) => ({
        name,
        role: "member",
        created_at: now,
      }))
    );
  }
  initialized = true;
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  await ensureInitialized();
  const db = await getDb();
  const docs = await db
    .collection(COLLECTION)
    .find()
    .sort({ name: 1 })
    .toArray();
  return docs.map((d) => ({
    _id: d._id.toString(),
    name: d.name as string,
    role: (d.role as string) ?? "member",
    email: d.email as string | undefined,
    created_at:
      (d.created_at as string) ?? new Date().toISOString(),
  }));
}

export async function getTeamMemberNames(): Promise<string[]> {
  const members = await getTeamMembers();
  return members.map((m) => m.name);
}

export async function createTeamMember(
  data: { name: string; role?: string; email?: string },
  actor: string
): Promise<TeamMember> {
  await ensureInitialized();
  const db = await getDb();
  const doc = {
    name: data.name.trim(),
    role: data.role?.trim() || "member",
    email: data.email?.trim() || undefined,
    created_at: new Date().toISOString(),
  };
  if (!doc.name) throw new Error("name required");
  const res = await db.collection(COLLECTION).insertOne(doc);
  logActivity(
    "create",
    "team_member",
    res.insertedId.toString(),
    `Added ${doc.name}`,
    "system",
    actor
  );
  return { ...doc, _id: res.insertedId.toString() };
}

export async function updateTeamMember(
  id: string,
  data: Partial<{ name: string; role: string; email: string }>,
  actor: string
): Promise<void> {
  await ensureInitialized();
  const db = await getDb();
  const update: Record<string, unknown> = {};
  if (typeof data.name === "string" && data.name.trim()) update.name = data.name.trim();
  if (typeof data.role === "string") update.role = data.role.trim() || "member";
  if (typeof data.email === "string") update.email = data.email.trim() || undefined;
  if (Object.keys(update).length === 0) return;
  await db
    .collection(COLLECTION)
    .updateOne({ _id: new ObjectId(id) }, { $set: update });
  logActivity(
    "update",
    "team_member",
    id,
    `Updated ${Object.keys(update).join(", ")}`,
    "system",
    actor
  );
}

export async function removeTeamMember(id: string, actor: string): Promise<void> {
  await ensureInitialized();
  const db = await getDb();
  await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  logActivity("delete", "team_member", id, `Removed by ${actor}`, "system", actor);
}
