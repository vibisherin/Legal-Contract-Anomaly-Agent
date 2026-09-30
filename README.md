# Legal Contract Anomaly

NLP desk for reviewing legal drafts: missing commercial clauses, one-sided terms, placeholders, and date or fee inconsistencies. Intended for a local toolkit folder such as `D:\AI_TOOLS_FOR_NLP\Legal Contract Anomaly`.

The scanner scores drafts, then sends AI correction **proposals** to a human review desk. The original contract is never overwritten. After approve / edit / reject, generate `*_Corrected.docx` and `*_Corrected.pdf`.

## Color system

Deep magenta (`#1a0410`, `#4a0a2c`, `#c2185b`) with gold (`#d4af37`, `#f5d76e`) for headings, borders, and the primary scan action.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:43147](http://localhost:43147) if you start the server with `npm run dev -- --port 43147`, or the URL printed in the terminal.

## How to use

1. Click **Load risky sample** or paste/upload a contract and **Scan for anomalies**.
2. Click **Review AI proposals** to open the Contract Review desk on the same page (approve, edit, reject, generate, and download work in the browser; the original text is never changed).
3. Approve, edit, or reject each proposal. Use **APPROVE ALL** if needed.
4. Click **GENERATE CORRECTED CONTRACT**, then download DOCX and PDF. The original remains available.

AI-generated corrections are proposals for human review. Review and approve changes before generating the final document.

## Review APIs

- `POST /api/contracts` — create a review from draft or file
- `GET /api/contracts/{id}/review`
- `POST /api/contracts/{id}/review/{proposalId}/approve`
- `POST /api/contracts/{id}/review/{proposalId}/reject`
- `POST /api/contracts/{id}/review/{proposalId}/modify` `{ "final_text": "..." }`
- `POST /api/contracts/{id}/review/approve-all`
- `POST /api/contracts/{id}/generate-corrected`
- `GET /api/contracts/{id}/download/{original|pdf|docx}`

Review records are stored as JSON documents under `data/contracts/` (not MongoDB). Original bytes, when uploaded, live in `data/files/`.

The **risky sample** is written to trigger many rules. The **balanced sample** should score much lower.
