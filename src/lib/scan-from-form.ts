import { analyzeContract } from "@/lib/analyze-contract";
import { ContractFileError, readContractFile } from "@/lib/read-contract-file";
import { type ScanState } from "@/lib/scan-state";

export async function scanFromFormData(
  previous: ScanState,
  formData: FormData,
): Promise<ScanState> {
  const revision = previous.revision + 1;
  const draft = String(formData.get("draft") ?? "");
  const uploaded = formData.get("file");

  try {
    let text = draft;
    let fileName: string | null = null;

    if (uploaded instanceof File && uploaded.size > 0) {
      text = await readContractFile(uploaded);
      fileName = uploaded.name;
    }

    if (!text.trim()) {
      return {
        error: "Paste contract text or choose a .txt, .pdf, or .docx file, then scan.",
        result: null,
        text,
        fileName,
        revision,
      };
    }

    return {
      error: null,
      result: analyzeContract(text),
      text,
      fileName,
      revision,
    };
  } catch (err) {
    const message =
      err instanceof ContractFileError
        ? err.message
        : err instanceof Error
          ? err.message
          : "The scanner could not read that draft.";
    return {
      error: message,
      result: null,
      text: draft,
      fileName: null,
      revision,
    };
  }
}
