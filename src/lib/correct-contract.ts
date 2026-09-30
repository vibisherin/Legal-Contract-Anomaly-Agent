import type { AnalysisResult } from "@/lib/analyze-contract";

export const REPLACEMENTS: { pattern: RegExp; with: string }[] = [
  { pattern: /\[Party\]/gi, with: "the Customer" },
  { pattern: /\[insert\]/gi, with: "[to be completed by the parties]" },
  { pattern: /\bTBD\b/gi, with: "the amount set in Exhibit A" },
  { pattern: /\bto be determined\b/gi, with: "the amount set in Exhibit A" },
  { pattern: /xx\/xx\/xxxx/gi, with: "the Effective Date" },
  {
    pattern: /liability shall be unlimited/gi,
    with:
      "aggregate liability shall not exceed the fees paid in the twelve (12) months preceding the claim, except for fraud, gross negligence, or willful misconduct",
  },
  {
    pattern: /unlimited (liability|damages)/gi,
    with: "liability capped at fees paid in the prior twelve months",
  },
  {
    pattern: /may terminate this Agreement at any time without cause(?: and without notice)?/gi,
    with:
      "may terminate this Agreement for convenience on thirty (30) days' prior written notice",
  },
  {
    pattern: /Customer may not terminate\.?/gi,
    with: "Either party may terminate for material breach if the breach remains uncured thirty (30) days after written notice.",
  },
  {
    pattern: /It will automatically renew for successive five-year terms unless Customer objects\.?/gi,
    with:
      "This Agreement does not automatically renew. Any renewal requires a writing signed by both parties.",
  },
  {
    pattern: /automatically renew(?:s|ed|al)?/gi,
    with: "renew only by signed writing",
  },
  {
    pattern: /irrevocabl(?:y|e) assigns all intellectual property(?:, including pre-existing materials,)? to Vendor/gi,
    with:
      "assigns to Vendor only the deliverables created under a signed SOW, while retaining all pre-existing and background intellectual property",
  },
  {
    pattern: /shall not be liable for any damages arising from gross negligence, willful misconduct, or fraud/gi,
    with:
      "shall remain liable for damages arising from gross negligence, willful misconduct, or fraud",
  },
  {
    pattern: /Customer shall not directly or indirectly compete or solicit Vendor personnel worldwide in perpetuity\.?/gi,
    with:
      "During the term and for six (6) months thereafter, Customer shall not solicit Vendor personnel who worked on this engagement, limited to the accounts actually served.",
  },
  {
    pattern: /Party of the first part and party of the second part intend this to be binding\.?/gi,
    with: "Vendor and Customer intend this Agreement to be binding.",
  },
  {
    pattern: /Late amounts accrue interest at Vendor's discretion\.?/gi,
    with: "Overdue amounts accrue interest at 1% per month, or the maximum rate allowed by law, whichever is less.",
  },
  {
    pattern: /Customer shall pay invoices immediately\.?/gi,
    with: "Customer shall pay invoices net thirty (30) days from receipt.",
  },
  {
    pattern: /continues through December 1, 2099/gi,
    with: "continues for an initial term of twelve (12) months from the Effective Date",
  },
];

export const CLAUSE_TEXT: Record<string, string> = {
  "Governing law":
    "Governing Law. This Agreement is governed by the laws of the State of New York, without regard to conflict-of-law rules.",
  "Dispute resolution":
    "Dispute Resolution. The state and federal courts in New York County have exclusive jurisdiction over disputes arising out of this Agreement.",
  "Termination":
    "Termination. Either party may terminate for material breach if the breach remains uncured thirty (30) days after written notice, or for convenience on thirty (30) days' written notice after the initial term.",
  "Confidentiality":
    "Confidentiality. Each party shall protect the other's Confidential Information with at least reasonable care and shall not disclose it except to personnel with a need to know.",
  "Limitation of liability":
    "Limitation of Liability. Except for confidentiality, IP infringement, fraud, and willful misconduct, each party's aggregate liability shall not exceed the fees paid in the twelve (12) months preceding the claim. Neither party is liable for consequential, incidental, or indirect damages.",
  "Indemnification":
    "Indemnification. Each party shall indemnify, defend, and hold harmless the other from third-party claims arising from the indemnifying party's gross negligence or willful misconduct.",
  "Payment terms":
    "Payment. Fees are as set in Exhibit A, invoiced in USD, payable net 30. Overdue amounts accrue interest at 1% per month.",
  "Force majeure":
    "Force Majeure. Neither party is liable for delay caused by events beyond its reasonable control, provided it gives prompt notice and uses commercially reasonable efforts to resume performance.",
  "Assignment":
    "Assignment. Neither party may assign this Agreement without the other's prior written consent, except to an affiliate or successor in a merger or sale of substantially all assets.",
  "Entire agreement":
    "Entire Agreement. This Agreement, including its exhibits, constitutes the entire agreement and supersedes all prior proposals and discussions.",
};

export function correctContract(source: string, analysis: AnalysisResult): string {
  let next = source.replace(/\r\n/g, "\n");

  for (const rule of REPLACEMENTS) {
    next = next.replace(rule.pattern, rule.with);
  }

  const additions: string[] = [];
  for (const missing of analysis.missingClauses) {
    const clause = CLAUSE_TEXT[missing.name];
    if (clause && !new RegExp(missing.name, "i").test(next)) {
      additions.push(clause);
    }
  }

  if (!/IN WITNESS WHEREOF/i.test(next)) {
    additions.push(
      "IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.\n\nVendor: ___________________________    Customer: ___________________________",
    );
  }

  if (additions.length) {
    next = `${next.trim()}\n\n--- Corrected provisions ---\n\n${additions.map((c, i) => `${i + 1}. ${c}`).join("\n\n")}\n`;
  }

  return next.trim() + "\n";
}

export function applyReplacementsToSnippet(snippet: string): string {
  let next = snippet;
  for (const rule of REPLACEMENTS) {
    next = next.replace(rule.pattern, rule.with);
  }
  return next;
}

export function clauseTextForGap(title: string): string | null {
  const key = Object.keys(CLAUSE_TEXT).find(
    (name) => title.toLowerCase().includes(name.toLowerCase()),
  );
  return key ? CLAUSE_TEXT[key] : null;
}
