import type { Finding } from "@/lib/analyze-contract";
import { buildProposals } from "@/lib/review/build-proposals";
import { countsOf } from "@/lib/review/counts";
import { newId } from "@/lib/review/ids";
import { reconstructContract } from "@/lib/review/reconstruct";
import type {
  AuditLog,
  CorrectionProposal,
  CorrectionStatus,
  ReviewCounts,
} from "@/lib/review/types";

export const REVIEW_NOTICE =
  "AI-generated corrections are proposals for human review. Review and approve changes before generating the final document.";

export type LocalReview = {
  id: string;
  fileName: string;
  originalText: string;
  proposals: CorrectionProposal[];
  audit: AuditLog[];
  generatedAt: string | null;
  finalText: string | null;
};

export type ReviewView = {
  id: string;
  fileName: string;
  originalText: string;
  generatedAt: string | null;
  counts: ReviewCounts;
  proposals: CorrectionProposal[];
  audit: AuditLog[];
  originalPreserved: boolean;
  notice: string;
  finalText?: string;
};

function cloneReview(session: LocalReview): LocalReview {
  return {
    ...session,
    proposals: session.proposals.map((p) => ({ ...p })),
    audit: session.audit.map((a) => ({ ...a })),
  };
}

function appendAudit(
  session: LocalReview,
  proposal: CorrectionProposal | null,
  action: string,
  previous: CorrectionStatus | "NONE",
  next: CorrectionStatus | "GENERATED",
  comments = "",
): void {
  session.audit.push({
    id: newId(),
    document_id: session.id,
    proposal_id: proposal?.id ?? "",
    clause_number: proposal?.clause_number ?? "",
    previous_status: previous,
    new_status: next,
    original_text: proposal?.original_text ?? session.originalText,
    proposed_text: proposal?.proposed_text ?? "",
    final_text: proposal?.final_text ?? "",
    action,
    timestamp: new Date().toISOString(),
    reviewer_id: "local-reviewer",
    comments,
  });
}

function findProposal(session: LocalReview, proposalId: string): CorrectionProposal {
  const proposal = session.proposals.find((p) => p.id === proposalId);
  if (!proposal) throw new Error("Proposal not found.");
  return proposal;
}

export function toReviewView(session: LocalReview): ReviewView {
  return {
    id: session.id,
    fileName: session.fileName,
    originalText: session.originalText,
    generatedAt: session.generatedAt,
    counts: countsOf(session.proposals),
    proposals: session.proposals,
    audit: session.audit,
    originalPreserved: true,
    notice: REVIEW_NOTICE,
    finalText: session.finalText ?? undefined,
  };
}

export function createLocalReview(
  fileName: string,
  originalText: string,
  findings: Finding[],
): LocalReview {
  const text = originalText.replace(/\r\n/g, "\n");
  if (!text.trim()) {
    throw new Error("Paste or upload a contract before starting review.");
  }
  const id = newId();
  const proposals = buildProposals(id, text, findings);
  const session: LocalReview = {
    id,
    fileName: fileName || "contract.txt",
    originalText: text,
    proposals,
    audit: [],
    generatedAt: null,
    finalText: null,
  };
  appendAudit(session, null, "AI proposed corrections", "NONE", "PENDING", `${proposals.length} proposals created`);
  return session;
}

export function approveLocal(session: LocalReview, proposalId: string): LocalReview {
  const next = cloneReview(session);
  const proposal = findProposal(next, proposalId);
  if (proposal.status === "APPROVED") return next;
  const previous = proposal.status;
  proposal.status = "APPROVED";
  proposal.final_text = proposal.proposed_text;
  proposal.updated_at = new Date().toISOString();
  appendAudit(next, proposal, "Approved AI proposal", previous, "APPROVED");
  return next;
}

export function rejectLocal(session: LocalReview, proposalId: string): LocalReview {
  const next = cloneReview(session);
  const proposal = findProposal(next, proposalId);
  if (proposal.status === "REJECTED") return next;
  const previous = proposal.status;
  proposal.status = "REJECTED";
  proposal.updated_at = new Date().toISOString();
  appendAudit(next, proposal, "Rejected AI proposal", previous, "REJECTED");
  return next;
}

export function modifyLocal(session: LocalReview, proposalId: string, finalText: string): LocalReview {
  const text = finalText.trim();
  if (!text) throw new Error("Edited correction cannot be empty.");
  const next = cloneReview(session);
  const proposal = findProposal(next, proposalId);
  const previous = proposal.status;
  proposal.status = "MODIFIED";
  proposal.final_text = text;
  proposal.updated_at = new Date().toISOString();
  appendAudit(next, proposal, "Modified and approved proposal", previous, "MODIFIED");
  return next;
}

export function approveAllLocal(session: LocalReview): LocalReview {
  const next = cloneReview(session);
  const now = new Date().toISOString();
  for (const proposal of next.proposals) {
    if (proposal.status !== "PENDING") continue;
    const previous = proposal.status;
    proposal.status = "APPROVED";
    proposal.final_text = proposal.proposed_text;
    proposal.updated_at = now;
    appendAudit(next, proposal, "Approved via approve-all", previous, "APPROVED");
  }
  return next;
}

export function generateLocal(session: LocalReview, allowPending = false): LocalReview {
  const pending = session.proposals.filter((p) => p.status === "PENDING").length;
  if (pending > 0 && !allowPending) {
    throw new Error(
      "Unresolved PENDING corrections remain. Finish review or generate with pending items treated as rejected.",
    );
  }
  const next = cloneReview(session);
  const finalText = reconstructContract(next.originalText, next.proposals, {
    treatPendingAsRejected: true,
  });
  next.finalText = finalText;
  next.generatedAt = new Date().toISOString();
  appendAudit(
    next,
    null,
    "Final document generated",
    "NONE",
    "GENERATED",
    `pendingAsRejected=${Boolean(allowPending)}`,
  );
  return next;
}
