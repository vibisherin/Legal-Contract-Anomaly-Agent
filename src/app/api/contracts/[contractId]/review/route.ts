import { NextResponse } from "next/server";
import { ReviewError, getContract, reviewPayload } from "@/lib/review/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ contractId: string }> },
) {
  try {
    const { contractId } = await context.params;
    const record = await getContract(contractId);
    return NextResponse.json(reviewPayload(record));
  } catch (err) {
    if (err instanceof ReviewError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Could not load review." }, { status: 500 });
  }
}
