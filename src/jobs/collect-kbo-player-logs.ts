// KBO 경기별 선수 로그 수집 — koreabaseball.com Daily.aspx 를 선수 중심으로 훑어 KboPlayerGameLog 적재.
// 공식 API 가 없어 스크래핑이 정본. 시즌 인덱스(팀별 POST ×10 ×투/타) → 선수별 Daily → 멱등 insert.
// 멱등 id = "kbo:{role}:{kboId}:{season}:{MM.DD}:{seq}" 라 매일 시즌 전체를 다시 훑어도 안전.
// cron: /api/cron/kbo-player-logs (일일, 전날 KBO 종료 경기 있을 때만). 과거 시즌은 season 옵션 백필.
import "@/lib/env";
import { prisma } from "@/lib/db";
import {
  fetchKboPitcherIndex,
  fetchKboHitterIndex,
  fetchKboPitcherDailySeason,
  fetchKboHitterDailySeason,
} from "@/lib/sports/kbo-official";

const FETCH_CONCURRENCY = 4;

// koreabaseball 예절 스로틀 — 전역 100ms 간격 (선수 ~570명 × 1~2요청).
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 100;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (idx < items.length) {
        const i = idx++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

interface GameLogRow {
  id: string; kboId: string; role: string; season: number; date: Date; seq: number;
  name: string | null; team: string | null; opponent: string;
  roleDetail: string | null; result: string | null; ip: string | null; tbf: number | null;
  er: number | null; gameEra: number | null; cumEra: number | null;
  pa: number | null; ab: number | null; d2b: number | null; d3b: number | null;
  rbi: number | null; sb: number | null; gameAvg: number | null; cumAvg: number | null;
  h: number | null; hr: number | null; bb: number | null; so: number | null; r: number | null;
}

/** "03.28" + season → UTC DATE. 파싱 불가 행은 null (표 잡행 방어). */
function toDate(season: number, mmdd: string): Date | null {
  const m = mmdd.match(/^(\d{2})\.(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(season, Number(m[1]) - 1, Number(m[2])));
}

export async function runCollectKboPlayerLogs({ season }: { season?: number } = {}) {
  const y = season ?? new Date().getFullYear();
  const seasonStr = String(y);

  // 1) 시즌 등재 선수 인덱스 (투수·타자, 10팀 POST 순회)
  const [pitchers, hitters] = await Promise.all([
    fetchKboPitcherIndex(seasonStr),
    fetchKboHitterIndex(seasonStr),
  ]);

  // 2) 선수별 Daily → 로그 행 (더블헤더는 같은 날짜 순번 seq 로 구분)
  const pitcherRows = await mapPool(pitchers, FETCH_CONCURRENCY, async (p) => {
    await throttle();
    const games = await fetchKboPitcherDailySeason(p.kboId, seasonStr);
    const rows: GameLogRow[] = [];
    const dateCount = new Map<string, number>();
    for (const g of games) {
      const date = toDate(y, g.date);
      if (!date) continue;
      const seq = dateCount.get(g.date) ?? 0;
      dateCount.set(g.date, seq + 1);
      rows.push({
        id: `kbo:P:${p.kboId}:${y}:${g.date}:${seq}`,
        kboId: p.kboId, role: "P", season: y, date, seq,
        name: p.name ?? null, team: p.team ?? null, opponent: g.opponent,
        roleDetail: g.role ?? null, result: g.result ?? null, ip: g.ip ?? null,
        tbf: g.tbf ?? null, er: g.er ?? null, gameEra: g.gameEra ?? null, cumEra: g.cumEra ?? null,
        pa: null, ab: null, d2b: null, d3b: null, rbi: null, sb: null, gameAvg: null, cumAvg: null,
        h: g.h ?? null, hr: g.hr ?? null, bb: g.bb ?? null, so: g.so ?? null, r: g.r ?? null,
      });
    }
    return rows;
  });

  const hitterRows = await mapPool(hitters, FETCH_CONCURRENCY, async (p) => {
    await throttle();
    const games = await fetchKboHitterDailySeason(p.kboId, seasonStr);
    const rows: GameLogRow[] = [];
    const dateCount = new Map<string, number>();
    for (const g of games) {
      const date = toDate(y, g.date);
      if (!date) continue;
      const seq = dateCount.get(g.date) ?? 0;
      dateCount.set(g.date, seq + 1);
      rows.push({
        id: `kbo:B:${p.kboId}:${y}:${g.date}:${seq}`,
        kboId: p.kboId, role: "B", season: y, date, seq,
        name: p.name ?? null, team: p.team ?? null, opponent: g.opponent,
        roleDetail: null, result: null, ip: null, tbf: null, er: null, gameEra: null, cumEra: null,
        pa: g.pa ?? null, ab: g.ab ?? null, d2b: g.d2b ?? null, d3b: g.d3b ?? null,
        rbi: g.rbi ?? null, sb: g.sb ?? null, gameAvg: g.gameAvg ?? null, cumAvg: g.cumAvg ?? null,
        h: g.h ?? null, hr: g.hr ?? null, bb: g.bb ?? null, so: g.so ?? null, r: g.r ?? null,
      });
    }
    return rows;
  });

  // 3) 멱등 dedup + 적재
  const byId = new Map<string, GameLogRow>();
  for (const r of [...pitcherRows.flat(), ...hitterRows.flat()]) if (!byId.has(r.id)) byId.set(r.id, r);
  const unique = [...byId.values()];
  let created = 0;
  for (let i = 0; i < unique.length; i += 1000) {
    const res = await prisma.kboPlayerGameLog.createMany({ data: unique.slice(i, i + 1000), skipDuplicates: true });
    created += res.count;
  }
  return { season: y, pitchers: pitchers.length, hitters: hitters.length, rows: unique.length, created };
}

// 직접 실행 (npm run job:kbo-player-logs -- --season=2025)
if (import.meta.url === `file://${process.argv[1]}`) {
  const seasonArg = process.argv.find((a) => a.startsWith("--season="));
  runCollectKboPlayerLogs({ season: seasonArg ? Number(seasonArg.split("=")[1]) : undefined })
    .then((r) => {
      console.log(JSON.stringify(r));
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
