import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { buildCorrectedDocxBlob, buildCorrectedPdfBlob } from "@/lib/download-corrected";
import { ReviewError, getContract } from "@/lib/review/service";

export const runtime = "nodejs";

function stem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-") || "contract";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ contractId: string; kind: string }> },
) {
  try {
    const { contractId, kind } = await context.params;
    const record = await getContract(contractId);

    if (kind === "original") {
      if (record.originalBytesPath) {
        const bytes = await readFile(record.originalBytesPath);
        return new NextResponse(bytes, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${record.fileName}"`,
          },
        });
      }
      return new NextResponse(record.originalText, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${stem(record.fileName)}.txt"`,
        },
      });
    }

    const finalText = record.versions.finalCorrected;
    if (!finalText) {
      return NextResponse.json({ error: "Generate the corrected contract first." }, { status: 409 });
    }

    const base = `${stem(record.fileName)}_Corrected`;
    if (kind === "pdf") {
      const blob = await buildCorrectedPdfBlob(finalText);
      return new NextResponse(Buffer.from(await blob.arrayBuffer()), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${base}.pdf"`,
        },
      });
    }
    if (kind === "docx") {
      const blob = await buildCorrectedDocxBlob(finalText);
      return new NextResponse(Buffer.from(await blob.arrayBuffer()), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${base}.docx"`,
        },
      });
    }

    return NextResponse.json({ error: "Unknown download kind." }, { status: 400 });
  } catch (err) {
    if (err instanceof ReviewError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Download failed." }, { status: 500 });
  }
}
