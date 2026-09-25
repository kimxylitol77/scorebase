// 일정 감시·자동 복구 — af 날짜 피드로 빠진 경기·미래 날짜 고착·팀 오매핑을 찾고, 멱등 치유는 직접 닫는다
//
// 왜 필요한가. 2026-09-24 수동 전수 감사에서 나온 누락 유형은 탐지 규칙이 분명했다. 사람이 매일
// 대조하지 않도록 기계가 6시간마다 찾고, 고칠 수 있는 것은 고치고, 못 고치는 것만 한 번에 알린다.
//
// 자동 치유는 두 가지뿐이다 — 둘 다 순수 fetch→upsert·startTime 갱신이라 멱등·비파괴다.
//   (A) af 로 수집하는 리그의 빠진 경기 → 그 리그·날짜 collect 재실행 → 같은 매칭으로 재검증
//   (D) TheSports 담당 리그의 af 행 미래 날짜 고착 → af 날짜로 추종(겹치는 경기가 있으면 보류)
// 팀 생성·매핑·삭제·병합은 자동으로 하지 않는다. 9/24 에 표준 도구조차 Hajduk·Al-Ittihad 를 엉뚱한
// 팀 행에 붙이려 했다 — 사람 판단으로 남기고, 실행할 명령을 알림에 적는다.
//
// 루프 안전장치(self-heal.ts 와 같은 원칙).
//   재검증 통과만 성공 · 치유 key(리그:날짜) 당 7일 3회 상한 → 넘으면 "사람 확인" 알림 후 중단
//   · 같은 알림은 7일에 한 번 · 한 실행당 치유 상한.

import { prisma } from "@/lib/db";
import { runCollect } from "@/jobs/collect";
import { API_FOOTBALL_LEAGUE_ID } from "@/lib/sports/api-football-pro";
import { ALL_LEAGUES, SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { TS_COVERED_EXCEPTIONS } from "@/lib/sports/ts-covered-exceptions";
import tsLeagueMap from "@/lib/sports/thesports/league-id-mapping.json";
import { isAfFixtureRaw } from "@/lib/matches/postponed-reverify";
import type { League } from "@/lib/sports/types";
import { findDbMatch, type AfFixtureLite, type DbRowLite } from "./match";
import { loadUnmapped } from "./unmapped";

const DAY = 86400_000;
const H = 3600_000;
const PAST_DAYS = 2;
const FUTURE_DAYS = 7;
const MAX_HEAL_PAIRS = 8; // 리그·날짜 쌍 — 300초 안에서 안전한 수
const HEAL_MAX_ATTEMPTS = 3;
const ALERT_DEDUP_DAYS = 7;
const DRIFT_HORIZON_DAYS = 21;
const DRIFT_MIN_DIFF = H;
const DRIFT_MAX_ROWS = 400;

// 연기·취소·시각 미정 — 일정이 없는 게 정상이라 누락으로 세지 않는다.
const AF_SKIP_STATUS = new Set(["PST", "CANC", "ABD", "AWD", "WO", "TBD"]);
// 컬렉터가 일부러 거르는 경기와 같은 기준(api-football-collector.ts INTL_FRIENDLY 필터).
const YOUTH_OR_WOMEN = /\bU-?\d{2}\b|\bW$|Women/;
// 클럽 친선은 TheSports 전용 수집(af 소규모 친선은 설계상 제외) — 감시 대상 아님.
const WATCH_EXCLUDE = new Set(["CLUB_FRIENDLY"]);

const TS_COVERED = new Set(
  (tsLeagueMap as Array<{ code: string; tsSeasonId?: string }>).filter((e) => e.tsSeasonId).map((e) => e.code),
);
/** collect cron 이 af/ESPN 으로 수집하는 리그인가 (collect 라우트의 skip 판단과 같은 기준) */
const collectable = (lg: string) => !TS_COVERED.has(lg) || TS_COVERED_EXCEPTIONS.has(lg as League);

export type WatchKind =
  | "no-collection" // 노출 리그인데 창 안 DB 0건 — 수집 경로 자체가 없다
  | "missing-ts" // TheSports 담당 리그에서 빠진 경기 — 팀 매핑·조/시즌 이름 문제
  | "heal-exhausted" // af 리그 누락을 3회 재수집해도 안 생김
  | "drift-held" // 미래 날짜 교정이 겹치는 경기 때문에 보류
  | "ts-unmapped" // TheSports 가 준 경기인데 팀 매핑이 없어 버려짐(전 종목) — 워커·라우트 기록 기준
  | "double-booked"; // 한 팀이 3시간 안에 다른 상대와 두 경기 — 팀 오매핑 신호

export interface WatchFinding {
  kind: WatchKind;
  key: string;
  league: string;
  text: string;
}

export interface WatchReport {
  afFixtures: number;
  missing: number;
  healedPairs: number;
  healedFixtures: number;
  driftFixed: number;
  /** 날짜 교정 표본(최대 12) — 운영 응답·dry-run 에서 교정이 타당한지 사람이 훑어보게 */
  driftSample: string[];
  findings: WatchFinding[];
  /** 7일 내 이미 알린 것은 빠진 — 이번에 새로 알릴 목록 */
  toAlert: WatchFinding[];
}

const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const fmt = (d: string | Date) => {
  const k = new Date(new Date(d).getTime() + 9 * H);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
};

async function afGet(path: string): Promise<any[]> {
  const res = await fetch(`https://v3.football.api-sports.io/${path}`, {
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY ?? "" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`af ${path} HTTP ${res.status}`);
  const j = (await res.json()) as { response?: any[]; errors?: unknown };
  // 분당 한도 등은 200 + errors 로 온다(api-sports-silent-200-errors) — 빈 결과를 "누락 0"으로 오독하지 않게 던진다.
  if (j.errors && typeof j.errors === "object" && Object.keys(j.errors as object).length) {
    throw new Error(`af ${path} errors ${JSON.stringify(j.errors).slice(0, 120)}`);
  }
  return j.response ?? [];
}

async function loadRows(leagues: string[], from: number, to: number) {
  const rows = await prisma.match.findMany({
    where: { league: { in: leagues }, startTime: { gte: new Date(from), lte: new Date(to) } },
    select: {
      id: true, league: true, externalId: true, startTime: true, homeTeamId: true, awayTeamId: true,
      homeTeam: { select: { name: true, externalId: true } },
      awayTeam: { select: { name: true, externalId: true } },
    },
  });
  const byLeague = new Map<string, DbRowLite[]>();
  for (const r of rows) {
    const list = byLeague.get(r.league) ?? [];
    list.push({
      id: r.id, externalId: r.externalId, startTime: r.startTime, homeTeamId: r.homeTeamId, awayTeamId: r.awayTeamId,
      homeName: r.homeTeam.name, awayName: r.awayTeam.name, homeExt: r.homeTeam.externalId, awayExt: r.awayTeam.externalId,
    });
    byLeague.set(r.league, list);
  }
  return byLeague;
}

async function healAttempts(key: string): Promise<number> {
  return prisma.healthCheck.count({
    where: { category: "schedule-watch-heal", key, runAt: { gte: new Date(Date.now() - 7 * DAY) } },
  });
}

/**
 * 빠진 경기·교정 보류·오매핑을 찾고, 멱등 치유(A·D)는 그 자리에서 닫는다.
 * dryRun = 탐지만 — 치유·날짜 교정·HealthCheck 기록을 전부 건너뛴다(수동 점검용, ?dry=1).
 */
export async function runScheduleWatch(now = new Date(), dryRun = false): Promise<WatchReport> {
  const findings: WatchFinding[] = [];
  const exposed = new Set<string>(ALL_LEAGUES as readonly string[]);
  const byAfId = new Map<number, string[]>();
  for (const [code, id] of Object.entries(API_FOOTBALL_LEAGUE_ID)) {
    if (!exposed.has(code) || !SOCCER_LEAGUES.has(code as League) || WATCH_EXCLUDE.has(code)) continue;
    byAfId.set(id, [...(byAfId.get(id) ?? []), code]);
  }

  // ── 1) af 날짜 피드 — 하루 1콜로 전 세계 경기
  const today = Date.parse(ymd(now.getTime()));
  const fixtures: Array<AfFixtureLite & { league: string }> = [];
  for (let t = today - PAST_DAYS * DAY; t <= today + FUTURE_DAYS * DAY; t += DAY) {
    for (const f of await afGet(`fixtures?date=${ymd(t)}`)) {
      const codes = byAfId.get(f.league?.id);
      if (!codes || AF_SKIP_STATUS.has(f.fixture?.status?.short)) continue;
      for (const lg of codes) {
        if (lg === "INTL_FRIENDLY" && (YOUTH_OR_WOMEN.test(f.teams.home.name) || YOUTH_OR_WOMEN.test(f.teams.away.name))) continue;
        fixtures.push({
          league: lg, id: f.fixture.id, date: f.fixture.date,
          home: { id: f.teams.home.id, name: f.teams.home.name }, away: { id: f.teams.away.id, name: f.teams.away.name },
        });
      }
    }
  }
  const leagues = [...new Set(fixtures.map((f) => f.league))];
  const from = today - PAST_DAYS * DAY - 72 * H;
  const to = today + (FUTURE_DAYS + 1) * DAY + 72 * H;
  let rows = await loadRows(leagues, from, to);
  const tsi = await prisma.teamSourceId.findMany({ where: { source: "api-football" }, select: { externalId: true, teamId: true } });
  const afTeam = new Map<string, Set<number>>();
  for (const x of tsi) (afTeam.get(x.externalId) ?? afTeam.set(x.externalId, new Set()).get(x.externalId)!).add(x.teamId);

  const findMissing = () => fixtures.filter((f) => !findDbMatch(f, rows.get(f.league) ?? [], afTeam));
  let missing = findMissing();
  const missingCount = missing.length;

  // ── 2) 분류 — 리그 단위 0건 / af 리그(치유) / ts 리그(알림)
  const perLeague = new Map<string, typeof missing>();
  for (const f of missing) perLeague.set(f.league, [...(perLeague.get(f.league) ?? []), f]);
  const afPairs = new Map<string, typeof missing>(); // "LEAGUE:yyyy-mm-dd"
  for (const [lg, list] of perLeague) {
    const total = fixtures.filter((f) => f.league === lg).length;
    if ((rows.get(lg) ?? []).length === 0 && total >= 3) {
      findings.push({
        kind: "no-collection", key: lg, league: lg,
        text: `${lg}: af ${total}경기인데 DB 0건 — ${collectable(lg) ? "수집 cron 에 리그가 없다(collect 목록 또는 전용 cron 등록)" : "TheSports 가 매치를 안 만든다(조·시즌 이름 변경, 매핑 확인 — 9/25 KAKKONEN 사례)"}`,
      });
      continue;
    }
    if (!collectable(lg)) {
      const ex = list.slice(0, 2).map((f) => `${fmt(f.date)} ${f.home.name} v ${f.away.name}`).join(" / ");
      findings.push({
        kind: "missing-ts", key: lg, league: lg, // 리그 단위 — 창이 밀릴 때마다 새 알림이 되지 않게
        text: `${lg} ${list.length}경기 (예: ${ex}) — 팀 매핑 추정. npm run backfill:cup-teams -- --league ${lg} --season (dry-run 결과의 '신규'는 기존 팀과 대조 후 --write)`,
      });
      continue;
    }
    for (const f of list) {
      const k = `${lg}:${f.date.slice(0, 10)}`;
      afPairs.set(k, [...(afPairs.get(k) ?? []), f]);
    }
  }

  // ── 3) 치유 A — af 리그 누락은 그 리그·날짜 collect 재실행 → 같은 매칭으로 재검증
  let healedPairs = 0;
  let healedFixtures = 0;
  let pairsRun = 0;
  for (const [k, list] of afPairs) {
    const [lg, d] = k.split(":");
    const attempts = await healAttempts(k);
    if (attempts >= HEAL_MAX_ATTEMPTS) {
      findings.push({
        kind: "heal-exhausted", key: k, league: lg,
        text: `${lg} ${d} ${list.length}경기 — collect 재실행 ${attempts}회로 안 생김(팀 해석 실패·수집기 필터 의심). 예: ${list[0].home.name} v ${list[0].away.name}`,
      });
      continue;
    }
    if (pairsRun >= MAX_HEAL_PAIRS || dryRun) continue; // 다음 실행이 이어서 한다
    pairsRun++;
    // af 수집기는 UTC 날짜, ESPN 은 미국 날짜 — 전날까지 함께 돌려 경계를 덮는다
    for (const day of [d, ymd(Date.parse(d) - DAY)]) {
      try {
        await runCollect({ leagues: [lg as League], date: day });
      } catch (e) {
        console.warn(`[schedule-watch] collect ${lg} ${day} 실패:`, (e as Error).message);
      }
    }
    const fresh = await loadRows([lg], from, to);
    rows.set(lg, fresh.get(lg) ?? []);
    const still = list.filter((f) => !findDbMatch(f, rows.get(lg) ?? [], afTeam));
    const ok = still.length === 0;
    await prisma.healthCheck.create({
      data: {
        category: "schedule-watch-heal", key: k, severity: ok ? "OK" : "LOW",
        message: `collect 재실행 — 복구 ${list.length - still.length}/${list.length}`,
      },
    });
    if (ok) healedPairs++;
    healedFixtures += list.length - still.length;
  }
  missing = findMissing();

  // ── 4) 치유 D — TheSports 담당 리그 af 행의 미래 날짜 고착 추종
  const driftSample: string[] = [];
  const driftFixed = await healFutureDrift(now, findings, dryRun, driftSample);

  // ── 4') 팀 매핑 없어 버려진 TheSports 경기(전 종목) — 워커·수신 라우트가 남긴 기록 중 아직도 없는 것
  await checkUnmapped(now, findings);

  // ── 5) 오매핑 신호 — 한 팀이 3시간 안에 다른 상대와 두 경기
  const dbl = await prisma.$queryRawUnsafe<Array<{ league: string; team: number; name: string; a: string; b: string; at: Date }>>(`
    WITH s AS (
      SELECT id, league, "externalId", "startTime", "homeTeamId" t, "awayTeamId" o FROM "Match"
       WHERE "startTime" BETWEEN $1 AND $2 AND status <> 'POSTPONED'
      UNION ALL
      SELECT id, league, "externalId", "startTime", "awayTeamId" t, "homeTeamId" o FROM "Match"
       WHERE "startTime" BETWEEN $1 AND $2 AND status <> 'POSTPONED'
    )
    SELECT a.league, a.t team, tm.name, a."externalId" a, b."externalId" b, a."startTime" at
      FROM s a JOIN s b ON a.league = b.league AND a.t = b.t AND a.id < b.id AND a.o <> b.o
       AND abs(extract(epoch FROM a."startTime" - b."startTime")) < 3 * 3600
      JOIN "Team" tm ON tm.id = a.t
     WHERE a.league NOT LIKE '%FRIENDLY%' AND a.league NOT IN ('NBA', 'UFC')`,
    new Date(now.getTime() - 7 * DAY), new Date(now.getTime() + 7 * DAY),
  );
  for (const r of dbl) {
    findings.push({
      kind: "double-booked", key: `${r.league}:${r.team}:${r.a}:${r.b}`, league: r.league,
      text: `${r.league} ${r.name}(#${r.team}) ${fmt(r.at)} 전후 3시간에 다른 상대와 두 경기(${r.a} / ${r.b}) — ts 팀 매핑이 두 팀을 한 행에 붙였을 가능성`,
    });
  }

  // ── 6) 알림 중복 억제 — 같은 finding 은 7일에 한 번
  const toAlert: WatchFinding[] = [];
  for (const f of findings) {
    const key = `${f.kind}:${f.key}`.slice(0, 190);
    if (dryRun) {
      toAlert.push(f);
      continue;
    }
    const seen = await prisma.healthCheck.count({
      where: { category: "schedule-watch-alert", key, runAt: { gte: new Date(now.getTime() - ALERT_DEDUP_DAYS * DAY) } },
    });
    if (seen > 0) continue;
    toAlert.push(f);
    await prisma.healthCheck.create({ data: { category: "schedule-watch-alert", key, severity: "MED", message: f.text.slice(0, 500) } });
  }

  const report: WatchReport = {
    afFixtures: fixtures.length, missing: missingCount, healedPairs, healedFixtures, driftFixed, driftSample, findings, toAlert,
  };
  if (dryRun) return report;
  await prisma.healthCheck.create({
    data: {
      category: "schedule-watch", key: "summary",
      severity: findings.length ? "MED" : "OK",
      message: `af ${fixtures.length}경기 · 누락 ${missingCount}(복구 ${healedFixtures}) · 날짜 교정 ${driftFixed} · 확인 필요 ${findings.length}(신규 알림 ${toAlert.length})`,
      metadata: { remainingMissing: missing.length, byKind: countBy(findings.map((f) => f.kind)) },
    },
  });
  return report;
}

const UNMAPPED_HINT: Record<string, string> = {
  football: "npm run backfill:cup-teams -- --league {L} --season (dry-run 의 '신규'는 기존 팀과 대조 후 --write)",
};
const UNMAPPED_HINT_DEFAULT =
  "Team·TeamSourceId 추가 + lightsail-worker 의 {sport} 팀 매핑 JSON(웹 사본 동일) 갱신 후 Vultr 배포 — 9/25 하키 친선 방식";

async function checkUnmapped(now: Date, findings: WatchFinding[]) {
  const flagged = new Set(findings.filter((f) => f.kind === "missing-ts").map((f) => f.league));
  for (const u of await loadUnmapped(now)) {
    if (flagged.has(u.league)) continue; // af 대조가 이미 같은 리그를 알렸다
    const recent = u.matches.filter((m) => {
      const t = Date.parse(m.startTime);
      return t >= now.getTime() - 3 * DAY && t <= now.getTime() + FUTURE_DAYS * DAY;
    });
    if (!recent.length) continue;
    const ids = recent.map((m) => m.tsMatchId);
    const [tsRows, caches] = await Promise.all([
      prisma.match.findMany({ where: { externalId: { in: ids.map((i) => `ts-${i}`) } }, select: { externalId: true } }),
      prisma.theSportsMatchCache.findMany({ where: { tsMatchId: { in: ids } }, select: { tsMatchId: true } }),
    ]);
    const have = new Set([...tsRows.map((r) => r.externalId.slice(3)), ...caches.map((c) => c.tsMatchId)]);
    const still = recent.filter((m) => !have.has(m.tsMatchId));
    if (!still.length) continue;
    const teamIds = [...new Set(still.flatMap((m) => [m.tsHomeTeamId, m.tsAwayTeamId]))];
    const mapped = new Set(
      (await prisma.teamSourceId.findMany({ where: { source: "thesports", externalId: { in: teamIds } }, select: { externalId: true } }))
        .map((x) => x.externalId),
    );
    const missingTeams = teamIds.filter((t) => !mapped.has(t));
    const hint = (UNMAPPED_HINT[u.sport] ?? UNMAPPED_HINT_DEFAULT).replace("{L}", u.league).replace("{sport}", u.sport);
    findings.push({
      kind: "ts-unmapped", key: u.league, league: u.league,
      text: `${u.league}(${u.sport}) ${still.length}경기 — 팀 매핑 없는 ts 팀 ${missingTeams.length}개(${missingTeams.slice(0, 4).join(", ")}${missingTeams.length > 4 ? " …" : ""}). ${hint}`,
    });
  }
}

function countBy(xs: string[]) {
  return xs.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {});
}

/**
 * TheSports 담당(af 수집 skip) 리그의 af 행은 시즌 초 선수집 시각에 멈춘다(9/25 카자흐 1부 24경기 —
 * 10/17 13:00 일괄 임시시각). af 가 준 실제 날짜로 옮기되, 옮길 자리 ±3h 에 한 팀이라도 겹치는
 * 경기가 있으면(같은 경기의 ts 행 포함) 보류하고 알린다. 함께 옮겨지는 행끼리는 옮긴 뒤 시각으로 판정.
 */
async function healFutureDrift(now: Date, findings: WatchFinding[], dryRun: boolean, sample: string[]): Promise<number> {
  const leagues = [...TS_COVERED].filter(
    (l) => !TS_COVERED_EXCEPTIONS.has(l as League) && SOCCER_LEAGUES.has(l as League),
  );
  const cands = await prisma.match.findMany({
    where: {
      league: { in: leagues }, status: "SCHEDULED",
      startTime: { gte: now, lte: new Date(now.getTime() + DRIFT_HORIZON_DAYS * DAY) },
      NOT: { externalId: { startsWith: "ts-" } },
    },
    select: { id: true, league: true, externalId: true, startTime: true, homeTeamId: true, awayTeamId: true, raw: true },
    orderBy: { startTime: "asc" },
    take: DRIFT_MAX_ROWS,
  });
  const af = cands.filter((m) => /^\d+$/.test(m.externalId) && isAfFixtureRaw(m.raw, m.externalId));
  const verify = new Map<string, { short: string; date: string }>();
  for (let i = 0; i < af.length; i += 20) {
    try {
      for (const f of await afGet(`fixtures?ids=${af.slice(i, i + 20).map((m) => m.externalId).join("-")}`)) {
        verify.set(String(f.fixture.id), { short: f.fixture.status.short, date: f.fixture.date });
      }
    } catch (e) {
      console.warn("[schedule-watch] drift verify 실패:", (e as Error).message);
    }
  }
  const moves = new Map<number, Date>();
  for (const m of af) {
    const v = verify.get(m.externalId);
    if (!v || (v.short !== "NS" && v.short !== "TBD")) continue;
    const t = new Date(v.date);
    if (Number.isNaN(t.getTime()) || t <= now) continue;
    if (Math.abs(t.getTime() - m.startTime.getTime()) > DRIFT_MIN_DIFF) moves.set(m.id, t);
  }
  let fixed = 0;
  for (const m of af) {
    const t = moves.get(m.id);
    if (!t) continue;
    const teams = [m.homeTeamId, m.awayTeamId];
    const near = await prisma.match.findMany({
      where: {
        id: { not: m.id }, league: m.league, status: { not: "POSTPONED" },
        startTime: { gte: new Date(t.getTime() - 3 * H), lte: new Date(t.getTime() + 3 * H) },
        OR: [{ homeTeamId: { in: teams } }, { awayTeamId: { in: teams } }],
      },
      select: { id: true },
    });
    // 함께 옮겨지는 행은 옮긴 뒤 시각으로 판정 — 옛 임시시각 때문에 서로를 막지 않게
    const blockers = near.filter((n) => !moves.has(n.id));
    const peerClash = af.some(
      (o) => o.id !== m.id && moves.has(o.id) && Math.abs(moves.get(o.id)!.getTime() - t.getTime()) <= 3 * H &&
        (teams.includes(o.homeTeamId) || teams.includes(o.awayTeamId)),
    );
    if (blockers.length || peerClash) {
      findings.push({
        kind: "drift-held", key: `${m.league}:${m.id}`, league: m.league,
        text: `${m.league} #${m.id} ${fmt(m.startTime)} → af ${fmt(t)} 교정 보류 — 옮길 자리에 겹치는 경기(${blockers.map((b) => `#${b.id}`).join(",") || "같이 옮겨지는 행"})`,
      });
      continue;
    }
    if (!dryRun) await prisma.match.update({ where: { id: m.id }, data: { startTime: t } });
    if (sample.length < 12) sample.push(`${m.league} #${m.id} ${fmt(m.startTime)} → ${fmt(t)}`);
    fixed++;
  }
  return fixed;
}
