import { EventEmitter } from "node:events";

/**
 * 서버 내부 이벤트 버스 — 스캔 엔진이 발행하고 SSE(/api/events)가 브라우저로 중계한다.
 */

export type AppEvent =
  | { type: "status" }
  | { type: "scan:start"; reason: string; watchIds: number[] }
  | { type: "scan:done"; reason: string; scanned: number; alerts: number; errors: number }
  | { type: "watch:scanning"; watchId: number; scanning: boolean }
  | { type: "watch:updated"; watchId: number }
  | { type: "alert:new"; alertId: number; watchId: number; message: string; price: number }
  | { type: "alert:updated"; watchId: number };

const g = globalThis as unknown as { __planeScanEvents?: EventEmitter };

export function getEmitter(): EventEmitter {
  if (!g.__planeScanEvents) {
    g.__planeScanEvents = new EventEmitter();
    g.__planeScanEvents.setMaxListeners(200);
  }
  return g.__planeScanEvents;
}

export function emitEvent(e: AppEvent): void {
  getEmitter().emit("event", e);
}
