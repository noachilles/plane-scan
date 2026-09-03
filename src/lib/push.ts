import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { getDb, type PushSubscriptionRow } from "./db";

/**
 * Web Push — 탭을 닫아도 OS 알림이 도착하도록 서비스워커 구독에 직접 발송한다.
 * VAPID 키는 첫 실행 시 자동 생성해 data/vapid.json 에 보관한다 (git 제외).
 */

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

const g = globalThis as unknown as { __planeScanVapid?: VapidKeys };

function loadVapid(): VapidKeys {
  if (g.__planeScanVapid) return g.__planeScanVapid;

  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, "vapid.json");

  let keys: VapidKeys;
  if (fs.existsSync(file)) {
    keys = JSON.parse(fs.readFileSync(file, "utf8")) as VapidKeys;
  } else {
    keys = webpush.generateVAPIDKeys();
    fs.writeFileSync(file, JSON.stringify(keys, null, 2));
    console.log("[push] VAPID 키 생성 → data/vapid.json");
  }
  webpush.setVapidDetails("mailto:plane-scan@localhost", keys.publicKey, keys.privateKey);
  g.__planeScanVapid = keys;
  return keys;
}

export function getVapidPublicKey(): string {
  return loadVapid().publicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; removed: number }> {
  loadVapid();
  const db = getDb();
  const subs = db.prepare("SELECT * FROM push_subscriptions").all() as PushSubscriptionRow[];
  let sent = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 },
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(s.id);
          removed++;
        } else {
          console.warn(`[push] 발송 실패 (${status ?? "?"}):`, (e as Error).message);
        }
      }
    }),
  );

  return { sent, removed };
}
