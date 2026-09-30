import { NextResponse } from "next/server";
import { ReviewError, modifyProposal, reviewPayload } from "@/lib/review/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ contractId: string; proposalId: string }> },
) {
  try {
    const { contractId, proposalId } = await context.params;
    const body = (await request.json()) as { final_text?: string; finalText?: string };
    const finalText = body.final_text ?? body.finalText ?? "";
    const record = await modifyProposal(contractId, proposalId, finalText);
    return NextResponse.json(reviewPayload(record));
  } catch (err) {
    if (err instanceof ReviewError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Modify failed." }, { status: 500 });
  }
}
