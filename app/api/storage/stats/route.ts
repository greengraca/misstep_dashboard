import { withAuthRead } from "@/lib/api-helpers";
import { getStorageStats } from "@/lib/storage-db";

export const GET = withAuthRead(async () => {
  const data = await getStorageStats();
  return { data };
}, "storage-stats");
