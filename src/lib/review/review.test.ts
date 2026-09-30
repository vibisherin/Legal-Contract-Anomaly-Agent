import assert from "node:assert/strict";
import { analyzeContract } from "../analyze-contract";
import { SAMPLE_ANOMALOUS, SAMPLE_BALANCED } from "../sample-contracts";
import {
  approveAllLocal,
  approveLocal,
  createLocalReview,
  generateLocal,
  modifyLocal,
  rejectLocal,
} from "./local-engine";
import { reconstructContract } from "./reconstruct";
import {
  approveAllPending,
  approveProposal,
  createContractReview,
  generateCorrected,
  modifyProposal,
  originalUnchanged,
  rejectProposal,
} from "./service";
import type { CorrectionProposal } from "./types";

function firstInPlace(proposals: CorrectionProposal[]): CorrectionProposal {
  const hit = proposals.find((p) => p.original_text && SAMPLE_ANOMALOUS.includes(p.original_text));
  assert.ok(hit, "expected an in-place proposal");
  return hit;
}

async function scenarioA() {
  const record = await createContractReview({ fileName: "a.txt", originalText: SAMPLE_ANOMALOUS });
  const original = record.originalText;
  const proposal = firstInPlace(record.proposals);
  const after = await approveProposal(record.id, proposal.id);
  const generated = await generateCorrected(after.id, { allowPending: true });
  const finalText = generated.versions.finalCorrected ?? "";
  assert.ok(finalText.includes(proposal.proposed_text) || finalText !== original);
  assert.equal(generated.originalText, original);
  assert.ok(originalUnchanged(generated));
}

async function scenarioB() {
  const record = await createContractReview({ fileName: "b.txt", originalText: SAMPLE_ANOMALOUS });
  const proposal = firstInPlace(record.proposals);
  const snippet = proposal.original_text;
  await rejectProposal(record.id, proposal.id);
  const generated = await generateCorrected(record.id, { allowPending: true });
  const finalText = generated.versions.finalCorrected ?? "";
  assert.ok(finalText.includes(snippet) || snippet.length === 0);
  assert.equal(generated.originalText, SAMPLE_ANOMALOUS.replace(/\r\n/g, "\n"));
}

async function scenarioC() {
  const record = await createContractReview({ fileName: "c.txt", originalText: SAMPLE_ANOMALOUS });
  const proposal = firstInPlace(record.proposals);
  const edited = "HUMAN-EDITED LIABILITY CAP OF $1,000,000.";
  await modifyProposal(record.id, proposal.id, edited);
  const generated = await generateCorrected(record.id, { allowPending: true });
  const finalText = generated.versions.finalCorrected ?? "";
  assert.ok(finalText.includes("HUMAN-EDITED LIABILITY CAP"));
  assert.equal(generated.originalText.includes("HUMAN-EDITED LIABILITY CAP"), false);
}

async function scenarioD() {
  const record = await createContractReview({ fileName: "d.txt", originalText: SAMPLE_ANOMALOUS });
  const [one, two, three] = record.proposals;
  await approveProposal(record.id, one.id);
  await modifyProposal(record.id, two.id, "MODIFIED-CLAUSE-UNIQUE-TOKEN");
  await rejectProposal(record.id, three.id);
  const generated = await generateCorrected(record.id, { allowPending: true });
  const finalText = generated.versions.finalCorrected ?? "";
  assert.ok(finalText.includes("MODIFIED-CLAUSE-UNIQUE-TOKEN"));
  const rejected = generated.proposals.find((p) => p.id === three.id);
  assert.equal(rejected?.status, "REJECTED");
  const approved = generated.proposals.find((p) => p.id === one.id);
  assert.equal(approved?.status, "APPROVED");
}

async function scenarioE() {
  const original = "Short note with no legal structure.";
  const rebuilt = reconstructContract(original, []);
  assert.equal(rebuilt.trim(), original.trim());
}

async function scenarioF() {
  const record = await createContractReview({ fileName: "f.txt", originalText: SAMPLE_BALANCED });
  const hash = record.originalSha256;
  await approveAllPending(record.id);
  const generated = await generateCorrected(record.id);
  assert.equal(generated.originalSha256, hash);
  assert.equal(generated.originalText, record.originalText);
  assert.ok(originalUnchanged(generated));
}

async function pendingBlocksGenerate() {
  const record = await createContractReview({ fileName: "p.txt", originalText: SAMPLE_ANOMALOUS });
  assert.ok(record.proposals.some((p) => p.status === "PENDING"));
  let blocked = false;
  try {
    await generateCorrected(record.id);
  } catch (err) {
    blocked = err instanceof Error;
  }
  assert.ok(blocked, "generate should fail while pending remain");
}

async function emptyModifyFails() {
  const record = await createContractReview({ fileName: "e.txt", originalText: SAMPLE_ANOMALOUS });
  let failed = false;
  try {
    await modifyProposal(record.id, record.proposals[0].id, "   ");
  } catch {
    failed = true;
  }
  assert.ok(failed);
}

async function missingIds() {
  let missingContract = false;
  try {
    await approveProposal("missing", "x");
  } catch {
    missingContract = true;
  }
  const record = await createContractReview({ fileName: "m.txt", originalText: SAMPLE_ANOMALOUS });
  let missingProposal = false;
  try {
    await approveProposal(record.id, "not-a-proposal");
  } catch {
    missingProposal = true;
  }
  assert.ok(missingContract && missingProposal);
}

function localDeskFlow() {
  const analysis = analyzeContract(SAMPLE_ANOMALOUS);
  const session = createLocalReview("local.pdf", SAMPLE_ANOMALOUS, analysis.findings);
  const original = session.originalText;
  const first = session.proposals[0];
  const approved = approveLocal(session, first.id);
  assert.equal(approved.proposals.find((p) => p.id === first.id)?.status, "APPROVED");
  assert.equal(approved.originalText, original);

  const second = approved.proposals[1];
  const edited = modifyLocal(approved, second.id, "HUMAN-LOCAL-EDIT");
  assert.equal(edited.proposals.find((p) => p.id === second.id)?.status, "MODIFIED");

  const third = edited.proposals[2];
  const rejected = rejectLocal(edited, third.id);
  assert.equal(rejected.proposals.find((p) => p.id === third.id)?.status, "REJECTED");

  let blocked = false;
  try {
    generateLocal(rejected, false);
  } catch {
    blocked = true;
  }
  assert.ok(blocked);

  const generated = generateLocal(rejected, true);
  assert.ok(generated.finalText);
  assert.equal(generated.originalText, original);
  assert.ok(generated.finalText?.includes("HUMAN-LOCAL-EDIT"));
}

function localApproveAll() {
  const analysis = analyzeContract(SAMPLE_BALANCED);
  const session = createLocalReview("balanced.pdf", SAMPLE_BALANCED, analysis.findings);
  const all = approveAllLocal(session);
  assert.equal(all.proposals.every((p) => p.status === "APPROVED"), true);
  const generated = generateLocal(all, false);
  assert.ok(generated.generatedAt);
  assert.equal(generated.originalText, session.originalText);
}

async function main() {
  await scenarioA();
  await scenarioB();
  await scenarioC();
  await scenarioD();
  scenarioE();
  await scenarioF();
  await pendingBlocksGenerate();
  await emptyModifyFails();
  await missingIds();
  localDeskFlow();
  localApproveAll();
  console.log("HITL review tests passed");
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
