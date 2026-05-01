import { withExtAuthRead } from "@/lib/api-ext-helpers";
import { getCmSalesEconomics, type SalesEconomicsRange } from "@/lib/cardmarket";

// GET /api/ext/sales-economics
//   ?range=lifetime         (default)
//   ?range=month&month=YYYY-MM
//   ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD
export const GET = withExtAuthRead(async (req) => {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("range") || "lifetime";
  let range: SalesEconomicsRange = { kind: "lifetime" };
  if (kind === "month") {
    const month = sp.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return Response.json({ error: "month=YYYY-MM required when range=month" }, { status: 400 });
    }
    range = { kind: "month", month };
  } else if (kind === "custom") {
    const from = sp.get("from");
    const to = sp.get("to");
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return Response.json({ error: "from/to (YYYY-MM-DD) required when range=custom" }, { status: 400 });
    }
    range = { kind: "range", from, to };
  }
  const data = await getCmSalesEconomics(range);
  return { data };
}, "ext-sales-economics");
