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
    pageSize: Math.min(500, Math.max(1, parseInt(params.get("pageSize") ?? "200", 10))),
  });
  return { data: result };
}, "storage-slots");
