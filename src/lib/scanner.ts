import { getDb, type AlertRow, type WatchRow } from "./db";
import { buildDeeplink } from "./deeplink";
import { emitEvent } from "./events";
import { sendPushToAll } from "./push";
import { getSource, searchWithCache, SourceError, type BookingLink, type Fare } from "./sources";

/**
 * 스캔 엔진 — 활성 감시(여행 일정)마다 소스를 조회해 요금 스냅샷을 남기고,
 * 시간대·목표가 조건에 맞는 요금이 나오면 알림을 만든 뒤 SSE·Web Push 로 알린다.
 *
 * - 주기 루프(startScanLoop): 서버 부팅 시 자동 기동, SCAN_INTERVAL_MIN 마다 전체 스캔
 * - 단건 즉시 스캔(scanWatchNow): 일정 등록/편집 직후 호출 — 최근 quote 캐시가 있으면 재사용
 */

interface ScannerState {
  loopStarted: boolean;
  intervalMin: number;
  lastScanAt: string | null;
  nextScanAt: string | null;
  loopBusy: boolean;
  scanningWatchIds: Set<number>;
  lastError: string | null;
  loop?: ReturnType<typeof setInterval>;
}

const g = globalThis as unknown as { __planeScanState?: ScannerState };

function state(): ScannerState {
  if (!g.__planeScanState) {
    g.__planeScanState = {
      loopStarted: false,
      intervalMin: Math.max(1, Number(process.env.SCAN_INTERVAL_MIN ?? 5)),
      lastScanAt: null,
      nextScanAt: null,
      loopBusy: false,
      scanningWatchIds: new Set(),
      lastError: null,
    };
  }
  return g.__planeScanState;
}

export interface ScannerStatus {
  loopStarted: boolean;
  intervalMin: number;
  lastScanAt: string | null;
  nextScanAt: string | null;
  scanning: boolean;
  scanningWatchIds: number[];
  lastError: string | null;
  source: string;
}

export function getScannerStatus(): ScannerStatus {
  const s = state();
  return {
    loopStarted: s.loopStarted,
    intervalMin: s.intervalMin,
    lastScanAt: s.lastScanAt,
    nextScanAt: s.nextScanAt,
    scanning: s.loopBusy || s.scanningWatchIds.size > 0,
    scanningWatchIds: [...s.scanningWatchIds],
    lastError: s.lastError,
    source: getSource().name,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function matches(w: WatchRow, f: Fare): boolean {
  if (f.departTime < w.time_from || f.departTime > w.time_to || f.price > w.max_price) return false;
  if (w.direct_only === 1 && (f.stops ?? 0) > 0) return false;
  // 왕복이면 오는편 출발 시간대도 지켜야 한다 (시각 정보가 없는 요금은 통과)
  if (w.return_date && f.returnDepartTime) {
    const rtf = w.return_time_from ?? "00:00";
    const rtt = w.return_time_to ?? "23:59";
    if (f.returnDepartTime < rtf || f.returnDepartTime > rtt) return false;
  }
  return true;
}

interface ScanOneResult {
  ok: boolean;
  alert?: AlertRow;
  error?: string;
  nonRetryable?: boolean;
}

async function scanOne(w: WatchRow, opts: { reason: string; useCacheMs?: number }): Promise<ScanOneResult> {
  const s = state();
  if (s.scanningWatchIds.has(w.id)) return { ok: false, error: "이미 스캔 중" };
  s.scanningWatchIds.add(w.id);
  emitEvent({ type: "watch:scanning", watchId: w.id, scanning: true });

  try {
    let fares: Fare[];
    let cached = false;
    try {
      ({ fares, cached } = await searchWithCache(
        {
          origin: w.origin,
          destination: w.destination,
          departDate: w.depart_date,
          returnDate: w.return_date,
          timeFrom: w.time_from,
          timeTo: w.time_to,
          returnTimeFrom: w.return_time_from ?? undefined,
          returnTimeTo: w.return_time_to ?? undefined,
          directOnly: w.direct_only === 1,
        },
        opts.useCacheMs ?? 0,
      ));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[scanner] watch#${w.id} 조회 실패: ${msg}`);
      s.lastError = msg;
      return { ok: false, error: msg, nonRetryable: e instanceof SourceError && !e.retryable };
    }

    const db = getDb();
    if (fares.length > 0) {
      // 같은 배치의 스냅샷은 fetched_at 을 공유 → "최신 스캔" 조회가 정확해진다
      const batchTime = new Date().toISOString();
      const insertFare = db.prepare(
        `INSERT INTO fares (watch_id, airline, flight_no, depart_time, arrive_time, price, agency, fetched_at, itinerary_ids, fare_type, return_depart_time, duration_min, stops)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      db.transaction(() => {
        for (const f of fares) {
          insertFare.run(
            w.id,
            f.airline,
            f.flightNo ?? null,
            f.departTime,
            f.arriveTime ?? null,
            f.price,
            f.agency ?? null,
            batchTime,
            f.itineraryIds ?? null,
            f.fareType ?? null,
            f.returnDepartTime ?? null,
            f.durationMin ?? null,
            f.stops ?? null,
          );
        }
      })();
    }
    console.log(`[scanner] watch#${w.id} ${w.origin}→${w.destination} ${fares.length}건 (${opts.reason}${cached ? ", cache" : ""})`);
    emitEvent({ type: "watch:updated", watchId: w.id });

    // 기존 알림의 특가가 아직 살아있는지 검사 — 사라졌으면 expired 처리해 헛걸음을 막는다
    if (fares.length > 0) {
      const openAlerts = db.prepare("SELECT * FROM alerts WHERE watch_id = ? AND expired = 0").all(w.id) as AlertRow[];
      const now = new Date().toISOString();
      let anyExpired = false;
      for (const a of openAlerts) {
        const sameFlight = (f: Fare) =>
          a.itinerary_ids ? f.itineraryIds === a.itinerary_ids : f.airline === a.airline && f.departTime === a.depart_time;
        const current = fares.filter(sameFlight).sort((x, y) => x.price - y.price)[0];
        const latestPrice = current?.price ?? null;
        if (current && current.price <= a.price) {
          // 살아있으면 여정 ID·딥링크도 최신 스냅샷으로 갱신 (오래된 ID 로 빈 상세를 여는 일 방지)
          db.prepare(
            "UPDATE alerts SET verified_at = ?, latest_price = ?, itinerary_ids = ?, fare_type = ?, deeplink = ? WHERE id = ?",
          ).run(
            now,
            latestPrice,
            current.itineraryIds ?? a.itinerary_ids,
            current.fareType ?? a.fare_type,
            buildDeeplink(w, getSource().name === "mock" ? null : current),
            a.id,
          );
        } else {
          db.prepare("UPDATE alerts SET expired = 1, verified_at = ?, latest_price = ? WHERE id = ?").run(now, latestPrice, a.id);
          anyExpired = true;
          console.log(`[scanner] alert#${a.id} 특가 종료 — ${a.price.toLocaleString("ko-KR")}원 → ${latestPrice ? latestPrice.toLocaleString("ko-KR") + "원" : "편 없음"}`);
        }
      }
      if (anyExpired) emitEvent({ type: "alert:updated", watchId: w.id });
    }

    const hit = fares.filter((f) => matches(w, f)).sort((a, b) => a.price - b.price)[0];
    if (!hit) return { ok: true };

    // 중복 방지: 아직 유효한(expired 아님) 알림의 최저가보다 싸야 재알림 —
    // 사라진 특가 가격이 기준을 점유해 다음 알림을 막지 않도록 한다
    const bestAlerted = db
      .prepare("SELECT MIN(price) AS p FROM alerts WHERE watch_id = ? AND expired = 0")
      .get(w.id) as { p: number | null };
    if (bestAlerted.p !== null && hit.price >= bestAlerted.p) return { ok: true };

    const sourceIsMock = getSource().name === "mock";
    const tripLabel = w.return_date ? "왕복" : "편도";
    const extras = [
      hit.stops !== undefined ? (hit.stops === 0 ? "직항" : `경유 ${hit.stops}회`) : null,
      hit.durationMin ? `${Math.floor(hit.durationMin / 60)}시간 ${hit.durationMin % 60}분` : null,
    ]
      .filter(Boolean)
      .join("·");
    const message =
      `${w.origin}→${w.destination} ${w.depart_date} ${hit.departTime} 출발` +
      (hit.returnDepartTime ? ` · 귀가 ${hit.returnDepartTime}` : "") +
      ` ${hit.airline}${hit.flightNo ? ` ${hit.flightNo}` : ""} ${tripLabel}${extras ? `(${extras})` : ""} ` +
      `${hit.price.toLocaleString("ko-KR")}원 — 목표가 ${w.max_price.toLocaleString("ko-KR")}원 달성`;
    // mock 의 여정 ID 는 가상이라 selectedFlight 를 붙이면 네이버 상세가 빈 화면이 된다 → 기본 검색 URL 만
    const deeplink = buildDeeplink(w, sourceIsMock ? null : hit);

    // 판매처(OTA) 실예매 링크 — 지원 소스만, 실패해도 알림은 그대로 진행
    let booking: BookingLink | null = null;
    const src = getSource();
    if (!sourceIsMock && src.getBookingLink && hit.itineraryIds) {
      try {
        booking = await src.getBookingLink(
          { origin: w.origin, destination: w.destination, departDate: w.depart_date, returnDate: w.return_date },
          hit.itineraryIds,
        );
        if (booking) console.log(`[scanner] booking link 확보 — ${booking.partner} ${booking.price.toLocaleString("ko-KR")}원`);
      } catch (e) {
        console.warn("[scanner] booking link 조회 실패:", e instanceof Error ? e.message : e);
      }
    }

    const sourceName = src.name;
    const info = db
      .prepare(
        `INSERT INTO alerts (watch_id, price, airline, depart_time, deeplink, message, flight_no, arrive_time, agency, itinerary_ids, fare_type, verified_at, latest_price, source, booking_url, booking_partner, return_depart_time, duration_min, stops)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        w.id,
        hit.price,
        hit.airline,
        hit.departTime,
        deeplink,
        message,
        hit.flightNo ?? null,
        hit.arriveTime ?? null,
        hit.agency ?? null,
        hit.itineraryIds ?? null,
        hit.fareType ?? null,
        new Date().toISOString(),
        hit.price,
        sourceName,
        booking?.url ?? null,
        booking?.partner ?? null,
        hit.returnDepartTime ?? null,
        hit.durationMin ?? null,
        hit.stops ?? null,
      );
    const alert = db.prepare("SELECT * FROM alerts WHERE id = ?").get(info.lastInsertRowid) as AlertRow;

    console.log(`[scanner] ALERT watch#${w.id}: ${message}`);
    emitEvent({ type: "alert:new", alertId: alert.id, watchId: w.id, message, price: hit.price });
    sendPushToAll({
      title: `${sourceName === "mock" ? "[테스트] " : ""}✈️ ${w.origin}→${w.destination} ${hit.price.toLocaleString("ko-KR")}원`,
      body: message,
      url: deeplink,
      tag: `alert-${alert.id}`,
    }).catch((e) => console.warn("[push] 발송 오류:", e));

    return { ok: true, alert };
  } finally {
    s.scanningWatchIds.delete(w.id);
    emitEvent({ type: "watch:scanning", watchId: w.id, scanning: false });
  }
}

export interface ScanResult {
  scannedWatches: number;
  newAlerts: number;
  errors: string[];
}

/** 활성 일정 전체 스캔 (주기 루프·수동 버튼) */
export async function runScan(reason: string): Promise<ScanResult> {
  const s = state();
  const result: ScanResult = { scannedWatches: 0, newAlerts: 0, errors: [] };

  if (s.loopBusy) {
    result.errors.push("이미 스캔이 진행 중");
    return result;
  }
  s.loopBusy = true;
  const delayMs = Number(process.env.SCAN_DELAY_MS ?? 2500);

  try {
    // 출발일이 지난 일정은 실크롤링 대상에서 제외 (요청 낭비·오류 방지)
    const watches = getDb()
      .prepare("SELECT * FROM watches WHERE active = 1 AND depart_date >= date('now', 'localtime')")
      .all() as WatchRow[];
    console.log(`[scanner] scan start (${reason}) — source=${getSource().name}, watches=${watches.length}`);
    emitEvent({ type: "scan:start", reason, watchIds: watches.map((w) => w.id) });

    for (const [i, w] of watches.entries()) {
      if (i > 0) await sleep(delayMs); // 소스에 대한 정중한 간격
      const r = await scanOne(w, { reason });
      if (r.ok) {
        result.scannedWatches++;
        if (r.alert) result.newAlerts++;
      } else if (r.error) {
        result.errors.push(`watch#${w.id} ${w.origin}→${w.destination}: ${r.error}`);
        // 차단 등 재시도 불가 오류면 이번 사이클 전체 중단 (다음 주기에 재시도)
        if (r.nonRetryable) break;
      }
    }
  } finally {
    s.loopBusy = false;
    s.lastScanAt = new Date().toISOString();
    if (s.loopStarted) s.nextScanAt = new Date(Date.now() + s.intervalMin * 60_000).toISOString();
    if (result.errors.length === 0) s.lastError = null;
  }

  console.log(
    `[scanner] scan done — scanned=${result.scannedWatches}, alerts=${result.newAlerts}, errors=${result.errors.length}`,
  );
  emitEvent({
    type: "scan:done",
    reason,
    scanned: result.scannedWatches,
    alerts: result.newAlerts,
    errors: result.errors.length,
  });
  return result;
}

/** 일정 한 건 즉시 스캔 — 등록/편집 직후. 최근 quote 캐시(useCacheMs 이내)가 있으면 재사용 */
export async function scanWatchNow(watchId: number, reason: string, useCacheMs = 10 * 60_000): Promise<ScanOneResult> {
  const w = getDb()
    .prepare("SELECT * FROM watches WHERE id = ? AND active = 1 AND depart_date >= date('now', 'localtime')")
    .get(watchId) as WatchRow | undefined;
  if (!w) return { ok: false, error: "활성 일정이 아님" };
  return scanOne(w, { reason, useCacheMs });
}

export function startScanLoop(): void {
  const s = state();
  if (s.loop) return; // dev HMR 중복 기동 방지

  s.loopStarted = true;
  console.log(`[scanner] loop start — every ${s.intervalMin}min, source=${getSource().name}`);

  s.loop = setInterval(() => {
    runScan("interval").catch((e) => console.error("[scanner] scan failed:", e));
  }, s.intervalMin * 60_000);

  // 부팅 10초 후 첫 스캔
  s.nextScanAt = new Date(Date.now() + 10_000).toISOString();
  setTimeout(() => {
    runScan("boot").catch((e) => console.error("[scanner] boot scan failed:", e));
  }, 10_000);
}
