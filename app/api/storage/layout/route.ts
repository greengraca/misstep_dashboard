import { withAuth, withAuthRead } from "@/lib/api-helpers";
import { getLayout, setLayout } from "@/lib/storage-db";
import { logActivity } from "@/lib/activity";
import type { ShelfLayout } from "@/lib/storage";

export const GET = withAuthRead(async () => {
  const data = await getLayout();
  return { data };
}, "storage-layout-get");

export const PUT = withAuth(async (req, session) => {
  const body = (await req.json()) as ShelfLayout;
  if (!body || !Array.isArray(body.shelfRows)) {
    return Response.json({ error: "Invalid layout body" }, { status: 400 });
  }
  const saved = await setLayout(body);
  logActivity(
    "update",
    "storage_layout",
    "current",
    `shelfRows=${saved.shelfRows.length} totalBoxes=${saved.shelfRows.reduce((n, r) => n + r.boxes.length, 0)}`,
    "system",
    session.user?.name ?? "unknown"
  );
  return { data: saved };
}, "storage-layout-put");
