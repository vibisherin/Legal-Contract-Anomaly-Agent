"use server";

import { scanFromFormData } from "@/lib/scan-from-form";
import { emptyScanState, type ScanState } from "@/lib/scan-state";

export async function scanContract(
  previous: ScanState = emptyScanState,
  formData: FormData,
): Promise<ScanState> {
  return scanFromFormData(previous, formData);
}
