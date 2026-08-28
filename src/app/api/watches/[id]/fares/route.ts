import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** 스캔 배치별 최저가 추이 (최근 30개) + 최신 배치의 요금 상세 */
export async function GET(_req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const db = getDb();

  const history = db
    .prepare(
      `SELECT fetched_at AS fetchedAt, MIN(price) AS lowest, COUNT(*) AS fareCount
       FROM fares WHERE watch_id = ?
       GROUP BY fetched_at ORDER BY fetched_at DESC LIMIT 30`,
    )
    .all(id);

  const latest = db
    .prepare(
      `SELECT airline, flight_no AS flightNo, depart_time AS departTime, arrive_time AS arriveTime, price
       FROM fares
       WHERE watch_id = ? AND fetched_at = (SELECT MAX(fetched_at) FROM fares WHERE watch_id = ?)
       ORDER BY price ASC LIMIT 10`,
    )
    .all(id, id);

  return NextResponse.json({ history, latest });
}
