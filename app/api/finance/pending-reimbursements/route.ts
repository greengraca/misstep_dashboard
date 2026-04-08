import { withAuthRead } from "@/lib/api-helpers";
import { getPendingReimbursements } from "@/lib/finance";

export const GET = withAuthRead(async () => {
  const data = await getPendingReimbursements();
  return { data };
}, "finance-pending-reimbursements");
