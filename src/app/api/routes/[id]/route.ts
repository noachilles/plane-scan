import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, type FavoriteRouteRow } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({ label: z.string().trim().max(30).nullable() });

export async function PATCH(req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "label 이 필요합니다" }, { status: 400 });

  const db = getDb();
  const info = db.prepare("UPDATE favorite_routes SET label = ? WHERE id = ?").run(parsed.data.label || null, id);
  if (info.changes === 0) return NextResponse.json({ error: "노선을 찾을 수 없습니다" }, { status: 404 });

  return NextResponse.json({ route: db.prepare("SELECT * FROM favorite_routes WHERE id = ?").get(id) as FavoriteRouteRow });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const info = getDb().prepare("DELETE FROM favorite_routes WHERE id = ?").run(id);
  if (info.changes === 0) return NextResponse.json({ error: "노선을 찾을 수 없습니다" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
