import type { AnalysisResult } from "@/lib/analyze-contract";

export type ScanState = {
  error: string | null;
  result: AnalysisResult | null;
  text: string;
  fileName: string | null;
  revision: number;
};

export const emptyScanState: ScanState = {
  error: null,
  result: null,
  text: "",
  fileName: null,
  revision: 0,
};
