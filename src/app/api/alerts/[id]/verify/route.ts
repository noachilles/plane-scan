import { NextResponse } from "next/server";
import { getDb, type AlertRow, type WatchRow } from "@/lib/db";
import { scanWatchNow } from "@/lib/scanner";
import { getSource } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/**
 * "가격 다시 확인" — 알림이 가리키는 일정을 즉시 재스캔한다.
 * 스캔 과정에서 특가가 사라졌으면 expired 로, 살아있으면 verified_at 갱신으로 반영된다.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const db = getDb();

  const alert = db.prepare("SELECT * FROM alerts WHERE id = ?").get(id) as AlertRow | undefined;
  if (!alert) return NextResponse.json({ error: "알림을 찾을 수 없습니다" }, { status: 404 });

  const r = await scanWatchNow(alert.watch_id, "verify", 0); // 캐시 없이 즉시 재조회
  if (!r.ok && r.error === "활성 일정이 아님") {
    return NextResponse.json({ error: "이 일정은 감시가 꺼져 있어 확인할 수 없습니다" }, { status: 409 });
  }

  let updated = db.prepare("SELECT * FROM alerts WHERE id = ?").get(id) as AlertRow;

  // 살아있는 알림이면 판매처 예매 링크도 갱신 (세션성 토큰이라 만료될 수 있음)
  const src = getSource();
  if (updated.expired === 0 && updated.itinerary_ids && src.getBookingLink) {
    const w = db.prepare("SELECT * FROM watches WHERE id = ?").get(updated.watch_id) as WatchRow | undefined;
    if (w) {
      try {
        const b = await src.getBookingLink(
          { origin: w.origin, destination: w.destination, departDate: w.depart_date, returnDate: w.return_date },
          updated.itinerary_ids,
        );
        db.prepare("UPDATE alerts SET booking_url = ?, booking_partner = ? WHERE id = ?").run(
          b?.url ?? null,
          b?.partner ?? null,
          id,
        );
        updated = db.prepare("SELECT * FROM alerts WHERE id = ?").get(id) as AlertRow;
      } catch {
        /* 링크 갱신 실패는 무시 — 기존 링크 유지 */
      }
    }
  }

  return NextResponse.json({ alert: updated, scanError: r.ok ? null : (r.error ?? null) });
}
