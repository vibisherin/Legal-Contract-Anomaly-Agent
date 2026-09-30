import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ContractRecord } from "@/lib/review/types";

const DATA_DIR = path.join(process.cwd(), "data", "contracts");
const FILES_DIR = path.join(process.cwd(), "data", "files");

let writeChain: Promise<void> = Promise.resolve();

function filePath(id: string): string {
  return path.join(DATA_DIR, `${id}.json`);
}

export async function ensureDataDirs(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(FILES_DIR, { recursive: true });
}

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function saveOriginalBytes(id: string, bytes: Uint8Array, ext: string): Promise<string> {
  await ensureDataDirs();
  const stored = path.join(FILES_DIR, `${id}.original${ext}`);
  await writeFile(stored, Buffer.from(bytes));
  return stored;
}

export async function readContract(id: string): Promise<ContractRecord | null> {
  try {
    const raw = await readFile(filePath(id), "utf8");
    return JSON.parse(raw) as ContractRecord;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeContract(record: ContractRecord): Promise<void> {
  const job = writeChain.then(async () => {
    await ensureDataDirs();
    const target = filePath(record.id);
    const temp = `${target}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(record, null, 2), "utf8");
    await rename(temp, target);
  });
  writeChain = job.catch(() => undefined);
  await job;
}

export function originalFilesDir(): string {
  return FILES_DIR;
}
