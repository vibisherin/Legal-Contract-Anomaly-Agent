import assert from "node:assert/strict";
import { analyzeContract } from "./analyze-contract";
import { SAMPLE_ANOMALOUS, SAMPLE_BALANCED } from "./sample-contracts";

const risky = analyzeContract(SAMPLE_ANOMALOUS);
assert.ok(risky.riskScore >= 70, `expected severe sample, got ${risky.riskScore}`);
assert.ok(
  risky.findings.some((f) => /placeholder/i.test(f.title)),
  "placeholders should be flagged",
);
assert.ok(
  risky.findings.some((f) => /unlimited liability/i.test(f.title)),
  "unlimited liability should be flagged",
);

const clean = analyzeContract(SAMPLE_BALANCED);
assert.ok(clean.riskScore < risky.riskScore, "balanced sample should score lower");
assert.ok(clean.presentClauses.includes("Governing law"));
assert.ok(clean.presentClauses.includes("Limitation of liability"));

const empty = analyzeContract("");
assert.equal(empty.wordCount, 0);

async function checkFiles() {
  const { correctContract } = await import("./correct-contract");
  const { formatFromFileName } = await import("./download-corrected");
  assert.equal(formatFromFileName("deal.pdf"), "pdf");
  assert.equal(formatFromFileName("deal.docx"), "docx");
  assert.equal(formatFromFileName("notes.txt"), "txt");
  assert.equal(formatFromFileName(null), "pdf");

  const corrected = correctContract(SAMPLE_ANOMALOUS, risky);
  assert.equal(corrected.includes("TBD"), false);
  assert.equal(/unlimited/i.test(corrected), false);
  assert.ok(/Limitation of Liability/i.test(corrected));
  const { readContractFile, ContractFileError } = await import("./read-contract-file");
  const fromTxt = await readContractFile(
    new File([SAMPLE_ANOMALOUS], "risky.txt", { type: "text/plain" }),
  );
  assert.ok(fromTxt.includes("MASTER SERVICES AGREEMENT"));

  const fs = await import("node:fs/promises");
  const pdfBytes = await fs.readFile("/tmp/sample-contract.pdf").catch(async () => {
    await fs.writeFile(
      "/tmp/sample-contract.pdf",
      Buffer.from(
        `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 68>>stream
BT /F1 12 Tf 72 720 Td (MASTER SERVICES AGREEMENT TBD unlimited liability) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000384 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
466
%%EOF`,
      ),
    );
    return fs.readFile("/tmp/sample-contract.pdf");
  });
  const fromPdf = await readContractFile(
    new File([pdfBytes], "sample-contract.pdf", { type: "application/pdf" }),
  );
  assert.ok(/MASTER SERVICES AGREEMENT/i.test(fromPdf), `pdf text was: ${fromPdf.slice(0, 200)}`);

  let rejected = false;
  try {
    await readContractFile(new File(["x"], "scan.png", { type: "image/png" }));
  } catch (err) {
    rejected = err instanceof ContractFileError;
  }
  assert.ok(rejected, "unsupported types should throw ContractFileError");
}

void checkFiles()
  .then(() => {
    console.log(
      JSON.stringify(
        {
          risky: { score: risky.riskScore, label: risky.riskLabel, findings: risky.findings.length },
          balanced: {
            score: clean.riskScore,
            label: clean.riskLabel,
            findings: clean.findings.length,
          },
        },
        null,
        2,
      ),
    );
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
