// KST 날짜 유틸 — Threads 큐(/api/internal/threads-queue)와 이미지(/api/og/daily)가
// 정확히 같은 하루 경계·날짜 키를 쓰도록 단일화. 불일치 시 dedup/이미지가 어긋난다.

export function kstDayWindow(d?: string | null): {
  start: Date;
  end: Date;
  dateKey: string; // "YYYY-MM-DD"
  label: string; // "5월 30일 (금)"
} {
  const KST = 9 * 3600 * 1000;
  let y: number, m: number, day: number;
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    [y, m, day] = d.split("-").map(Number);
  } else {
    const n = new Date(Date.now() + KST);
    y = n.getUTCFullYear();
    m = n.getUTCMonth() + 1;
    day = n.getUTCDate();
  }
  const start = new Date(Date.UTC(y, m - 1, day) - KST);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  const dateKey = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const label = `${m}월 ${day}일 (${WD[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]})`;
  return { start, end, dateKey, label };
}

export function kstHHmm(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

// 현재 KST 시각(0~23). 큐의 발행 시간대 판단용.
export function kstHour(): number {
  return new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
}
