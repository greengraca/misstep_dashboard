import { withAuthRead } from "@/lib/api-helpers";
import { getAnalytics } from "@/lib/analytics";

export const GET = withAuthRead(async () => {
  const result = await getAnalytics();
  return result;
}, "analytics-get");
