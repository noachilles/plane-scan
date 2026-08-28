import { NextResponse } from "next/server";
import { runScan } from "@/lib/scanner";

export const dynamic = "force-dynamic";

/** 수동 스캔 트리거 */
export async function POST() {
  const result = await runScan("manual");
  return NextResponse.json(result);
}
