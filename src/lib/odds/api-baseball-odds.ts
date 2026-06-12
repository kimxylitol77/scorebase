// API-Sports(baseball) 경기별 배당 — odds?game={id}.
// The Odds API 가 KBO 를 active=False 로 미커버 → 이미 구독 중인 api-sports baseball Pro 로 보강
// (2026-06-12 실측: KBO 북메이커 11곳 — Home/Away·Asian Handicap·Over/Under·3-way까지).
// Match.externalId 가 api-sports game id(숫자) 체계라 팀명 매칭 없이 직접 조회.
//
// ⚠️ marketHome/Draw/Away(vig 제거 implied)는 의도적으로 채우지 않는다 —
// 채우면 predict 파이프라인의 market-blend 가 KBO 에 자동 적용돼 백테스트 없이
// 적중률 시스템(현 60%, 순수 모델)이 바뀜. 블렌드 도입은 백테스트 통과 후 별도 결정.
import "server-only";
import { prisma } from "@/lib/db";

const BASE = "https://v1.baseball.api-sports.io";

interface OddsValue {
  value: string;
  odd: string;
}
interface GameOdds {
  bookmakerCount: number;
  bookmakers: { name: string; markets: { name: string; values: OddsValue[] }[] }[];
}

/** 한 경기(gameId = Match.externalId)의 북메이커별 배당. 없으면 null. */
async function fetchGameOdds(gameId: string): Promise<GameOdds | null> {
  const key = process.env.API_BASEBALL_KEY || process.env.API_FOOTBALL_KEY;
  if (!key || !/^\d+$/.test(gameId)) return null;
  try {
    const res = await fetch(`${BASE}/odds?game=${gameId}`, {
      headers: { "x-apisports-key": key },
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const j = await res.json();
    const ev = j.response?.[0];
    if (!ev?.bookmakers?.length) return null;
    return {
      bookmakerCount: ev.bookmakers.length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bookmakers: ev.bookmakers.map((b: any) => ({
        name: b.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        markets: (b.bets || []).map((bet: any) => ({ name: bet.name, values: bet.values || [] })),
      })),
    };
  } catch {
    return null;
  }
}

const avg = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);

/** 북메이커 평균 — 승패(2-way) + 무(3-way) + 핸디캡(최다 북 라인) + 오버언더(최다 북 라인). */
function parseBaseballOdds(go: GameOdds): {
  home: number;
  away: number;
  draw: number | null;
  hcLine: number | null;
  hcHome: number | null;
  hcAway: number | null;
  ouLine: number | null;
  over: number | null;
  under: number | null;
  books: number;
} | null {
  const h: number[] = [], a: number[] = [], d: number[] = [];
  // 라인 키 = 홈팀 기준 핸디 (음수 = 홈이 핸디 줌) — The Odds API spread 컨벤션과 동일
  const hc = new Map<number, { h: number[]; a: number[] }>();
  const ou = new Map<number, { o: number[]; u: number[] }>();

  for (const b of go.bookmakers) {
    for (const m of b.markets) {
      if (m.name === "Home/Away") {
        for (const v of m.values) {
          const o = parseFloat(v.odd);
          if (!Number.isFinite(o)) continue;
          if (v.value === "Home") h.push(o);
          else if (v.value === "Away") a.push(o);
        }
      } else if (m.name === "Match Winner") {
        for (const v of m.values) {
          const o = parseFloat(v.odd);
          if (v.value === "Draw" && Number.isFinite(o)) d.push(o);
        }
      } else if (m.name === "Asian Handicap") {
        for (const v of m.values) {
          const mt = /^(Home|Away)\s*([+-]?\d+(?:\.\d+)?)$/.exec(v.value);
          if (!mt) continue;
          const o = parseFloat(v.odd);
          if (!Number.isFinite(o)) continue;
          const homeLine = mt[1] === "Home" ? parseFloat(mt[2]) : -parseFloat(mt[2]);
          const e = hc.get(homeLine) ?? { h: [], a: [] };
          if (mt[1] === "Home") e.h.push(o);
          else e.a.push(o);
          hc.set(homeLine, e);
        }
      } else if (m.name === "Over/Under") {
        for (const v of m.values) {
          const mt = /^(Over|Under)\s*(\d+(?:\.\d+)?)$/.exec(v.value);
          if (!mt) continue;
          const o = parseFloat(v.odd);
          if (!Number.isFinite(o)) continue;
          const ln = parseFloat(mt[2]);
          const e = ou.get(ln) ?? { o: [], u: [] };
          if (mt[1] === "Over") e.o.push(o);
          else e.u.push(o);
          ou.set(ln, e);
        }
      }
    }
  }
  if (!h.length || !a.length) return null;

  // 핸디 메인 라인 — 양쪽 호가가 모두 있는 라인 중 북 수 최다, 동률이면 |라인| 작은 쪽
  let hcBest: { line: number; h: number; a: number } | null = null;
  let hcScore = -1;
  for (const [line, e] of hc) {
    if (!e.h.length || !e.a.length) continue;
    const score = Math.min(e.h.length, e.a.length);
    if (score > hcScore || (score === hcScore && hcBest && Math.abs(line) < Math.abs(hcBest.line))) {
      hcScore = score;
      hcBest = { line, h: avg(e.h)!, a: avg(e.a)! };
    }
  }
  // OU 메인 라인 — 북 수 최다, 동률이면 오버/언더 격차 최소(균형 라인 = 메인)
  let ouBest: { line: number; o: number; u: number } | null = null;
  let ouScore = -1;
  let ouGap = Infinity;
  for (const [line, e] of ou) {
    if (!e.o.length || !e.u.length) continue;
    const score = Math.min(e.o.length, e.u.length);
    const gap = Math.abs(avg(e.o)! - avg(e.u)!);
    if (score > ouScore || (score === ouScore && gap < ouGap)) {
      ouScore = score;
      ouGap = gap;
      ouBest = { line, o: avg(e.o)!, u: avg(e.u)! };
    }
  }

  return {
    home: avg(h)!,
    away: avg(a)!,
    draw: avg(d),
    hcLine: hcBest?.line ?? null,
    hcHome: hcBest?.h ?? null,
    hcAway: hcBest?.a ?? null,
    ouLine: ouBest?.line ?? null,
    over: ouBest?.o ?? null,
    under: ouBest?.u ?? null,
    books: go.bookmakerCount,
  };
}

/**
 * api-sports baseball odds 로 KBO 배당 보강 — 어제~+3일 SCHEDULED 중 oddsHome 없는 매치.
 * fetch-odds cron 끝에서 호출. externalId 가 숫자(api-sports game id)인 매치만.
 */
export async function backfillApiBaseballOdds(): Promise<number> {
  const ms = await prisma.match.findMany({
    where: {
      league: "KBO",
      status: "SCHEDULED",
      startTime: { gte: new Date(Date.now() - 86400000), lte: new Date(Date.now() + 3 * 86400000) },
      oddsHome: null,
    },
    select: { id: true, externalId: true },
  });
  let ok = 0;
  for (const m of ms) {
    if (!/^\d+$/.test(String(m.externalId))) continue;
    const go = await fetchGameOdds(String(m.externalId));
    if (go) {
      const o = parseBaseballOdds(go);
      if (o) {
        await prisma.match.update({
          where: { id: m.id },
          data: {
            oddsHome: o.home,
            oddsDraw: o.draw,
            oddsAway: o.away,
            oddsHcLine: o.hcLine,
            oddsHcHome: o.hcHome,
            oddsHcAway: o.hcAway,
            oddsTotalLine: o.ouLine,
            oddsOver: o.over,
            oddsUnder: o.under,
            marketBookmakers: o.books,
            marketUpdatedAt: new Date(),
            // marketHome/Draw/Away 미저장 — 파일 상단 주석 참조 (블렌드 자동 적용 방지)
          },
        });
        ok++;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return ok;
}
