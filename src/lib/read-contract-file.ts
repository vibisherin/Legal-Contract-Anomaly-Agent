const MAX_BYTES = 8 * 1024 * 1024;

export class ContractFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractFileError";
  }
}

function extension(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

function looksBinary(text: string): boolean {
  const sample = text.slice(0, 400);
  let zeros = 0;
  for (let i = 0; i < sample.length; i += 1) {
    if (sample.charCodeAt(i) === 0) zeros += 1;
  }
  return zeros > 4;
}

async function pdfWorkerSrc(): Promise<string> {
  if (typeof window === "undefined") {
    const { pathToFileURL } = await import("node:url");
    const path = await import("node:path");
    return pathToFileURL(path.join(process.cwd(), "public/pdf.worker.min.mjs")).href;
  }
  return "/pdf.worker.min.mjs";
}

async function extractPdf(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = await pdfWorkerSrc();

  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
  });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) pages.push(line);
  }
  const text = pages.join("\n\n").trim();
  if (!text) {
    throw new ContractFileError(
      "That PDF has no extractable text. It may be a scan — export a text PDF or paste the wording.",
    );
  }
  return text;
}

async function extractDocx(data: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  const text = result.value.replace(/\s+\n/g, "\n").trim();
  if (!text) {
    throw new ContractFileError("That Word file has no extractable text.");
  }
  return text;
}

export async function readContractFile(file: File): Promise<string> {
  if (file.size === 0) {
    throw new ContractFileError(`“${file.name}” is empty.`);
  }
  if (file.size > MAX_BYTES) {
    throw new ContractFileError(
      "That file is larger than 8 MB. Split the draft or paste the relevant sections.",
    );
  }

  const kind = extension(file.name);
  const mime = file.type;

  if (kind === ".pdf" || mime === "application/pdf") {
    return extractPdf(await file.arrayBuffer());
  }
  if (
    kind === ".docx" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractDocx(await file.arrayBuffer());
  }
  if (kind === ".doc") {
    throw new ContractFileError(
      "Legacy .doc files are not supported. Save as .docx, .pdf, or .txt.",
    );
  }
  if (kind === ".txt" || kind === ".md" || kind === ".rtf" || mime.startsWith("text/") || mime === "") {
    if (kind && ![".txt", ".md", ".rtf"].includes(kind) && !mime.startsWith("text/")) {
      throw new ContractFileError("Use a .txt, .md, .pdf, or .docx file.");
    }
    const text = (await file.text()).replace(/^\uFEFF/, "").trim();
    if (!text) {
      throw new ContractFileError("No readable text in that file.");
    }
    if (looksBinary(text)) {
      throw new ContractFileError("That file looks binary. Use .txt, .pdf, or .docx.");
    }
    return text;
  }

  throw new ContractFileError("Use a .txt, .md, .pdf, or .docx file.");
}
