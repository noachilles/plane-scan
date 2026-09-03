import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { pushSubscriptionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** 브라우저 푸시 구독 저장 (같은 endpoint 면 갱신) */
export async function POST(req: Request) {
  const parsed = pushSubscriptionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "구독 정보가 올바르지 않습니다" }, { status: 400 });
  const s = parsed.data;

  getDb()
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    )
    .run(s.endpoint, s.keys.p256dh, s.keys.auth);

  return NextResponse.json({ ok: true }, { status: 201 });
}

const delSchema = z.object({ endpoint: z.string().url() });

export async function DELETE(req: Request) {
  const parsed = delSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "endpoint 가 필요합니다" }, { status: 400 });
  getDb().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
