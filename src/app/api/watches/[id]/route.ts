import { NextResponse } from "next/server";
import { getDb, type WatchRow } from "@/lib/db";
import { scanWatchNow } from "@/lib/scanner";
import { watchPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function findWatch(id: number): WatchRow | undefined {
  return getDb().prepare("SELECT * FROM watches WHERE id = ?").get(id) as WatchRow | undefined;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const existing = findWatch(id);
  if (!existing) return NextResponse.json({ error: "일정을 찾을 수 없습니다" }, { status: 404 });

  const parsed = watchPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const p = parsed.data;

  const merged = {
    origin: p.origin ?? existing.origin,
    destination: p.destination ?? existing.destination,
    depart_date: p.departDate ?? existing.depart_date,
    return_date: p.returnDate !== undefined ? p.returnDate : existing.return_date,
    time_from: p.timeFrom ?? existing.time_from,
    time_to: p.timeTo ?? existing.time_to,
    max_price: p.maxPrice ?? existing.max_price,
    active: p.active !== undefined ? (p.active ? 1 : 0) : existing.active,
    return_time_from: p.returnTimeFrom !== undefined ? p.returnTimeFrom : existing.return_time_from,
    return_time_to: p.returnTimeTo !== undefined ? p.returnTimeTo : existing.return_time_to,
    direct_only: p.directOnly !== undefined ? (p.directOnly ? 1 : 0) : existing.direct_only,
  };
  if (!merged.return_date) {
    merged.return_time_from = null;
    merged.return_time_to = null;
  }

  if (merged.origin === merged.destination) {
    return NextResponse.json({ error: "출발지와 도착지가 같습니다" }, { status: 400 });
  }
  if (merged.return_date && merged.return_date < merged.depart_date) {
    return NextResponse.json({ error: "오는 날이 가는 날보다 빠릅니다" }, { status: 400 });
  }
  if (merged.time_from > merged.time_to) {
    return NextResponse.json({ error: "가는편 시간대 범위가 올바르지 않습니다" }, { status: 400 });
  }
  if (merged.return_time_from && merged.return_time_to && merged.return_time_from > merged.return_time_to) {
    return NextResponse.json({ error: "오는편 시간대 범위가 올바르지 않습니다" }, { status: 400 });
  }

  // 노선·날짜가 바뀌면 기존 수집 데이터·알림은 의미가 없으므로 함께 정리한다
  const routeChanged =
    merged.origin !== existing.origin ||
    merged.destination !== existing.destination ||
    merged.depart_date !== existing.depart_date ||
    merged.return_date !== existing.return_date;

  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `UPDATE watches SET origin=?, destination=?, depart_date=?, return_date=?, time_from=?, time_to=?, max_price=?, active=?, return_time_from=?, return_time_to=?, direct_only=?
       WHERE id=?`,
    ).run(
      merged.origin,
      merged.destination,
      merged.depart_date,
      merged.return_date,
      merged.time_from,
      merged.time_to,
      merged.max_price,
      merged.active,
      merged.return_time_from,
      merged.return_time_to,
      merged.direct_only,
      id,
    );
    if (routeChanged) {
      db.prepare("DELETE FROM fares WHERE watch_id = ?").run(id);
      db.prepare("DELETE FROM alerts WHERE watch_id = ?").run(id);
    }
  })();

  // 조건이 바뀌었고 감시 중이면 즉시 재검색 (최근 검색 캐시가 있으면 재사용)
  const conditionChanged =
    routeChanged ||
    merged.time_from !== existing.time_from ||
    merged.time_to !== existing.time_to ||
    merged.return_time_from !== existing.return_time_from ||
    merged.return_time_to !== existing.return_time_to ||
    merged.direct_only !== existing.direct_only ||
    merged.max_price !== existing.max_price;
  if (conditionChanged && merged.active === 1) {
    scanWatchNow(id, "edited").catch((e) => console.warn("[scanner] edited scan failed:", e));
  }

  return NextResponse.json({ watch: findWatch(id) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!findWatch(id)) return NextResponse.json({ error: "일정을 찾을 수 없습니다" }, { status: 404 });

  getDb().prepare("DELETE FROM watches WHERE id = ?").run(id); // fares/alerts 는 FK cascade
  return NextResponse.json({ ok: true });
}
