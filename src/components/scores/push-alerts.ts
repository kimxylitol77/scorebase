// 웹 푸시 킥오프 알림 클라이언트 헬퍼 — 구독·해제·별표 경기 동기화.
// 별표(scorebase:fav-matches)가 알림 대상. 서버가 SCHEDULED·미래만 필터하므로 전체 집합을 보낸다.
"use client";

const ENABLED_KEY = "scorebase:push-alerts"; // "1" = 사용자가 벨 켬
const SW_PATH = "/push-sw.js";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isPushEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1" && Notification.permission === "granted";
  } catch {
    return false;
  }
}

function readFavMatchIds(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem("scorebase:fav-matches") ?? "[]");
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

async function getSubscription(create: boolean): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.register(SW_PATH);
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing || !create) return existing;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return null; // env 미등록 배포 가드 — 벨은 숨겨지지만 호출돼도 조용히 실패
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    // TS lib 의 BufferSource 가 ArrayBuffer 고정이라 명시 캐스팅 (런타임은 Uint8Array 정상 수용)
    applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
  });
}

/** 벨 ON — 권한 요청 → 구독 → 별표 경기 동기화. 성공 여부 반환. */
export async function enablePushAlerts(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return false;
  const sub = await getSubscription(true);
  if (!sub) return false;
  const ok = await syncSubscription(sub);
  if (ok) {
    try {
      localStorage.setItem(ENABLED_KEY, "1");
    } catch {}
  }
  return ok;
}

/** 벨 OFF — 서버 구독 삭제 + 브라우저 구독 해지. */
export async function disablePushAlerts(): Promise<void> {
  try {
    localStorage.removeItem(ENABLED_KEY);
  } catch {}
  if (!isPushSupported()) return;
  const sub = await getSubscription(false);
  if (!sub) return;
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

async function syncSubscription(sub: PushSubscription): Promise<boolean> {
  const json = sub.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: json.keys,
      matchIds: readFavMatchIds(),
    }),
  }).catch(() => null);
  return !!res?.ok;
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** 별표 변경 시 호출(디바운스) — 벨이 켜져 있을 때만 서버 재동기화. */
export function schedulePushSync(): void {
  if (!isPushSupported() || !isPushEnabled()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    syncTimer = null;
    const sub = await getSubscription(false).catch(() => null);
    if (sub) void syncSubscription(sub);
  }, 1500);
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
