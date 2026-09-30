import type { CorrectionProposal } from "@/lib/review/types";

function replacementFor(proposal: CorrectionProposal): string | null {
  if (proposal.status === "APPROVED") return proposal.proposed_text;
  if (proposal.status === "MODIFIED") return proposal.final_text;
  return null;
}

export function reconstructContract(
  originalText: string,
  proposals: CorrectionProposal[],
  options: { treatPendingAsRejected?: boolean } = {},
): string {
  let next = originalText;
  const additions: string[] = [];
  const ordered = [...proposals].sort(
    (a, b) => (b.original_text?.length ?? 0) - (a.original_text?.length ?? 0),
  );

  for (const proposal of ordered) {
    if (proposal.status === "PENDING" && options.treatPendingAsRejected) {
      continue;
    }
    const replacement = replacementFor(proposal);
    if (replacement === null) continue;

    if (proposal.original_text && next.includes(proposal.original_text)) {
      next = next.replace(proposal.original_text, replacement);
    } else {
      additions.push(replacement);
    }
  }

  if (additions.length) {
    next = `${next.trim()}\n\n--- Human-approved additions ---\n\n${additions.join("\n\n")}\n`;
  }

  return next.trim() + "\n";
}

export function reconstructAsIfApproved(originalText: string, proposals: CorrectionProposal[]): string {
  const assumed = proposals.map((p) => ({
    ...p,
    status: "APPROVED" as const,
    final_text: p.proposed_text,
  }));
  return reconstructContract(originalText, assumed);
}
