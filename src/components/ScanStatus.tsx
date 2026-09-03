"use client";

import { useEffect, useState } from "react";
import { fmtTime, type ScannerStatusDto } from "@/lib/apiTypes";

interface Props {
  status: ScannerStatusDto | null;
}

/** 헤더용 자동 감시 상태 — "버튼 없이도 돌고 있다"를 항상 보여준다 */
export default function ScanStatus({ status }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  if (!status) return null;

  const nextIn = status.nextScanAt ? Math.max(0, Math.round((new Date(status.nextScanAt).getTime() - now) / 60_000)) : null;

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500" title={status.lastError ?? undefined}>
      {status.scanning ? (
        <span className="flex items-center gap-1.5 font-semibold text-blue-600">
          <i className="bi bi-arrow-repeat animate-spin" aria-hidden />
          검색 중
        </span>
      ) : status.loopStarted ? (
        <span className="flex items-center gap-1.5 font-semibold text-emerald-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
          자동 감시 중
        </span>
      ) : (
        <span className="font-semibold text-slate-400">감시 대기</span>
      )}
      <span className="hidden sm:inline">
        {status.lastScanAt ? `마지막 ${fmtTime(status.lastScanAt)}` : "아직 스캔 전"}
        {nextIn !== null && !status.scanning && ` · 다음 ${nextIn === 0 ? "곧" : `${nextIn}분 후`}`}
      </span>
      {status.lastError && <i className="bi bi-exclamation-circle text-amber-500" aria-label="최근 스캔 오류" />}
    </div>
  );
}
