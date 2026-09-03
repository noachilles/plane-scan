import { NextResponse } from "next/server";
import { getScannerStatus } from "@/lib/scanner";

export const dynamic = "force-dynamic";

/** 자동 감시 루프 상태 — 헤더 상태 표시용 */
export function GET() {
  return NextResponse.json(getScannerStatus());
}
