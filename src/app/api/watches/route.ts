import { NextResponse } from "next/server";
import { getDb, type WatchRow } from "@/lib/db";
import { buildDeeplink } from "@/lib/deeplink";
import { scanWatchNow } from "@/lib/scanner";
import { watchInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM watches ORDER BY created_at DESC, id DESC").all() as WatchRow[];

  const lastBatch = db.prepare("SELECT MAX(fetched_at) AS t FROM fares WHERE watch_id = ?");
  // "현재 최저가"는 선택한 가는편·오는편 시간대(및 직항 조건) 안의 편만 대상으로 한다
  const inWindowLowest = db.prepare(
    `SELECT price, airline, flight_no AS flightNo, depart_time AS departTime, itinerary_ids AS itineraryIds, fare_type AS fareType, agency,
            return_depart_time AS returnDepartTime, duration_min AS durationMin, stops
     FROM fares WHERE watch_id = ? AND fetched_at = ? AND depart_time >= ? AND depart_time <= ?
       AND (return_depart_time IS NULL OR (return_depart_time >= ? AND return_depart_time <= ?))
       AND (? = 0 OR COALESCE(stops, 0) = 0)
     ORDER BY price ASC LIMIT 1`,
  );
  const anyLowest = db.prepare(
    `SELECT price, depart_time AS departTime FROM fares WHERE watch_id = ? AND fetched_at = ? ORDER BY price ASC LIMIT 1`,
  );
  const unreadOf = db.prepare("SELECT COUNT(*) AS c FROM alerts WHERE watch_id = ? AND read = 0 AND dismissed = 0");

  const watches = rows.map((w) => {
    const t = (lastBatch.get(w.id) as { t: string | null }).t;
    const lowest = t
      ? (inWindowLowest.get(
          w.id,
          t,
          w.time_from,
          w.time_to,
          w.return_time_from ?? "00:00",
          w.return_time_to ?? "23:59",
          w.direct_only,
        ) as
          | {
              price: number;
              airline: string;
              flightNo: string | null;
              departTime: string;
              itineraryIds: string | null;
              fareType: string | null;
              agency: string | null;
              returnDepartTime: string | null;
              durationMin: number | null;
              stops: number | null;
            }
          | undefined)
      : undefined;
    const overall = t ? (anyLowest.get(w.id, t) as { price: number; departTime: string } | undefined) : undefined;
    // 시간대 밖에 더 싼 편이 있으면 참고용으로만 전달
    const outsideLowest = overall && (!lowest || overall.price < lowest.price) ? overall : null;
    const unreadAlerts = (unreadOf.get(w.id) as { c: number }).c;
    return {
      ...w,
      lowestPrice: lowest?.price ?? null,
      lowestFare: lowest
        ? {
            price: lowest.price,
            airline: lowest.airline,
            flightNo: lowest.flightNo,
            departTime: lowest.departTime,
            returnDepartTime: lowest.returnDepartTime,
            durationMin: lowest.durationMin,
            stops: lowest.stops,
            // mock 요금의 여정 ID 는 가상 → 편 지정 없이 기본 검색 URL 로
            deeplink: buildDeeplink(w, lowest.agency === "mock" ? null : lowest),
          }
        : null,
      outsideLowest,
      lastScanAt: t,
      unreadAlerts,
      deeplink: buildDeeplink(w),
    };
  });

  return NextResponse.json({ watches });
}

export async function POST(req: Request) {
  const parsed = watchInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const v = parsed.data;

  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO watches (origin, destination, depart_date, return_date, time_from, time_to, max_price, return_time_from, return_time_to, direct_only)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      v.origin,
      v.destination,
      v.departDate,
      v.returnDate ?? null,
      v.timeFrom,
      v.timeTo,
      v.maxPrice,
      v.returnDate ? (v.returnTimeFrom ?? "00:00") : null,
      v.returnDate ? (v.returnTimeTo ?? "23:59") : null,
      v.directOnly ? 1 : 0,
    );
  const id = Number(info.lastInsertRowid);

  // 즐겨찾기 노선 사용 횟수 반영
  db.prepare("UPDATE favorite_routes SET use_count = use_count + 1 WHERE origin = ? AND destination = ?").run(
    v.origin,
    v.destination,
  );

  // 등록 즉시 자동 검색 (직전 quote 캐시가 있으면 재사용) — 응답은 기다리지 않고 SSE 로 갱신
  scanWatchNow(id, "created").catch((e) => console.warn("[scanner] created scan failed:", e));

  const watch = db.prepare("SELECT * FROM watches WHERE id = ?").get(id) as WatchRow;
  return NextResponse.json({ watch }, { status: 201 });
}
