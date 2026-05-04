import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-helpers";
import { getDb } from "@/lib/mongodb";
import { deleteManualSale } from "@/lib/investments/manual-sales";

export const DELETE = withAuthParams<{ id: string; saleLogId: string }>(
  async (_req, _s, { id, saleLogId }) => {
    const db = await getDb();
    const result = await deleteManualSale({ db, investmentId: id, saleLogId });
    switch (result.status) {
      case "ok":
        return NextResponse.json({ ok: true });
      case "not-found":
        return NextResponse.json({ error: "sale log row not found" }, { status: 404 });
      case "not-manual":
        return NextResponse.json(
          { error: "only manual sales can be deleted" },
          { status: 403 }
        );
      case "frozen":
        return NextResponse.json(
          { error: "investment is closed or archived" },
          { status: 403 }
        );
    }
  },
  "investments-sale-log-delete"
);
