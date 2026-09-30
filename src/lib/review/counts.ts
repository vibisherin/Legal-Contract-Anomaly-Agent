import type { CorrectionProposal, ReviewCounts } from "@/lib/review/types";

export function countsOf(proposals: CorrectionProposal[]): ReviewCounts {
  const total = proposals.length;
  const pending = proposals.filter((p) => p.status === "PENDING").length;
  const approved = proposals.filter((p) => p.status === "APPROVED").length;
  const rejected = proposals.filter((p) => p.status === "REJECTED").length;
  const modified = proposals.filter((p) => p.status === "MODIFIED").length;
  const reviewed = approved + rejected + modified;
  const progress = total === 0 ? 100 : Math.round((reviewed / total) * 100);
  return { total, pending, approved, rejected, modified, reviewed, progress };
}
