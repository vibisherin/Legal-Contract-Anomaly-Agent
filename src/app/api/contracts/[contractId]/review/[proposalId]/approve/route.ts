import { NextResponse } from "next/server";
import { ReviewError, approveProposal, reviewPayload } from "@/lib/review/service";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ contractId: string; proposalId: string }> },
) {
  try {
    const { contractId, proposalId } = await context.params;
    const record = await approveProposal(contractId, proposalId);
    return NextResponse.json(reviewPayload(record));
  } catch (err) {
    if (err instanceof ReviewError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Approve failed." }, { status: 500 });
  }
}
