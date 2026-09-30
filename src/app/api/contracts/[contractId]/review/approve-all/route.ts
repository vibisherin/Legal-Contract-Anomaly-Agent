import { NextResponse } from "next/server";
import { ReviewError, approveAllPending, reviewPayload } from "@/lib/review/service";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ contractId: string }> },
) {
  try {
    const { contractId } = await context.params;
    const record = await approveAllPending(contractId);
    return NextResponse.json(reviewPayload(record));
  } catch (err) {
    if (err instanceof ReviewError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Approve all failed." }, { status: 500 });
  }
}
