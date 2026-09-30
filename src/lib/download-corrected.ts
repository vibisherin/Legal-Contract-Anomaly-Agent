import { Document, Packer, Paragraph, TextRun } from "docx";
import { jsPDF } from "jspdf";

export type SourceFormat = "pdf" | "docx" | "txt";

export function formatFromFileName(name: string | null | undefined): SourceFormat {
  const lower = (name ?? "").toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".rtf")) return "txt";
  return "pdf";
}

export function downloadLabel(format: SourceFormat): string {
  if (format === "docx") return "Download corrected DOCX";
  if (format === "txt") return "Download corrected TXT";
  return "Download corrected PDF";
}

function baseName(fileName: string | null | undefined): string {
  const raw = (fileName ?? "contract").replace(/\.[^.]+$/, "");
  return raw.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "contract";
}

export function correctedFileStem(fileName: string | null | undefined): string {
  return `${baseName(fileName)}_Corrected`;
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function pdfBlob(text: string): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFillColor(42, 6, 24);
  doc.rect(0, 0, 210, 22, "F");
  doc.setTextColor(245, 215, 110);
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.text("Corrected Agreement", 14, 14);

  doc.setTextColor(30, 20, 20);
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(text, 182) as string[];
  let y = 32;
  for (const line of lines) {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, 14, y);
    y += 5.2;
  }
  return doc.output("blob");
}

async function docxBlob(text: string): Promise<Blob> {
  const paragraphs = text.split(/\n/).map(
    (line) =>
      new Paragraph({
        children: [
          new TextRun({
            text: line.length ? line : " ",
            font: "Times New Roman",
            size: 22,
          }),
        ],
        spacing: { after: 120 },
      }),
  );

  const document = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "Corrected Agreement",
                bold: true,
                size: 32,
                font: "Times New Roman",
                color: "4A0A2C",
              }),
            ],
            spacing: { after: 280 },
          }),
          ...paragraphs,
        ],
      },
    ],
  });

  const buffer = await Packer.toBlob(document);
  return buffer;
}

export async function buildCorrectedPdfBlob(text: string): Promise<Blob> {
  return pdfBlob(text);
}

export async function buildCorrectedDocxBlob(text: string): Promise<Blob> {
  return docxBlob(text);
}

export async function downloadCorrectedDocument(
  text: string,
  fileName: string | null | undefined,
): Promise<void> {
  const format = formatFromFileName(fileName);
  const stem = `${baseName(fileName)}-corrected`;

  if (format === "txt") {
    triggerDownload(new Blob([text], { type: "text/plain;charset=utf-8" }), `${stem}.txt`);
    return;
  }
  if (format === "docx") {
    triggerDownload(
      await docxBlob(text),
      `${stem}.docx`,
    );
    return;
  }
  triggerDownload(pdfBlob(text), `${stem}.pdf`);
}
