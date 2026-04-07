import { withAuthRead } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";

const COLLECTION = "dashboard_activity_log";

export const GET = withAuthRead(async (request) => {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entity_type");
  const action = searchParams.get("action");

  const db = await getDb();
  const filter: Record<string, unknown> = {};
  if (entityType) filter.entity_type = entityType;
  if (action) filter.action = action;

  const data = await db.collection(COLLECTION).find(filter).sort({ timestamp: -1 }).limit(200).toArray();

  // Collect distinct values for filter dropdowns
  const allDocs = await db.collection(COLLECTION).find({}, { projection: { entity_type: 1, action: 1 } }).toArray() as unknown as Array<{ entity_type?: string; action?: string }>;
  const entityTypes = [...new Set(allDocs.map(d => d.entity_type).filter(Boolean))];
  const actions = [...new Set(allDocs.map(d => d.action).filter(Boolean))];

  return { data, entityTypes, actions };
}, "activity-list");
