export type Severity = "critical" | "high" | "medium" | "low";

export type Finding = {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  excerpt: string;
  explanation: string;
  recommendation: string;
};

export type AnalysisResult = {
  wordCount: number;
  sentenceCount: number;
  riskScore: number;
  riskLabel: "Low" | "Elevated" | "High" | "Severe";
  findings: Finding[];
  parties: string[];
  dates: string[];
  amounts: string[];
  presentClauses: string[];
  missingClauses: { name: string; why: string }[];
};

const STANDARD_CLAUSES: { name: string; patterns: RegExp[]; why: string }[] = [
  {
    name: "Governing law",
    patterns: [/governing law/i, /shall be governed by/i, /laws of the (state|commonwealth|province)/i],
    why: "Without a governing-law clause, disputes can be fought in unexpected forums.",
  },
  {
    name: "Dispute resolution",
    patterns: [/arbitration/i, /dispute resolution/i, /exclusive jurisdiction/i, /venue shall/i],
    why: "A missing forum or arbitration path leaves enforcement unpredictable.",
  },
  {
    name: "Termination",
    patterns: [/terminat/i, /may cancel/i, /notice of termination/i],
    why: "Parties need a clear exit, notice period, and post-termination duties.",
  },
  {
    name: "Confidentiality",
    patterns: [/confidential/i, /non-disclosure/i, /proprietary information/i],
    why: "Deal terms and customer data usually need an NDA-style obligation.",
  },
  {
    name: "Limitation of liability",
    patterns: [/limitation of liability/i, /liability shall not exceed/i, /consequential damages/i, /indirect damages/i],
    why: "Uncapped damages are a classic commercial anomaly.",
  },
  {
    name: "Indemnification",
    patterns: [/indemnif/i, /hold harmless/i, /defend.*claim/i],
    why: "Who pays for third-party claims should be explicit.",
  },
  {
    name: "Payment terms",
    patterns: [/invoice/i, /payment shall/i, /net\s*\d+/i, /fees? (are|shall|will)/i],
    why: "Amount, cadence, and late-fee rules should be written down.",
  },
  {
    name: "Force majeure",
    patterns: [/force majeure/i, /acts of god/i, /beyond (its|their|a party's) reasonable control/i],
    why: "Excused delay language is standard in commercial contracts.",
  },
  {
    name: "Assignment",
    patterns: [/assign(ment|s|able)?/i, /may not assign/i, /successors and assigns/i],
    why: "Change-of-control and subcontracting should not be silent.",
  },
  {
    name: "Entire agreement",
    patterns: [/entire agreement/i, /supersedes all prior/i, /whole agreement/i],
    why: "Integration clauses stop side emails from rewriting the deal.",
  },
];

const AMBIGUOUS = [
  { pattern: /\breasonable efforts\b/gi, label: "reasonable efforts" },
  { pattern: /\bbest efforts\b/gi, label: "best efforts" },
  { pattern: /\bas soon as (possible|practicable)\b/gi, label: "as soon as possible / practicable" },
  { pattern: /\bfrom time to time\b/gi, label: "from time to time" },
  { pattern: /\bin its sole discretion\b/gi, label: "in its sole discretion" },
  { pattern: /\bmaterial(ly)?\b/gi, label: "material / materially" },
  { pattern: /\bsubstantial(ly)?\b/gi, label: "substantial / substantially" },
];

const ONE_SIDED = [
  {
    pattern: /unlimited (liability|damages)|without limitation of liability|liability shall be unlimited/i,
    title: "Unlimited liability",
    explanation: "The draft appears to leave damages uncapped, which is rarely market for commercial services.",
    recommendation: "Cap direct damages (for example at 12 months of fees) and exclude consequential damages with carve-outs for IP, confidentiality, and willful misconduct.",
  },
  {
    pattern: /may terminat[e\w]* (this (agreement|contract) )?(at any time|without (cause|notice|reason))/i,
    title: "Unilateral termination without cause",
    explanation: "One party can walk away on little or no notice while the other remains bound.",
    recommendation: "Mirror termination rights or require a commercially reasonable notice period and wind-down.",
  },
  {
    pattern: /automatically renew|auto[- ]renew/i,
    title: "Automatic renewal",
    explanation: "Evergreen terms trap the customer unless an opt-out window is obvious and fair.",
    recommendation: "Require written notice of renewal and a 30–60 day opt-out window.",
  },
  {
    pattern: /irrevocabl(y|e) (assign|transfer)|assigns all (right|intellectual)/i,
    title: "Irrevocable IP assignment",
    explanation: "Broad assignment of all IP, including pre-existing materials, is an outlier unless this is a work-for-hire buyout.",
    recommendation: "Limit assignment to deliverables created under the SOW; license background IP.",
  },
  {
    pattern: /waives? (any and )?all (rights? to )?(a )?jury/i,
    title: "Jury-trial waiver",
    explanation: "Jury waivers are common in some jurisdictions but should be conspicuous and mutual.",
    recommendation: "Make the waiver mutual and confirm it is valid under the chosen governing law.",
  },
  {
    pattern: /non-compete|shall not (directly or indirectly )?(compete|solicit)/i,
    title: "Restrictive covenant",
    explanation: "Non-competes and broad non-solicits are frequently unenforceable or overbroad.",
    recommendation: "Narrow to confidential information and key accounts, with a defined duration and geography.",
  },
];

function unique(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + length + 80);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function firstMatchExcerpt(text: string, pattern: RegExp): string {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const match = re.exec(text);
  if (!match) return "";
  return excerptAround(text, match.index, match[0].length);
}

export function analyzeContract(raw: string): AnalysisResult {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const findings: Finding[] = [];
  let id = 0;
  const nextId = () => `f-${++id}`;

  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+\s+/).filter((s) => s.trim().length > 0);

  const presentClauses: string[] = [];
  const missingClauses: { name: string; why: string }[] = [];

  for (const clause of STANDARD_CLAUSES) {
    const found = clause.patterns.some((p) => p.test(text));
    if (found) presentClauses.push(clause.name);
    else missingClauses.push({ name: clause.name, why: clause.why });
  }

  for (const missing of missingClauses) {
    const severity: Severity =
      missing.name === "Governing law" ||
      missing.name === "Limitation of liability" ||
      missing.name === "Termination"
        ? "high"
        : "medium";
    findings.push({
      id: nextId(),
      title: `Missing ${missing.name.toLowerCase()} clause`,
      category: "Coverage gap",
      severity,
      excerpt: "",
      explanation: missing.why,
      recommendation: `Add a mutual ${missing.name.toLowerCase()} section with commercially standard language.`,
    });
  }

  for (const rule of ONE_SIDED) {
    if (rule.pattern.test(text)) {
      findings.push({
        id: nextId(),
        title: rule.title,
        category: "Imbalance",
        severity: "critical",
        excerpt: firstMatchExcerpt(text, rule.pattern),
        explanation: rule.explanation,
        recommendation: rule.recommendation,
      });
    }
  }

  const vagueHits: { label: string; excerpt: string }[] = [];
  for (const item of AMBIGUOUS) {
    item.pattern.lastIndex = 0;
    const match = item.pattern.exec(text);
    if (match) {
      vagueHits.push({
        label: item.label,
        excerpt: excerptAround(text, match.index, match[0].length),
      });
    }
  }
  if (vagueHits.length >= 3) {
    findings.push({
      id: nextId(),
      title: "Heavy use of vague performance language",
      category: "Ambiguity",
      severity: "medium",
      excerpt: vagueHits[0].excerpt,
      explanation: `The draft leans on open-ended phrases (${vagueHits
        .slice(0, 4)
        .map((v) => v.label)
        .join(", ")}). Those terms are hard to enforce and easy to dispute.`,
      recommendation: "Replace effort standards with measurable SLAs, dates, and acceptance criteria.",
    });
  }

  const amounts = unique(
    [...text.matchAll(/\$[\d,]+(?:\.\d{2})?|\b\d+(?:,\d{3})+(?:\.\d{2})?\s*(USD|dollars)\b/gi)].map(
      (m) => m[0],
    ),
  );
  if (amounts.length === 0 && /payment|fee|price|consideration/i.test(text)) {
    findings.push({
      id: nextId(),
      title: "Fees mentioned without a stated amount",
      category: "Financial",
      severity: "high",
      excerpt: firstMatchExcerpt(text, /payment|fee|price|consideration/i),
      explanation: "The contract talks about payment but never pins a number, rate card, or SOW reference.",
      recommendation: "Attach a fee schedule or cite an exhibit that lists price, currency, and tax treatment.",
    });
  }

  const dates = unique(
    [
      ...text.matchAll(
        /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/gi,
      ),
    ].map((m) => m[0]),
  );

  const parsedYears = dates
    .map((d) => {
      const y = d.match(/\d{4}/);
      return y ? Number(y[0]) : null;
    })
    .filter((n): n is number => n !== null);

  if (parsedYears.length >= 2) {
    const min = Math.min(...parsedYears);
    const max = Math.max(...parsedYears);
    if (max - min >= 8) {
      findings.push({
        id: nextId(),
        title: "Date span looks inconsistent",
        category: "Temporal",
        severity: "medium",
        excerpt: dates.slice(0, 3).join("; "),
        explanation: `Detected years range from ${min} to ${max}. Effective dates, term, and exhibits may have been copied from different templates.`,
        recommendation: "Reconcile the effective date, initial term, and any exhibit dates before signature.",
      });
    }
  }

  const nowYear = new Date().getFullYear();
  for (const year of parsedYears) {
    if (year > nowYear + 15) {
      findings.push({
        id: nextId(),
        title: "Implausible future date",
        category: "Temporal",
        severity: "high",
        excerpt: dates.find((d) => d.includes(String(year))) ?? String(year),
        explanation: `A date in ${year} is far beyond a typical commercial term and may be a typo.`,
        recommendation: "Confirm the intended year with the drafting party.",
      });
      break;
    }
  }

  const parties = unique(
    [
      ...text.matchAll(
        /\b(?:between|among)\s+([A-Z][A-Za-z0-9&.,' -]{2,60}?)\s+\((?:the )?(?:“|")?(?:Company|Client|Customer|Vendor|Provider|Licensor|Licensee)(?:”|")?\)/g,
      ),
    ].map((m) => m[1]),
  );

  if (/party of the first part|party of the second part/i.test(text)) {
    findings.push({
      id: nextId(),
      title: "Archaic party labels",
      category: "Drafting quality",
      severity: "low",
      excerpt: firstMatchExcerpt(text, /party of the (first|second) part/i),
      explanation: "First-part / second-part drafting is easy to misread and is a quality red flag.",
      recommendation: "Name the parties (Customer / Vendor) and use those defined terms consistently.",
    });
  }

  if (/\bTBD\b|\bto be determined\b|\[insert\]|\[party\]|xx\/xx\/xxxx/i.test(text)) {
    findings.push({
      id: nextId(),
      title: "Placeholder text still in the draft",
      category: "Completeness",
      severity: "critical",
      excerpt: firstMatchExcerpt(text, /\bTBD\b|\bto be determined\b|\[insert\]|\[party\]|xx\/xx\/xxxx/i),
      explanation: "Unfilled brackets or TBD markers mean the contract is not execution-ready.",
      recommendation: "Strip every placeholder before circulating for signature.",
    });
  }

  if (/shall not be liable for (any|all).{0,40}(gross negligence|willful misconduct|fraud)/i.test(text)) {
    findings.push({
      id: nextId(),
      title: "Liability waiver covers willful misconduct",
      category: "Imbalance",
      severity: "critical",
      excerpt: firstMatchExcerpt(
        text,
        /shall not be liable for (any|all).{0,80}(gross negligence|willful misconduct|fraud)/i,
      ),
      explanation: "Excluding liability for fraud or willful misconduct is typically unenforceable and a serious anomaly.",
      recommendation: "Carve fraud, willful misconduct, and gross negligence out of any limitation or waiver.",
    });
  }

  const shallVendor = (text.match(/\bVendor shall\b/gi) ?? []).length;
  const shallCustomer = (text.match(/\bCustomer shall\b/gi) ?? []).length;
  if (shallVendor + shallCustomer >= 8 && shallVendor > shallCustomer * 4) {
    findings.push({
      id: nextId(),
      title: "Obligations pile onto one party",
      category: "Imbalance",
      severity: "medium",
      excerpt: firstMatchExcerpt(text, /Vendor shall/i),
      explanation: `“Vendor shall” appears ${shallVendor} times versus “Customer shall” ${shallCustomer} times. The duty stack looks one-sided.`,
      recommendation: "Check that payment, cooperation, and acceptance duties on the customer are actually written.",
    });
  }

  if (text.length > 0 && !/signature|signed by|in witness whereof|\/s\//i.test(text)) {
    findings.push({
      id: nextId(),
      title: "No signature block detected",
      category: "Completeness",
      severity: "medium",
      excerpt: "",
      explanation: "The text does not appear to include signature lines or an execution clause.",
      recommendation: "Add counterpart signature blocks with name, title, and date.",
    });
  }

  if (text.length > 400 && !/\n\s*\d+(\.\d+)*\s+[A-Z]/.test(text) && !/section \d+/i.test(text)) {
    findings.push({
      id: nextId(),
      title: "Unstructured body with no numbered sections",
      category: "Drafting quality",
      severity: "low",
      excerpt: text.slice(0, 120).replace(/\s+/g, " "),
      explanation: "Long legal prose without numbered clauses is harder to negotiate and cite later.",
      recommendation: "Break the agreement into numbered articles (Definitions, Term, Fees, and so on).",
    });
  }

  const severityWeight: Record<Severity, number> = {
    critical: 28,
    high: 16,
    medium: 8,
    low: 3,
  };
  const rawScore = findings.reduce((sum, f) => sum + severityWeight[f.severity], 0);
  const riskScore = Math.min(100, rawScore);

  const riskLabel: AnalysisResult["riskLabel"] =
    riskScore >= 70 ? "Severe" : riskScore >= 45 ? "High" : riskScore >= 22 ? "Elevated" : "Low";

  findings.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);

  return {
    wordCount: words.length,
    sentenceCount: sentences.length,
    riskScore,
    riskLabel,
    findings,
    parties,
    dates,
    amounts,
    presentClauses,
    missingClauses,
  };
}
