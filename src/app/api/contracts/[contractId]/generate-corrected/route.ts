import { NextResponse } from "next/server";
import { ReviewError, generateCorrected, reviewPayload } from "@/lib/review/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ contractId: string }> },
) {
  try {
    const { contractId } = await context.params;
    const raw = await request.text();
    let allowPending = false;
    if (raw.trim()) {
      try {
        const body = JSON.parse(raw) as { allowPending?: boolean };
        allowPending = Boolean(body.allowPending);
      } catch {
        allowPending = false;
      }
    }
    const record = await generateCorrected(contractId, { allowPending });
    return NextResponse.json({
      ...reviewPayload(record),
      finalText: record.versions.finalCorrected,
      downloads: {
        docx: `/api/contracts/${contractId}/download/docx`,
        pdf: `/api/contracts/${contractId}/download/pdf`,
        original: `/api/contracts/${contractId}/download/original`,
      },
    });
  } catch (err) {
    if (err instanceof ReviewError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Generation failed." }, { status: 500 });
  }
}
