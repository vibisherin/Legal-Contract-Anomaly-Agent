import type { Finding } from "@/lib/analyze-contract";
import { applyReplacementsToSnippet, clauseTextForGap } from "@/lib/correct-contract";
import { newId } from "@/lib/review/ids";
import type { CorrectionProposal } from "@/lib/review/types";

function locateClause(
  source: string,
  snippet: string,
  fallbackTitle: string,
): { number: string; title: string } {
  const index = snippet ? source.indexOf(snippet) : -1;
  const before = index >= 0 ? source.slice(0, index) : source;
  const matches = [...before.matchAll(/(?:^|\n)\s*(\d+)\.\s+([^\n]+)/g)];
  const last = matches.at(-1);
  if (last) {
    return { number: last[1], title: last[2].trim().slice(0, 90) };
  }
  return { number: "—", title: fallbackTitle };
}

function originalSnippet(source: string, finding: Finding): string {
  if (finding.excerpt && source.includes(finding.excerpt)) return finding.excerpt;
  if (finding.excerpt) {
    const compact = finding.excerpt.replace(/\s+/g, " ").trim();
    const haystack = source.replace(/\s+/g, " ");
    if (haystack.includes(compact)) return finding.excerpt;
  }
  return finding.excerpt || "";
}

export function buildProposals(documentId: string, source: string, findings: Finding[]): CorrectionProposal[] {
  const now = new Date().toISOString();
  return findings.map((finding) => {
    const original_text = originalSnippet(source, finding);
    const located = locateClause(source, original_text, finding.title);
    const gapClause = finding.category === "Coverage gap" ? clauseTextForGap(finding.title) : null;
    let proposed_text = gapClause ?? applyReplacementsToSnippet(original_text || finding.title);
    if (proposed_text === original_text && original_text) {
      proposed_text = `${original_text}\n\n[Proposed revision] ${finding.recommendation}`;
    }
    if (!proposed_text.trim()) {
      proposed_text = finding.recommendation;
    }

    return {
      id: newId(),
      document_id: documentId,
      clause_number: located.number,
      clause_title: located.title,
      issue_type: finding.category,
      severity: finding.severity.toUpperCase(),
      issue_description: finding.explanation,
      original_text,
      proposed_text,
      final_text: proposed_text,
      status: "PENDING",
      created_at: now,
      updated_at: now,
    };
  });
}
