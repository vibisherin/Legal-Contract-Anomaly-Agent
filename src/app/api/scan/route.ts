import { NextResponse } from "next/server";
import { scanFromFormData } from "@/lib/scan-from-form";
import { emptyScanState } from "@/lib/scan-state";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const state = await scanFromFormData(emptyScanState, formData);
  const status = state.error && !state.result ? 400 : 200;
  return NextResponse.json(state, { status });
}
