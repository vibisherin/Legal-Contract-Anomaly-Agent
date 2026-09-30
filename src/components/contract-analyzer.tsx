"use client";

import { useRef, useState } from "react";
import { AlertTriangle, FileSearch, Gavel, Loader2, Scale, ShieldAlert, Sparkles, Upload } from "lucide-react";
import { analyzeContract, type AnalysisResult, type Severity } from "@/lib/analyze-contract";
import { readContractFile } from "@/lib/read-contract-file";
import { createLocalReview, type LocalReview } from "@/lib/review/local-engine";
import { SAMPLE_ANOMALOUS, SAMPLE_BALANCED } from "@/lib/sample-contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ContractReviewDesk } from "@/components/contract-review";
import { Separator } from "@/components/ui/separator";

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "border-[#f5d76e] bg-[#5a1238] text-[#f5d76e]",
  high: "border-[#e8b4c8] bg-[#4a0d2c] text-[#f3c6d8]",
  medium: "border-[#c9a227]/60 bg-[#3a0a24] text-[#e8d5a3]",
  low: "border-[#c9a227]/30 bg-[#2a0818] text-[#d4c4a8]",
};

function riskTone(label: AnalysisResult["riskLabel"]) {
  if (label === "Severe") return "text-[#f5d76e]";
  if (label === "High") return "text-[#f0c4d6]";
  if (label === "Elevated") return "text-[#e8d5a3]";
  return "text-[#d4af37]";
}

const goldBtn =
  "inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#d4af37]/50 bg-[#3a0a24] px-3 text-sm font-medium text-[#f5d76e] hover:bg-[#4a0d2c] hover:text-[#fff3c4]";

export function ContractAnalyzer() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reviewSession, setReviewSession] = useState<LocalReview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadedBytes = useRef<File | null>(null);

  function scanNow(source: string, name: string | null = fileName) {
    const draft = source.trim();
    if (!draft) {
      setResult(null);
      setError("Paste a contract, load a sample, or choose a file first.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const next = analyzeContract(draft);
      setText(draft);
      setFileName(name);
      setResult(next);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "The scanner could not parse that draft.");
    } finally {
      setPending(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const contents = await readContractFile(file);
      uploadedBytes.current = file;
      scanNow(contents, file.name);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Could not read that file.");
      setPending(false);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function openHumanReview() {
    const draft = text.trim();
    if (!draft || !result) {
      setError("Scan a contract first, then open Review AI proposals.");
      return;
    }
    setError(null);
    try {
      setReviewSession(createLocalReview(fileName ?? "pasted-contract.pdf", draft, result.findings));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start human review.");
    }
  }

  if (reviewSession) {
    return (
      <ContractReviewDesk session={reviewSession} onExit={() => setReviewSession(null)} />
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-[#d4af37]/30 bg-[#2a0618]/90">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-11 items-center justify-center rounded-md border border-[#d4af37] bg-[#4a0a2c] text-[#f5d76e]">
                <Scale className="size-5" />
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-[#d4af37]">
                  AI Tools for NLP
                </p>
                <h1 className="font-heading text-2xl text-[#f8e7b0] sm:text-3xl">
                  Legal Contract Anomaly
                </h1>
              </div>
            </div>
            <Badge className="w-fit border border-[#d4af37] bg-[#5a1238] text-[#f5d76e]">
              Magenta + gold desk
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={goldBtn} onClick={() => {
              uploadedBytes.current = null;
              scanNow(SAMPLE_ANOMALOUS, "risky-sample.pdf");
            }}>
              <AlertTriangle className="size-4" />
              Load risky sample
            </button>
            <button
              type="button"
              className={`${goldBtn} bg-transparent`}
              onClick={() => {
                uploadedBytes.current = null;
                scanNow(SAMPLE_BALANCED, "balanced-sample.pdf");
              }}
            >
              <ShieldAlert className="size-4" />
              Load balanced sample
            </button>
            <label className={`${goldBtn} max-w-full`}>
              <Upload className="size-4" />
              <span>Upload .txt / .pdf / .docx</span>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="w-[14rem] cursor-pointer text-xs text-[#f8e7b0] file:mr-2 file:hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  void onFile(file);
                }}
              />
            </label>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#d4af37] px-4 text-sm font-medium text-[#2a0618] hover:bg-[#f5d76e]"
              onClick={() => scanNow(text, fileName ?? "pasted-contract.pdf")}
              disabled={pending}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <FileSearch className="size-4" />}
              Scan for anomalies
            </button>
            <button
              type="button"
              className="h-10 px-3 text-sm text-[#e8c9d6] hover:text-[#f5d76e]"
              onClick={() => {
                setText("");
                setFileName(null);
                setResult(null);
                setError(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-2">
        <section className="flex min-h-[22rem] flex-col gap-2">
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (error) setError(null);
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              void onFile(event.dataTransfer.files[0]);
            }}
            rows={16}
            placeholder="Paste the contract here, drop a .txt/.pdf/.docx file, or use Upload in the top bar."
            className="min-h-[18rem] w-full flex-1 resize-y rounded-lg border border-[#d4af37]/25 bg-[#1a0410] px-3 py-3 font-mono text-[13px] leading-relaxed text-[#f3e6ea] outline-none placeholder:text-[#b8899c] focus:border-[#f5d76e]"
          />
          <p className="text-xs text-[#c9a0b0]">
            {fileName ? `${fileName} · ` : ""}
            {text.trim() ? `${text.trim().split(/\s+/).length} words loaded` : "No draft loaded yet"}
          </p>
        </section>

        <section className="min-h-[22rem]">
          {error ? (
            <Alert className="mb-4 border-[#d4af37]/50 bg-[#4a0a2c]">
              <Gavel className="size-4 text-[#f5d76e]" />
              <AlertTitle className="text-[#f5d76e]">Scan did not finish</AlertTitle>
              <AlertDescription className="text-[#f3d5e0]">{error}</AlertDescription>
            </Alert>
          ) : null}

          {result ? (
            <ResultsPanel
              result={result}
              reviewBusy={false}
              onReview={() => openHumanReview()}
            />
          ) : (
            <Card className="h-full border-[#d4af37]/25 bg-[#2a0618]/70">
              <CardHeader>
                <CardTitle className="font-heading text-[#f5d76e]">Findings desk</CardTitle>
                <CardDescription className="text-[#e8c9d6]">
                  Click <span className="text-[#f5d76e]">Load risky sample</span> to see a full report
                  immediately, or paste a draft and click Scan for anomalies.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-[#f0d7e0]">
                <p className="flex items-center gap-2">
                  <Sparkles className="size-4 text-[#d4af37]" />
                  Flags missing governing law, liability caps, and termination symmetry.
                </p>
                <p className="flex items-center gap-2">
                  <Sparkles className="size-4 text-[#d4af37]" />
                  Catches TBD placeholders, auto-renew traps, and uncapped waivers.
                </p>
                <p className="flex items-center gap-2">
                  <Sparkles className="size-4 text-[#d4af37]" />
                  Heuristic NLP only — not legal advice.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}

function ResultsPanel({
  result,
  onReview,
  reviewBusy,
}: {
  result: AnalysisResult;
  onReview: () => void;
  reviewBusy: boolean;
}) {
  return (
    <Card className="overflow-visible border-[#d4af37]/30 bg-[#2a0618]/80">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle className="font-heading text-2xl text-[#f5d76e]">Anomaly report</CardTitle>
            <CardDescription className="text-[#e8c9d6]">
              {result.findings.length} finding{result.findings.length === 1 ? "" : "s"} · {result.wordCount}{" "}
              words
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#d4af37]">Risk index</p>
            <p className={`font-heading text-4xl ${riskTone(result.riskLabel)}`}>{result.riskScore}</p>
            <p className="text-sm text-[#f0d7e0]">{result.riskLabel}</p>
            <button
              type="button"
              onClick={onReview}
              disabled={reviewBusy}
              className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#d4af37] px-3 text-xs font-medium text-[#2a0618] hover:bg-[#f5d76e] disabled:opacity-60"
            >
              {reviewBusy ? <Loader2 className="size-3.5 animate-spin" /> : <FileSearch className="size-3.5" />}
              Review AI proposals
            </button>
            <p className="mt-1 max-w-[13rem] text-[10px] leading-snug text-[#c9a0b0]">
              AI proposes. You approve, edit, or reject before any corrected file is generated.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {result.findings.length === 0 ? (
          <p className="text-sm text-[#e8c9d6]">No heuristic anomalies fired against the current rule set.</p>
        ) : (
          <ol className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {result.findings.map((finding, index) => (
              <li key={finding.id} className="rounded-md border border-[#d4af37]/20 bg-[#1a0410] px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[#f8e7b0]">
                    {index + 1}. {finding.title}
                  </p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${SEVERITY_STYLES[finding.severity]}`}
                  >
                    {finding.severity}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#c9a0b0]">{finding.category}</p>
                <p className="mt-2 text-sm leading-relaxed text-[#f3d5e0]">{finding.explanation}</p>
                {finding.excerpt ? (
                  <p className="mt-2 font-mono text-xs leading-relaxed text-[#e8d5a3]">“{finding.excerpt}”</p>
                ) : null}
                <p className="mt-2 text-sm text-[#f8e7b0]">
                  <span className="font-medium text-[#d4af37]">Next step: </span>
                  {finding.recommendation}
                </p>
              </li>
            ))}
          </ol>
        )}

        <Separator className="bg-[#d4af37]/20" />
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[#d4af37]">Present clauses</p>
          <div className="flex flex-wrap gap-2">
            {result.presentClauses.length ? (
              result.presentClauses.map((c) => (
                <Badge key={c} className="border border-[#d4af37]/40 bg-[#3a0a24] text-[#f5d76e]">
                  {c}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-[#e8c9d6]">No standard commercial headings matched.</p>
            )}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[#d4af37]">Missing clauses</p>
          <ul className="space-y-2">
            {result.missingClauses.length ? (
              result.missingClauses.map((c) => (
                <li key={c.name} className="rounded-md border border-[#d4af37]/15 bg-[#1a0410] px-3 py-2">
                  <p className="font-medium text-[#f8e7b0]">{c.name}</p>
                  <p className="text-sm text-[#e8c9d6]">{c.why}</p>
                </li>
              ))
            ) : (
              <p className="text-sm text-[#e8c9d6]">Core commercial coverage looks present.</p>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
