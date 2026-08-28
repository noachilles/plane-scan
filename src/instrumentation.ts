export async function register() {
  // 빌드 단계에서는 스캔 루프를 띄우지 않는다
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startScanLoop } = await import("@/lib/scanner");
  startScanLoop();
}
