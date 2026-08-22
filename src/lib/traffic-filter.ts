// 트래픽 집계의 단일 기준 — 봇·위장 스크레이퍼 판정과 동시 접속 계산을 한곳에 모은다.
//
// 왜 공용인가. 같은 PageView 를 admin/stats 는 자기 규칙으로, 세션 안의 에이전트는 또
// 다른 규칙으로 세면 화면 숫자와 보고가 어긋난다(2026-08-22 실측: 8/22 방문자가 407·298·293
// 세 갈래). 이 파일 밖에서 트래픽 지표를 새로 정의하지 말 것 — 여기 함수만 쓴다.
import { detectBot } from "@/lib/bot-detect";

export interface TrafficRow {
  ts: Date;
  sessionId: string | null;
  userAgent: string | null;
  path?: string;
}
export interface LandingRow {
  sessionId: string | null;
  userAgent: string | null;
  path: string;
  referrer: string | null;
  utmSource: string | null;
}

/** UA 패턴으로 자기 정체를 밝히는 봇 제외 (구글봇·빙봇 등). */
export function filterHumans<T extends { userAgent: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !detectBot(r.userAgent).isBot);
}

const ENTRY_PATHS = new Set(["/", "/scores", "/landing"]);
const isDesktopLinuxUa = (ua: string | null) => /X11; Linux/.test(ua ?? "");

/**
 * 위장 스크레이퍼 세션 — 사람 UA 를 쓰지만 사람이 아닌 것들. 세 규칙의 합집합이다.
 * 셋이 잡는 대상이 서로 다르다(2026-08-22 실측: A+B 297세션 · C 327세션 · 겹침 160).
 *
 *  A. 랜딩 referrer·utm 없음 + 기간 내 PV 1건 + 진입 페이지가 아닌 상세 랜딩.
 *     매 요청 localStorage 를 지워 sessionId 가 1PV 로만 남는 크롤러(2026-07-05 실측).
 *  B. 데스크톱 리눅스 UA. 한국향 소비자 트래픽에 사실상 없고, 2026-07-22 에 이 UA 의
 *     "구글 유입" 랜딩 33건이 GSC 노출 0인 페이지였다 = referrer 위조.
 *     (안드로이드는 "Linux; Android" 라 X11 로 걸리지 않는다.)
 *  C. UA 단위로 세션당 PV 가 1.0 인 집단. 사람 집단은 세션당 3~11 이 나오므로 UA 하나가
 *     통째로 1.0 이면 브라우저 상태를 유지하지 않는 자동화다(2026-08-22 실측: 평범한
 *     Chrome UA 로 84세션·85PV 를 낸 헤드리스가 A·B 를 모두 통과해 피크를 29명으로 부풀림).
 *     표본이 얕으면 우연히 1.0 이 나오므로 세션 15개 이상만 본다.
 */
export function suspiciousSessionIds(humans: TrafficRow[], landings: LandingRow[]): Set<string> {
  const sus = new Set<string>();
  const pvBySid = new Map<string, number>();
  for (const r of humans) {
    if (r.sessionId) pvBySid.set(r.sessionId, (pvBySid.get(r.sessionId) ?? 0) + 1);
  }
  // A
  for (const l of landings) {
    if (!l.sessionId || l.referrer || l.utmSource) continue;
    if (detectBot(l.userAgent).isBot) continue;
    if (pvBySid.get(l.sessionId) !== 1) continue;
    if (ENTRY_PATHS.has(l.path.split("?")[0])) continue;
    sus.add(l.sessionId);
  }
  // B
  for (const r of humans) if (r.sessionId && isDesktopLinuxUa(r.userAgent)) sus.add(r.sessionId);
  for (const l of landings) if (l.sessionId && isDesktopLinuxUa(l.userAgent)) sus.add(l.sessionId);
  // C
  const byUa = new Map<string, { pv: number; sessions: Set<string> }>();
  for (const r of humans) {
    if (!r.sessionId) continue;
    const key = r.userAgent ?? "";
    const e = byUa.get(key) ?? { pv: 0, sessions: new Set<string>() };
    e.pv++;
    e.sessions.add(r.sessionId);
    byUa.set(key, e);
  }
  for (const [, e] of byUa) {
    if (e.sessions.size >= 15 && e.pv / e.sessions.size < 1.05) {
      for (const s of e.sessions) sus.add(s);
    }
  }
  return sus;
}

/** 봇·위장 스크레이퍼를 모두 뺀 사람 PV. 트래픽 지표는 전부 이걸 기준으로 센다. */
export function cleanHumanRows<T extends TrafficRow>(rows: T[], landings: LandingRow[]): T[] {
  const humans = filterHumans(rows);
  const sus = suspiciousSessionIds(humans, landings);
  return humans.filter((r) => !r.sessionId || !sus.has(r.sessionId));
}

export interface ConcurrentBucket {
  /** 버킷 시작 시각 (UTC ms) */
  t: number;
  /** 그 창 안의 고유 세션 수 */
  n: number;
}
export interface ConcurrentSeries {
  bucketMinutes: number;
  buckets: ConcurrentBucket[];
  peak: number;
  peakAt: Date | null;
  /** 빈 시간대를 0 으로 포함한 평균 */
  avg: number;
  median: number;
  p95: number;
}

/**
 * 동시 접속자 — 고정 창 안의 고유 세션 수. GA 의 "활성 사용자"와 같은 정의다.
 * heartbeat(ActivePresence)는 현재만 담고 이력이 없어, 과거 구간은 PV 로 근사할 수밖에 없다.
 */
export function concurrentSeries(
  rows: TrafficRow[],
  from: Date,
  to: Date,
  bucketMinutes = 5,
): ConcurrentSeries {
  const ms = bucketMinutes * 60_000;
  const first = Math.floor(from.getTime() / ms);
  const last = Math.floor(to.getTime() / ms);
  const sets = new Map<number, Set<string>>();
  for (const r of rows) {
    if (!r.sessionId) continue;
    const k = Math.floor(r.ts.getTime() / ms);
    if (k < first || k > last) continue;
    if (!sets.has(k)) sets.set(k, new Set());
    sets.get(k)!.add(r.sessionId);
  }
  // 빈 버킷을 0 으로 채운다 — 평균이 "활동한 시간만의 평균"으로 부풀지 않게.
  const buckets: ConcurrentBucket[] = [];
  for (let k = first; k <= last; k++) buckets.push({ t: k * ms, n: sets.get(k)?.size ?? 0 });
  const vals = buckets.map((b) => b.n);
  const sorted = [...vals].sort((a, b) => a - b);
  const peak = sorted.length ? sorted[sorted.length - 1] : 0;
  const peakBucket = buckets.find((b) => b.n === peak && peak > 0) ?? null;
  const q = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
  return {
    bucketMinutes,
    buckets,
    peak,
    peakAt: peakBucket ? new Date(peakBucket.t) : null,
    avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
    median: q(0.5),
    p95: q(0.95),
  };
}

/**
 * 일자별(KST) 피크·평균 — 동시 접속 표용.
 * partial=true 는 창 경계에 걸려 하루가 다 안 담긴 날. 그 날의 평균은 남은 시간대만의
 * 평균이라 다른 날과 나란히 두면 오해를 부른다(창 첫날이 야간만 담기면 평균이 3배로 뜬다).
 */
export function concurrentByDay(series: ConcurrentSeries): Array<{ day: string; peak: number; peakAt: string; avg: number; partial: boolean }> {
  const perDay = new Map<string, { peak: number; peakAt: string; sum: number; n: number }>();
  for (const b of series.buckets) {
    const kst = new Date(b.t + 9 * 3_600_000);
    const day = kst.toISOString().slice(0, 10);
    const e = perDay.get(day) ?? { peak: 0, peakAt: "", sum: 0, n: 0 };
    if (b.n > e.peak) {
      e.peak = b.n;
      e.peakAt = kst.toISOString().slice(11, 16);
    }
    e.sum += b.n;
    e.n++;
    perDay.set(day, e);
  }
  const full = (24 * 60) / series.bucketMinutes;
  return [...perDay]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, e]) => ({
      day,
      peak: e.peak,
      peakAt: e.peakAt,
      avg: e.n ? e.sum / e.n : 0,
      partial: e.n < full,
    }));
}
