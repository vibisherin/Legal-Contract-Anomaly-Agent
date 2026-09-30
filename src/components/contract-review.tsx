"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check,
  FileText,
  Loader2,
  Pencil,
  Scale,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  buildCorrectedDocxBlob,
  buildCorrectedPdfBlob,
  correctedFileStem,
  triggerDownload,
} from "@/lib/download-corrected";
import {
  approveAllLocal,
  approveLocal,
  generateLocal,
  modifyLocal,
  rejectLocal,
  toReviewView,
  type LocalReview,
} from "@/lib/review/local-engine";
import type { CorrectionProposal, ReviewCounts } from "@/lib/review/types";

type ReviewPayload = {
  id: string;
  fileName: string;
  originalText: string;
  generatedAt: string | null;
  counts: ReviewCounts;
  proposals: CorrectionProposal[];
  audit: { id: string; action: string; timestamp: string; clause_number: string; comments: string }[];
  originalPreserved: boolean;
  notice: string;
  error?: string;
  downloads?: { docx: string; pdf: string; original: string };
  finalText?: string;
};

type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "MODIFIED" | "REJECTED";
type SeverityFilter = "ALL" | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "border-amber-400 bg-amber-50 text-amber-800",
  APPROVED: "border-emerald-500 bg-emerald-50 text-emerald-800",
  REJECTED: "border-red-400 bg-red-50 text-red-800",
  MODIFIED: "border-sky-500 bg-sky-50 text-sky-800",
};

async function api(path: string, init?: RequestInit): Promise<ReviewPayload> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = (await response.json()) as ReviewPayload & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

export function ContractReviewDesk({
  contractId,
  session,
  onExit,
}: {
  contractId?: string;
  session?: LocalReview;
  onExit?: () => void;
}) {
  const localMode = Boolean(session);
  const [local, setLocal] = useState<LocalReview | null>(session ?? null);
  const localRef = useRef<LocalReview | null>(session ?? null);
  localRef.current = local;
  const [remote, setRemote] = useState<ReviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [confirmApproveAll, setConfirmApproveAll] = useState(false);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [allowPending, setAllowPending] = useState(false);

  useEffect(() => {
    if (session) setLocal(session);
  }, [session]);

  useEffect(() => {
    if (localMode || !contractId) return;
    let cancelled = false;
    api(`/api/contracts/${contractId}/review`)
      .then((next) => {
        if (!cancelled) setRemote(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Load failed");
      });
    return () => {
      cancelled = true;
    };
  }, [contractId, localMode]);

  const data: ReviewPayload | null = local ? toReviewView(local) : remote;

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.proposals.filter((p) => {
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (severityFilter !== "ALL" && p.severity !== severityFilter) return false;
      if (!q) return true;
      return [
        p.clause_number,
        p.clause_title,
        p.issue_description,
        p.original_text,
        p.proposed_text,
        p.issue_type,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data, statusFilter, severityFilter, query]);

  async function run(action: () => LocalReview | Promise<ReviewPayload>) {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if ("originalText" in next && "proposals" in next && "audit" in next && !("counts" in next)) {
        setLocal(next as LocalReview);
      } else {
        setRemote(next as ReviewPayload);
      }
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function downloadFinal(kind: "docx" | "pdf" | "original") {
    if (!data) return;
    const stem = correctedFileStem(data.fileName);
    if (kind === "original") {
      triggerDownload(
        new Blob([data.originalText], { type: "text/plain;charset=utf-8" }),
        data.fileName || "original-contract.txt",
      );
      return;
    }
    const text = data.finalText;
    if (!text) {
      setError("Generate the corrected contract before downloading.");
      return;
    }
    if (kind === "pdf") {
      triggerDownload(await buildCorrectedPdfBlob(text), `${stem}.pdf`);
      return;
    }
    triggerDownload(await buildCorrectedDocxBlob(text), `${stem}.docx`);
  }

  if (!data && !error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[#4a0a2c]">
        <Loader2 className="mr-2 size-5 animate-spin" />
        Loading review desk…
      </div>
    );
  }

  const counts = data?.counts ?? {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    modified: 0,
    reviewed: 0,
    progress: 0,
  };

  const generated = Boolean(data?.generatedAt && (data.finalText || data.downloads));

  return (
    <div className="min-h-full bg-[#f6f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-[#0f1a33] text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md border border-[#d4af37] bg-[#4a0a2c]">
                <Scale className="size-5 text-[#f5d76e]" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#d4af37]">Contract Review</p>
                <h1 className="font-heading text-2xl text-white">Human-in-the-loop desk</h1>
              </div>
            </div>
            {onExit ? (
              <button type="button" onClick={onExit} className="text-sm text-[#f5d76e] hover:underline">
                ← Back to scan
              </button>
            ) : (
              <a href="/" className="text-sm text-[#f5d76e] hover:underline">
                ← Back to scan
              </a>
            )}
          </div>
          <p className="rounded-md border border-amber-300/40 bg-[#1b2a4d] px-3 py-2 text-sm text-amber-100">
            {data?.notice ??
              "AI-generated corrections are proposals for human review. Review and approve changes before generating the final document."}
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {error ? (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Document</p>
          <h2 className="text-xl font-semibold text-[#0f1a33]">{data?.fileName}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Total Issues" value={counts.total} />
            <Stat label="Pending" value={counts.pending} tone="amber" />
            <Stat label="Approved" value={counts.approved} tone="green" />
            <Stat label="Rejected" value={counts.rejected} tone="red" />
            <Stat label="Modified" value={counts.modified} tone="blue" />
          </div>
          <div className="mt-5">
            <p className="text-sm font-medium text-slate-700">Review Progress</p>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-[#0f1a33]" style={{ width: `${counts.progress}%` }} />
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {counts.progress}% — {counts.reviewed} of {counts.total} corrections reviewed
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || counts.pending === 0}
              onClick={() => setConfirmApproveAll(true)}
              className="rounded-md bg-[#0f1a33] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              APPROVE ALL
            </button>
            <button
              type="button"
              disabled={busy || !data}
              onClick={() => {
                setAllowPending(false);
                setConfirmGenerate(true);
              }}
              className="rounded-md bg-[#d4af37] px-3 py-2 text-sm font-medium text-[#2a0618] disabled:opacity-50"
            >
              GENERATE CORRECTED CONTRACT
            </button>
          </div>
        </section>

        {generated ? (
          <section className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <h3 className="text-lg font-semibold text-emerald-900">✓ Corrected Contract Generated</h3>
            <p className="mt-2 text-sm text-emerald-900">Original: {data?.fileName}</p>
            <p className="text-sm text-emerald-900">
              Final: {correctedFileStem(data?.fileName)}.docx and {correctedFileStem(data?.fileName)}.pdf
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {localMode || data?.finalText ? (
                <>
                  <button
                    type="button"
                    className="rounded-md bg-[#0f1a33] px-3 py-2 text-sm text-white"
                    onClick={() => void downloadFinal("docx")}
                  >
                    Download DOCX
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-[#0f1a33] px-3 py-2 text-sm text-white"
                    onClick={() => void downloadFinal("pdf")}
                  >
                    Download PDF
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-400 px-3 py-2 text-sm"
                    onClick={() => void downloadFinal("original")}
                  >
                    Download original
                  </button>
                </>
              ) : (
                <>
                  <a className="rounded-md bg-[#0f1a33] px-3 py-2 text-sm text-white" href={data?.downloads?.docx}>
                    Download DOCX
                  </a>
                  <a className="rounded-md bg-[#0f1a33] px-3 py-2 text-sm text-white" href={data?.downloads?.pdf}>
                    Download PDF
                  </a>
                  <a className="rounded-md border border-slate-400 px-3 py-2 text-sm" href={data?.downloads?.original}>
                    Download original
                  </a>
                </>
              )}
            </div>
            <div className="mt-4 text-sm text-slate-800">
              <p className="font-semibold">REVIEW SUMMARY</p>
              <ul className="mt-1 space-y-0.5">
                <li>Total anomalies: {counts.total}</li>
                <li>Approved corrections: {counts.approved}</li>
                <li>Modified corrections: {counts.modified}</li>
                <li>Rejected corrections: {counts.rejected}</li>
                <li>Pending corrections: {counts.pending}</li>
              </ul>
              <p className="mt-2">
                Final document generated successfully. Original preserved: {data?.originalPreserved ? "yes" : "no"}
              </p>
            </div>
          </section>
        ) : null}

        <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clauses or issues..."
              className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="MODIFIED">Modified</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
            className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
          >
            <option value="ALL">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </section>

        <div className="space-y-4">
          {filtered.map((proposal) => (
            <article key={proposal.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-[#0f1a33]">
                    Clause {proposal.clause_number} — {proposal.clause_title}
                  </h3>
                  <p className="text-sm text-slate-600">
                    Severity: {proposal.severity} · Issue: {proposal.issue_type}
                  </p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[proposal.status]}`}>
                  {proposal.status === "APPROVED"
                    ? "✓ APPROVED"
                    : proposal.status === "REJECTED"
                      ? "✕ REJECTED"
                      : proposal.status === "MODIFIED"
                        ? "✎ MODIFIED"
                        : "PENDING"}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-700">{proposal.issue_description}</p>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Original</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                    {proposal.original_text || "(Clause is missing from the original.)"}
                  </p>
                </div>
                <div className="rounded-md border border-sky-200 bg-sky-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">AI proposed correction</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{proposal.proposed_text}</p>
                </div>
              </div>
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Why?</p>
                <p className="mt-1 text-sm text-slate-800">{proposal.issue_description}</p>
              </div>

              {editingId === proposal.id ? (
                <div className="mt-4 rounded-md border border-slate-300 p-3">
                  <p className="mb-2 text-sm font-medium">Edit Proposed Correction</p>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={6}
                    className="w-full rounded-md border border-slate-300 p-2 font-mono text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-md bg-[#0f1a33] px-3 py-1.5 text-sm text-white"
                      onClick={() =>
                        void run(() => {
                          const current = localRef.current;
                          if (current) return modifyLocal(current, proposal.id, editText);
                          return api(`/api/contracts/${contractId}/review/${proposal.id}/modify`, {
                            method: "POST",
                            body: JSON.stringify({ final_text: editText }),
                          });
                        })
                      }
                    >
                      Save & Approve
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-sm text-white"
                    onClick={() =>
                      void run(() => {
                        const current = localRef.current;
                        if (current) return approveLocal(current, proposal.id);
                        return api(`/api/contracts/${contractId}/review/${proposal.id}/approve`, { method: "POST" });
                      })
                    }
                  >
                    <Check className="size-4" /> APPROVE
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white"
                    onClick={() => {
                      setEditingId(proposal.id);
                      setEditText(proposal.final_text || proposal.proposed_text);
                    }}
                  >
                    <Pencil className="size-4" /> EDIT
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md bg-red-700 px-3 py-1.5 text-sm text-white"
                    onClick={() =>
                      void run(() => {
                        const current = localRef.current;
                        if (current) return rejectLocal(current, proposal.id);
                        return api(`/api/contracts/${contractId}/review/${proposal.id}/reject`, { method: "POST" });
                      })
                    }
                  >
                    <X className="size-4" /> REJECT
                  </button>
                </div>
              )}
            </article>
          ))}
          {filtered.length === 0 ? (
            <p className="rounded-md border bg-white p-6 text-sm text-slate-600">No proposals match these filters.</p>
          ) : null}
        </div>

        {data && data.audit.length > 0 ? (
          <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="flex items-center gap-2 font-semibold text-[#0f1a33]">
              <FileText className="size-4" /> AUDIT HISTORY
            </h3>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              {data.audit
                .slice()
                .reverse()
                .map((entry) => (
                  <li key={entry.id} className="border-l-2 border-[#d4af37] pl-3">
                    <p className="font-medium">
                      {entry.clause_number ? `Clause ${entry.clause_number} — ` : ""}
                      {entry.action}
                    </p>
                    <p className="text-xs text-slate-500">{new Date(entry.timestamp).toLocaleString()}</p>
                    {entry.comments ? <p className="text-xs">{entry.comments}</p> : null}
                  </li>
                ))}
            </ol>
          </section>
        ) : null}
      </main>

      {confirmApproveAll ? (
        <Modal
          title="Approve all pending?"
          body="Are you sure you want to approve all pending AI corrections? This will apply all currently pending corrections to the final document."
          cancel={() => setConfirmApproveAll(false)}
          confirmLabel="Approve all"
          confirm={() => {
            setConfirmApproveAll(false);
            void run(() => {
              const current = localRef.current;
              if (current) return approveAllLocal(current);
              return api(`/api/contracts/${contractId}/review/approve-all`, { method: "POST" });
            });
          }}
        />
      ) : null}

      {confirmGenerate && data ? (
        <Modal
          title="FINAL REVIEW"
          body={`Approved: ${counts.approved}
Modified: ${counts.modified}
Rejected: ${counts.rejected}
Pending: ${counts.pending}

The original document will remain unchanged.

Generate final corrected contract?${counts.pending ? "\n\nPending items will block generation unless you choose Generate with pending items (pending kept as original)." : ""}`}
          cancel={() => setConfirmGenerate(false)}
          confirmLabel="Generate Corrected Contract"
          confirmDisabled={counts.pending > 0 && !allowPending}
          extra={
            counts.pending > 0 ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={allowPending} onChange={(e) => setAllowPending(e.target.checked)} />
                Generate with pending items (keep original text for pending)
              </label>
            ) : null
          }
          confirm={() => {
            setConfirmGenerate(false);
            void run(() => {
              const current = localRef.current;
              if (current) return generateLocal(current, allowPending);
              return api(`/api/contracts/${contractId}/generate-corrected`, {
                method: "POST",
                body: JSON.stringify({ allowPending }),
              });
            });
          }}
        />
      ) : null}

      {busy ? (
        <div className="pointer-events-none fixed bottom-4 right-4 flex items-center gap-2 rounded-md bg-[#0f1a33] px-3 py-2 text-sm text-white">
          <Loader2 className="size-4 animate-spin" />
          Saving…
        </div>
      ) : null}
      <p className="hidden">
        <ShieldAlert className="size-4" />
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "amber" | "green" | "red" | "blue" }) {
  const color =
    tone === "amber"
      ? "text-amber-700"
      : tone === "green"
        ? "text-emerald-700"
        : tone === "red"
          ? "text-red-700"
          : tone === "blue"
            ? "text-sky-700"
            : "text-[#0f1a33]";
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function Modal({
  title,
  body,
  cancel,
  confirm,
  confirmLabel,
  confirmDisabled,
  extra,
}: {
  title: string;
  body: string;
  cancel: () => void;
  confirm: () => void;
  confirmLabel: string;
  confirmDisabled?: boolean;
  extra?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-[#0f1a33]">{title}</h3>
        <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{body}</p>
        {extra ? <div className="mt-3">{extra}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={cancel}>
            Cancel
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            className="rounded-md bg-[#d4af37] px-3 py-2 text-sm font-medium text-[#2a0618] disabled:opacity-50"
            onClick={confirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
