import { randomUUID } from "node:crypto";
import { analyzeContract } from "@/lib/analyze-contract";
import { reconstructAsIfApproved, reconstructContract } from "@/lib/review/reconstruct";
import { buildProposals } from "@/lib/review/build-proposals";
import { readContract, saveOriginalBytes, sha256Text, writeContract } from "@/lib/review/store";
import { countsOf } from "@/lib/review/counts";
import {
  ReviewError,
  type AuditLog,
  type ContractRecord,
  type CorrectionProposal,
  type CorrectionStatus,
} from "@/lib/review/types";

export { ReviewError } from "@/lib/review/types";
export { countsOf } from "@/lib/review/counts";

const REVIEWER = "local-reviewer";

function appendAudit(
  record: ContractRecord,
  proposal: CorrectionProposal | null,
  action: string,
  previous: CorrectionStatus | "NONE",
  next: CorrectionStatus | "GENERATED",
  comments = "",
): void {
  const entry: AuditLog = {
    id: randomUUID(),
    document_id: record.id,
    proposal_id: proposal?.id ?? "",
    clause_number: proposal?.clause_number ?? "",
    previous_status: previous,
    new_status: next,
    original_text: proposal?.original_text ?? record.originalText,
    proposed_text: proposal?.proposed_text ?? "",
    final_text: proposal?.final_text ?? "",
    action,
    timestamp: new Date().toISOString(),
    reviewer_id: REVIEWER,
    comments,
  };
  record.audit.push(entry);
}

export async function createContractReview(input: {
  fileName: string;
  originalText: string;
  originalBytes?: Uint8Array;
}): Promise<ContractRecord> {
  const originalText = input.originalText.replace(/\r\n/g, "\n");
  if (!originalText.trim()) {
    throw new ReviewError("Paste or upload a contract before starting review.", 400);
  }

  const id = randomUUID();
  const analysis = analyzeContract(originalText);
  const proposals = buildProposals(id, originalText, analysis.findings);
  let originalBytesPath: string | null = null;
  if (input.originalBytes && input.originalBytes.byteLength > 0) {
    const ext = input.fileName.includes(".")
      ? input.fileName.slice(input.fileName.lastIndexOf("."))
      : ".txt";
    originalBytesPath = await saveOriginalBytes(id, input.originalBytes, ext);
  }

  const now = new Date().toISOString();
  const record: ContractRecord = {
    id,
    fileName: input.fileName || "contract.txt",
    originalText,
    originalSha256: sha256Text(originalText),
    originalBytesPath,
    versions: {
      original: originalText,
      aiProposed: reconstructAsIfApproved(originalText, proposals),
      humanReviewed: null,
      finalCorrected: null,
    },
    proposals,
    audit: [],
    generatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  appendAudit(record, null, "AI proposed corrections", "NONE", "PENDING", `${proposals.length} proposals created`);
  await writeContract(record);
  return record;
}

export async function getContract(id: string): Promise<ContractRecord> {
  const record = await readContract(id);
  if (!record) throw new ReviewError("Contract not found.", 404);
  return record;
}

function findProposal(record: ContractRecord, proposalId: string): CorrectionProposal {
  const proposal = record.proposals.find((p) => p.id === proposalId);
  if (!proposal) throw new ReviewError("Proposal not found.", 404);
  return proposal;
}

async function persistDecision(
  record: ContractRecord,
  proposal: CorrectionProposal,
  next: CorrectionStatus,
  action: string,
  finalText?: string,
): Promise<ContractRecord> {
  const previous = proposal.status;
  if (next === "MODIFIED") {
    const text = finalText?.trim() ?? "";
    if (!text) throw new ReviewError("Edited correction cannot be empty.", 400);
    proposal.final_text = text;
  } else if (next === "APPROVED") {
    proposal.final_text = proposal.proposed_text;
  }
  proposal.status = next;
  proposal.updated_at = new Date().toISOString();
  record.updatedAt = proposal.updated_at;
  record.versions.humanReviewed = reconstructContract(record.originalText, record.proposals, {
    treatPendingAsRejected: false,
  });
  appendAudit(record, proposal, action, previous, next);
  await writeContract(record);
  return record;
}

export async function approveProposal(contractId: string, proposalId: string): Promise<ContractRecord> {
  const record = await getContract(contractId);
  const proposal = findProposal(record, proposalId);
  if (proposal.status === "APPROVED") return record;
  return persistDecision(record, proposal, "APPROVED", "Approved AI proposal");
}

export async function rejectProposal(contractId: string, proposalId: string): Promise<ContractRecord> {
  const record = await getContract(contractId);
  const proposal = findProposal(record, proposalId);
  if (proposal.status === "REJECTED") return record;
  return persistDecision(record, proposal, "REJECTED", "Rejected AI proposal");
}

export async function modifyProposal(
  contractId: string,
  proposalId: string,
  finalText: string,
): Promise<ContractRecord> {
  const record = await getContract(contractId);
  const proposal = findProposal(record, proposalId);
  return persistDecision(record, proposal, "MODIFIED", "Modified and approved proposal", finalText);
}

export async function approveAllPending(contractId: string): Promise<ContractRecord> {
  const record = await getContract(contractId);
  const pending = record.proposals.filter((p) => p.status === "PENDING");
  const now = new Date().toISOString();
  for (const proposal of pending) {
    const previous = proposal.status;
    proposal.status = "APPROVED";
    proposal.final_text = proposal.proposed_text;
    proposal.updated_at = now;
    appendAudit(record, proposal, "Approved via approve-all", previous, "APPROVED");
  }
  record.updatedAt = now;
  record.versions.humanReviewed = reconstructContract(record.originalText, record.proposals, {
    treatPendingAsRejected: false,
  });
  await writeContract(record);
  return record;
}

export async function generateCorrected(
  contractId: string,
  options: { allowPending?: boolean } = {},
): Promise<ContractRecord> {
  const record = await getContract(contractId);
  const pending = record.proposals.filter((p) => p.status === "PENDING").length;
  if (pending > 0 && !options.allowPending) {
    throw new ReviewError(
      "Unresolved PENDING corrections remain. Finish review or generate with pending items treated as rejected.",
      409,
    );
  }
  const finalText = reconstructContract(record.originalText, record.proposals, {
    treatPendingAsRejected: true,
  });
  if (sha256Text(record.originalText) !== record.originalSha256) {
    throw new ReviewError("Original contract integrity check failed.", 500);
  }
  record.versions.finalCorrected = finalText;
  record.generatedAt = new Date().toISOString();
  record.updatedAt = record.generatedAt;
  appendAudit(record, null, "Final document generated", "NONE", "GENERATED", `pendingAsRejected=${Boolean(options.allowPending)}`);
  await writeContract(record);
  return record;
}

export function originalUnchanged(record: ContractRecord): boolean {
  return (
    record.versions.original === record.originalText &&
    sha256Text(record.originalText) === record.originalSha256
  );
}

export function reviewPayload(record: ContractRecord) {
  const generated = Boolean(record.versions.finalCorrected);
  return {
    id: record.id,
    fileName: record.fileName,
    originalText: record.originalText,
    versions: {
      hasOriginal: true,
      hasAiProposed: Boolean(record.versions.aiProposed),
      hasHumanReviewed: Boolean(record.versions.humanReviewed),
      hasFinal: generated,
    },
    generatedAt: record.generatedAt,
    counts: countsOf(record.proposals),
    proposals: record.proposals,
    audit: record.audit,
    originalPreserved: originalUnchanged(record),
    notice:
      "AI-generated corrections are proposals for human review. Review and approve changes before generating the final document.",
    downloads: generated
      ? {
          docx: `/api/contracts/${record.id}/download/docx`,
          pdf: `/api/contracts/${record.id}/download/pdf`,
          original: `/api/contracts/${record.id}/download/original`,
        }
      : undefined,
  };
}
