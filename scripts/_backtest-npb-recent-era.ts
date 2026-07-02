// NPB 최근등판 ERA(recentEra) 블렌드 walk-forward 백테스트 (out-of-sample).
//   npx tsx --env-file=.env.local scripts/_backtest-npb-recent-era.ts
//
// KBO 에서 통과한 recentEra w=0.35 패턴을 NPB 로 검증한다.
// NPB 는 등판별 로그 소스가 없어, 우리 DB 에 경기마다 저장된 선발의
// 시즌누적 ERA·IP 스냅샷(경기 전 캡처) 차분으로 최근 3등판 ERA 를 복원한다.
//   recentEra = 9 * (ER_now - ER_3startsAgo) / (IP_now - IP_3startsAgo)
// 파이프라인은 fetch-gpt-predictions.scorebasePick 과 동일
// (buildMatchContext + 선발보정 + 시장블렌드 + home calibration).
// 가중치 w 만 스윕 — w=0 이 현행(시즌 ERA 만).

import { prisma } from "@/lib/db";
import { buildMatchContext } from "@/lib/predict/build-context";
import { blendWithMarket } from "@/lib/predict/market-blend";
import {
  calibrateHomeWinProb,
  hasHomeCalibration,
} from "@/lib/predict/home-calibration";
import type { PredictMatch } from "@/lib/predict/types";

const LEAGUE = "NPB";
const MIN_PRIOR = 5;
const WEIGHTS = [0, 0.2, 0.35, 0.5];

interface StarterJson {
  pid?: number;
  era?: number;
  whip?: number;
  k9?: number;
  ip?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJson(s: string | null): any {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** 야구 IP 표기 파싱 — "104.1" = 104⅓, "104.2" = 104⅔ */
function parseIp(ip: string | undefined): number | null {
  if (!ip) return null;
  const m = String(ip).match(/^(\d+)(?:\.([12]))?$/);
  if (!m) return null;
  return Number(m[1]) + (m[2] ? Number(m[2]) / 3 : 0);
}

// starter-adjust.ts 의 computeStarterAdjustment 1X2 부분을 가중치 파라미터화해 복제.
// (모듈 상수 RECENT_ERA_WEIGHT 가 리그 고정이라 스윕용으로 로컬 재현 — 로직 동일 유지)
function starterHomeShift(
  h: StarterJson & { recentEra?: number | null },
  a: StarterJson & { recentEra?: number | null },
  recentW: number,
): number | null {
  if (!h?.era || !a?.era) return null;
  const useRecent = recentW > 0 && h.recentEra != null && a.recentEra != null;
  const effHome = useRecent ? (1 - recentW) * h.era + recentW * h.recentEra! : h.era;
  const effAway = useRecent ? (1 - recentW) * a.era + recentW * a.recentEra! : a.era;
  const eraDiff = effAway - effHome;
  const whipDiff = h.whip != null && a.whip != null ? a.whip - h.whip : 0;
  const k9Diff = h.k9 != null && a.k9 != null ? h.k9 - a.k9 : 0;
  const raw = eraDiff * 0.05 + whipDiff * 0.15 + k9Diff * 0.01;
  return Math.max(-0.18, Math.min(0.18, raw)); // GS 정보 없음 → weight 1 (NPB JSON 에 gs 없음)
}

function applyShift(
  wp: { home: number; draw: number; away: number },
  shift: number,
): { home: number; draw: number; away: number } {
  const home = Math.max(0.02, Math.min(0.96, wp.home + shift));
  const away = Math.max(0.02, Math.min(0.96, wp.away - shift));
  const sum = home + away + wp.draw;
  return { home: home / sum, draw: wp.draw / sum, away: away / sum };
}

async function main() {
  const all = await prisma.match.findMany({
    where: { league: LEAGUE },
    select: {
      id: true, league: true, status: true, homeTeamId: true, awayTeamId: true,
      homeScore: true, awayScore: true, startTime: true,
      marketHome: true, marketDraw: true, marketAway: true, marketBookmakers: true,
      homeStarter: true, awayStarter: true,
    },
    orderBy: { startTime: "asc" },
  });
  const pool = all as unknown as PredictMatch[];
  const finished = all.filter(
    (m) => m.status === "FINISHED" && m.homeScore != null && m.awayScore != null,
  );

  // 1) 투수별 시즌누적 스냅샷 타임라인 (경기 전 캡처 → 누수 없음)
  interface Snap { t: number; er: number; ip: number }
  const snaps = new Map<number, Snap[]>();
  for (const m of finished) {
    for (const raw of [m.homeStarter, m.awayStarter]) {
      const s = parseJson(raw) as StarterJson | null;
      const ip = parseIp(s?.ip);
      if (!s?.pid || s.era == null || ip == null || ip <= 0) continue;
      const list = snaps.get(s.pid) ?? [];
      list.push({ t: m.startTime.getTime(), er: (s.era * ip) / 9, ip });
      snaps.set(s.pid, list);
    }
  }
  for (const list of snaps.values()) list.sort((x, y) => x.t - y.t);

  /** 매치 시점 스냅샷(now)과 minStarts 등판 전 스냅샷 차분 → 최근 폼 ERA. 이전 등판 부족 시 null. */
  const MIN_SNAPS = Number(process.env.MIN_SNAPS ?? 3);
  function recentEraAsOf(pid: number | undefined, t: number, nowEr: number, nowIp: number): number | null {
    if (!pid) return null;
    const list = snaps.get(pid);
    if (!list) return null;
    const prior = list.filter((s) => s.t < t);
    if (prior.length < MIN_SNAPS) return null;
    const base = prior[prior.length - Math.min(3, prior.length)];
    const dIp = nowIp - base.ip;
    if (dIp <= 0.5) return null; // 이닝 진전 없으면 무의미
    const era = (9 * (nowEr - base.er)) / dIp;
    return Math.max(0, Math.min(27, era));
  }

  // 2) walk-forward — 대상: 학습 충분 + winProb 산출 가능 매치
  interface Row {
    actual: "HOME" | "AWAY" | "DRAW";
    blendable: boolean; // 양쪽 recentEra 복원 가능
    // w별 (pick, prob)
    byW: Map<number, { pick: "HOME" | "AWAY" | "DRAW"; prob: number }>;
  }
  const rows: Row[] = [];
  let skippedPrior = 0, skippedWp = 0, skippedStarter = 0;

  for (const m of finished) {
    const t = m.startTime.getTime();
    const priorOf = (teamId: number) =>
      finished.filter(
        (p) =>
          (p.homeTeamId === teamId || p.awayTeamId === teamId) &&
          p.startTime.getTime() < t,
      ).length;
    if (Math.min(priorOf(m.homeTeamId), priorOf(m.awayTeamId)) < MIN_PRIOR) {
      skippedPrior++;
      continue;
    }
    const ctx = buildMatchContext(pool, LEAGUE, m.homeTeamId, m.awayTeamId, m.startTime);
    if (!ctx.winProb) {
      skippedWp++;
      continue;
    }

    const h = parseJson(m.homeStarter) as StarterJson | null;
    const a = parseJson(m.awayStarter) as StarterJson | null;
    const hIp = parseIp(h?.ip);
    const aIp = parseIp(a?.ip);
    const hasStarter = Boolean(h?.era && a?.era);
    if (!hasStarter) skippedStarter++;

    const hRecent =
      h?.pid && h.era != null && hIp
        ? recentEraAsOf(h.pid, t, (h.era * hIp) / 9, hIp)
        : null;
    const aRecent =
      a?.pid && a.era != null && aIp
        ? recentEraAsOf(a.pid, t, (a.era * aIp) / 9, aIp)
        : null;
    const blendable = hasStarter && hRecent != null && aRecent != null;

    const actual: "HOME" | "AWAY" | "DRAW" =
      m.homeScore! > m.awayScore! ? "HOME" : m.awayScore! > m.homeScore! ? "AWAY" : "DRAW";

    const byW = new Map<number, { pick: "HOME" | "AWAY" | "DRAW"; prob: number }>();
    for (const w of WEIGHTS) {
      let wp = ctx.winProb;
      if (hasStarter) {
        const shift = starterHomeShift(
          { ...h!, recentEra: hRecent },
          { ...a!, recentEra: aRecent },
          w,
        );
        if (shift != null) wp = applyShift(wp, shift);
      }
      if (m.marketHome != null && m.marketAway != null) {
        wp = blendWithMarket(wp, {
          home: m.marketHome,
          draw: m.marketDraw,
          away: m.marketAway,
          bookmakers: m.marketBookmakers,
        });
      }
      if (hasHomeCalibration(LEAGUE)) {
        const cal = calibrateHomeWinProb(wp.home, LEAGUE);
        wp = { home: cal, draw: 0, away: 1 - cal };
      }
      const pick: "HOME" | "AWAY" | "DRAW" =
        wp.home >= wp.away && wp.home >= wp.draw
          ? "HOME"
          : wp.away >= wp.draw
            ? "AWAY"
            : "DRAW";
      const prob = pick === "HOME" ? wp.home : pick === "AWAY" ? wp.away : wp.draw;
      byW.set(w, { pick, prob });
    }
    rows.push({ actual, blendable, byW });
  }

  // 3) 리포트
  const fmt = (x: number) => (x * 100).toFixed(1) + "%";
  const report = (label: string, list: Row[]) => {
    console.log(`\n=== ${label} (n=${list.length}) ===`);
    console.log("w      적중률    Brier    strong≥0.60(n)   HOME픽율  HOME적중  AWAY적중");
    for (const w of WEIGHTS) {
      let hit = 0, brier = 0, sN = 0, sHit = 0, homeN = 0, homeHit = 0, awayN = 0, awayHit = 0;
      for (const r of list) {
        const p = r.byW.get(w)!;
        const ok = p.pick === r.actual;
        if (ok) hit++;
        brier += (p.prob - (ok ? 1 : 0)) ** 2;
        if (p.prob >= 0.6) { sN++; if (ok) sHit++; }
        if (p.pick === "HOME") { homeN++; if (ok) homeHit++; }
        if (p.pick === "AWAY") { awayN++; if (ok) awayHit++; }
      }
      const n = list.length;
      console.log(
        `${w.toFixed(2)}   ${fmt(hit / n)}   ${(brier / n).toFixed(4)}   ` +
        `${sN ? fmt(sHit / sN) : "-"}(${sN})      ${fmt(homeN / n)}    ` +
        `${homeN ? fmt(homeHit / homeN) : "-"}   ${awayN ? fmt(awayHit / awayN) : "-"}`,
      );
    }
  };

  const draws = rows.filter((r) => r.actual === "DRAW").length;
  console.log(`대상 ${rows.length}건 (학습부족 스킵 ${skippedPrior} / winProb 불가 ${skippedWp} / 선발 없음 ${skippedStarter}) · 무승부 ${draws}건`);
  report("전체", rows);
  report("recentEra 블렌드 적용 가능 매치만 (변별 구간)", rows.filter((r) => r.blendable));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
