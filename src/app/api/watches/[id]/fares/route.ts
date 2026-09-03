import { NextResponse } from "next/server";
import { getDb, type WatchRow } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 가격 히스토리 — 추이는 선택한 출발 시간대 안의 편만 집계하고,
 * 최신 배치 요금에는 시간대 안/밖 여부(inWindow)를 표시한다.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const db = getDb();

  const w = db.prepare("SELECT * FROM watches WHERE id = ?").get(id) as WatchRow | undefined;
  if (!w) return NextResponse.json({ error: "일정을 찾을 수 없습니다" }, { status: 404 });

  const rtf = w.return_time_from ?? "00:00";
  const rtt = w.return_time_to ?? "23:59";
  const inWindowCond = `depart_time >= ? AND depart_time <= ?
       AND (return_depart_time IS NULL OR (return_depart_time >= ? AND return_depart_time <= ?))
       AND (? = 0 OR COALESCE(stops, 0) = 0)`;

  const history = db
    .prepare(
      `SELECT fetched_at AS fetchedAt, MIN(price) AS lowest, COUNT(*) AS fareCount
       FROM fares WHERE watch_id = ? AND ${inWindowCond}
       GROUP BY fetched_at ORDER BY fetched_at DESC LIMIT 30`,
    )
    .all(id, w.time_from, w.time_to, rtf, rtt, w.direct_only);

  const latest = db
    .prepare(
      `SELECT airline, flight_no AS flightNo, depart_time AS departTime, arrive_time AS arriveTime, price,
              CASE WHEN ${inWindowCond} THEN 1 ELSE 0 END AS inWindow
       FROM fares
       WHERE watch_id = ? AND fetched_at = (SELECT MAX(fetched_at) FROM fares WHERE watch_id = ?)
       ORDER BY inWindow DESC, price ASC LIMIT 10`,
    )
    .all(w.time_from, w.time_to, rtf, rtt, w.direct_only, id, id);

  return NextResponse.json({ history, latest, timeFrom: w.time_from, timeTo: w.time_to });
}
