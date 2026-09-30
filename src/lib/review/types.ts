export type CorrectionStatus = "PENDING" | "APPROVED" | "REJECTED" | "MODIFIED";

export type CorrectionProposal = {
  id: string;
  document_id: string;
  clause_number: string;
  clause_title: string;
  issue_type: string;
  severity: string;
  issue_description: string;
  original_text: string;
  proposed_text: string;
  final_text: string;
  status: CorrectionStatus;
  created_at: string;
  updated_at: string;
};

export type AuditLog = {
  id: string;
  document_id: string;
  proposal_id: string;
  clause_number: string;
  previous_status: CorrectionStatus | "NONE";
  new_status: CorrectionStatus | "GENERATED";
  original_text: string;
  proposed_text: string;
  final_text: string;
  action: string;
  timestamp: string;
  reviewer_id: string;
  comments: string;
};

export type DocumentVersions = {
  original: string;
  aiProposed: string;
  humanReviewed: string | null;
  finalCorrected: string | null;
};

export type ContractRecord = {
  id: string;
  fileName: string;
  originalText: string;
  originalSha256: string;
  originalBytesPath: string | null;
  versions: DocumentVersions;
  proposals: CorrectionProposal[];
  audit: AuditLog[];
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReviewCounts = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  modified: number;
  reviewed: number;
  progress: number;
};

export class ReviewError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}
