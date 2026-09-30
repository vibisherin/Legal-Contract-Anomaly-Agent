import { NextResponse } from "next/server";
import { ReviewError, reviewPayload, createContractReview } from "@/lib/review/service";
import { readContractFile } from "@/lib/read-contract-file";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let fileName = "pasted-contract.pdf";
    let originalText = "";
    let originalBytes: Uint8Array | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const draft = String(form.get("draft") ?? form.get("originalText") ?? "");
      if (file instanceof File && file.size > 0) {
        fileName = file.name;
        originalBytes = new Uint8Array(await file.arrayBuffer());
        originalText = await readContractFile(file);
      } else {
        originalText = draft;
        fileName = String(form.get("fileName") ?? fileName);
      }
    } else {
      const body = (await request.json()) as { originalText?: string; fileName?: string };
      originalText = body.originalText ?? "";
      fileName = body.fileName ?? fileName;
    }

    const record = await createContractReview({ fileName, originalText, originalBytes });
    return NextResponse.json(reviewPayload(record), { status: 201 });
  } catch (err) {
    if (err instanceof ReviewError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Could not start contract review.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
