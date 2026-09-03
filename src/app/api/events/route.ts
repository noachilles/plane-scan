import { getEmitter, type AppEvent } from "@/lib/events";
import { getScannerStatus } from "@/lib/scanner";

export const dynamic = "force-dynamic";

/**
 * SSE 스트림 — 스캔 시작/완료, 일정 갱신, 새 알림을 브라우저에 실시간 중계한다.
 * 클라이언트는 이벤트를 받으면 필요한 목록만 다시 불러온다.
 */
export function GET(req: Request) {
  const emitter = getEmitter();
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send({ type: "status", status: getScannerStatus() });
      const onEvent = (e: AppEvent) => send(e.type === "status" ? { type: "status", status: getScannerStatus() } : e);
      emitter.on("event", onEvent);

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(": hb\n\n"));
        } catch {
          closed = true;
        }
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        emitter.off("event", onEvent);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
