import { withAuthRead } from "@/lib/api-helpers";
import { queryStorageSlots } from "@/lib/storage-db";

export const GET = withAuthRead(async (req) => {
  const params = req.nextUrl.searchParams;
  const result = await queryStorageSlots({
    shelfRowId: params.get("shelfRowId") ?? undefined,
    boxId: params.get("boxId") ?? undefined,
    set: params.get("set") ?? undefined,
    colorGroup: params.get("colorGroup") ?? undefined,
    search: params.get("search") ?? undefined,
    page: Math.max(1, parseInt(params.get("page") ?? "1", 10)),
    // Cap raised from 500 to 50000 because the 3D scene + box-contents panel
    // both rely on the global slot list to render box fills and accept
    // box-click → contents queries. ~20k placed slots is ~2 MB gzipped JSON;
    // fits comfortably in a single response. If we ever outgrow this, split
    // the 3D-render path into a dedicated lightweight projection endpoint.
    pageSize: Math.min(50000, Math.max(1, parseInt(params.get("pageSize") ?? "200", 10))),
  });
  return { data: result };
}, "storage-slots");
