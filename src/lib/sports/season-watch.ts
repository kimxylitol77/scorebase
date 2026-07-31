// 축구 시즌 전환 감사(audit) 엔진 — CLI(`npm run audit:football-seasons`)와
// 감시 cron(/api/cron/football-season-watch)이 같은 판정을 쓰도록 한 곳에 모은다.
//
// 외부 API 를 부르지 않는다. 운영 DB(읽기)와 저장소 매핑만 본다 — 그래서 어디서든 안전하게 돌릴 수 있고
// TheSports IP whitelist 밖에서도 진단이 가능하다. 실제 시즌 후보 발견은 discover 쪽 몫이다.
//
// 판정 대상은 "지금 화면에 영향을 주는 리그"로 좁힌다.
//   - 최근 1시간 ~ 향후 25시간에 경기가 있는 리그 (오늘 화면)
//   - 향후 45일 안에 개막/경기가 있는 리그 (다가오는 시즌)
// 144개를 전부 나열하면 사람이 못 읽는다. 예외만 올린다.

import { prisma } from "@/lib/db";
import {
  NO_STANDINGS_LEAGUES,
  STAGED_COMPETITIONS,
  computeSeasonYear,
  seasonLabelFor,
} from "./season-calendar";
import {
  PROVIDER_AF,
  PROVIDER_TS,
  isRegistryAvailable,
  legacyTsSeasonId,
  staticTsTournamentId,
  type SeasonRecord,
} from "./season-registry";
import { SOCCER_LEAGUES } from "./sport-leagues";
import { standingsState, type StandingsState } from "./thesports/standings-gate";
import teamIdMapping from "./thesports/team-id-mapping.json";
import tsLeagueMap from "./thesports/league-id-mapping.json";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** ts 캐시가 이보다 오래되면 stale (poller 10분 주기 기준 충분히 관대). */
export const CACHE_STALE_MS = 24 * HOUR;
export const MIN_MAPPING_RATE = 0.95;

export type IssueCode =
  | "poller-down"
  | "season-id-mismatch"
  | "cache-missing"
  | "cache-stale"
  | "low-mapping"
  | "no-standings-source"
  | "no-season-before-open"
  | "active-without-cache";

export type Severity = "HIGH" | "MED" | "LOW";

export interface AuditIssue {
  code: IssueCode;
  severity: Severity;
  detail: string;
}

export type CompetitionKind = "LEAGUE" | "CUP" | "FRIENDLY";

export interface LeagueAudit {
  league: string;
  kind: CompetitionKind;
  /** 저장소 league-id-mapping.json 의 tsSeasonId */
  repoSeasonId: string | null;
  /** CompetitionSeason(ACTIVE, thesports) */
  activeSeasonId: string | null;
  activeSeasonLabel: string | null;
  activeStatus: string | null;
  /** TheSportsStandingsCache 에 실제로 들어 있는 season uuid */
  cacheSeasonId: string | null;
  cacheAgeH: number | null;
  cacheRows: number;
  mappingRate: number | null;
  afSeason: number | null;
  afAgeH: number | null;
  expectedSeasonYear: number;
  fixtures25h: number;
  fixtures45d: number;
  firstFixtureAt: Date | null;
  daysToFirstFixture: number | null;
  standingsSource: "thesports" | "api-football" | "none";
  state: StandingsState;
  issues: AuditIssue[];
}

export interface AuditResult {
  generatedAt: Date;
  poller: {
    name: string;
    lastAt: Date | null;
    ageMin: number | null;
    ok: boolean | null;
    consecutiveFailures: number | null;
    lastLeagues: number | null;
    lastOkCount: number | null;
    lastErrCount: number | null;
    failedLeagues: string[];
  };
  leagues: LeagueAudit[];
  /** 예외가 하나라도 있는 리그만 */
  exceptions: LeagueAudit[];
  summary: Record<IssueCode | "total" | "checked", number>;
}

const POLLER_NAME = "vultr-standings-poller";
/** poller 10분 주기 — 40분 넘게 소식이 없으면 죽은 것으로 본다. */
const POLLER_DOWN_MS = 40 * 60 * 1000;

const TS_TEAM_IDS_BY_LEAGUE = new Map<string, Set<string>>();
for (const e of teamIdMapping as Array<{ tsId: string; ourLeague: string }>) {
  if (!TS_TEAM_IDS_BY_LEAGUE.has(e.ourLeague)) TS_TEAM_IDS_BY_LEAGUE.set(e.ourLeague, new Set());
  TS_TEAM_IDS_BY_LEAGUE.get(e.ourLeague)!.add(e.tsId);
}

const STATIC_CODES = new Set((tsLeagueMap as Array<{ code: string }>).map((e) => e.code));

export function competitionKind(league: string): CompetitionKind {
  if (NO_STANDINGS_LEAGUES.has(league)) return "FRIENDLY";
  if (STAGED_COMPETITIONS.has(league)) return "CUP";
  return "LEAGUE";
}

function mappingRateOf(league: string, payload: unknown): { rate: number; rows: number } {
  const p = payload as { tables?: Array<{ rows?: Array<{ team_id?: string }> }> } | null;
  const ids = (p?.tables ?? []).flatMap(
    (t) => (t.rows ?? []).map((r) => r.team_id).filter(Boolean) as string[],
  );
  if (ids.length === 0) return { rate: 0, rows: 0 };
  const known = TS_TEAM_IDS_BY_LEAGUE.get(league) ?? new Set<string>();
  return { rate: ids.filter((id) => known.has(id)).length / ids.length, rows: ids.length };
}

/**
 * 개막까지 남은 일수에 따른 재알림 간격.
 * 60일 밖 = 주 1회 / 30일 이내 = 하루 1회 / 14일 이내 = 6시간 / 3일 이내·전환 실패 = 즉시.
 */
export function alertIntervalMs(daysToOpen: number | null): number {
  if (daysToOpen == null) return 24 * HOUR;
  if (daysToOpen <= 3) return 0;
  if (daysToOpen <= 14) return 6 * HOUR;
  if (daysToOpen <= 30) return 24 * HOUR;
  if (daysToOpen <= 60) return 7 * DAY;
  return 7 * DAY;
}

export interface AuditOptions {
  /** 검사 대상을 이 리그들로 한정 (미지정 = 일정 기준 자동 선정) */
  leagues?: string[];
  /** 일정이 없어도 매핑이 있는 축구 리그를 전부 검사 */
  all?: boolean;
  now?: Date;
}

export async function auditFootballSeasons(opts: AuditOptions = {}): Promise<AuditResult> {
  const now = opts.now ?? new Date();

  // ── 대상 리그 선정 ────────────────────────────────
  const near = await prisma.match.groupBy({
    by: ["league"],
    where: {
      startTime: { gte: new Date(now.getTime() - HOUR), lte: new Date(now.getTime() + 45 * DAY) },
    },
    _count: { _all: true },
    _min: { startTime: true },
  });
  const today = await prisma.match.groupBy({
    by: ["league"],
    where: {
      startTime: { gte: new Date(now.getTime() - HOUR), lte: new Date(now.getTime() + 25 * HOUR) },
    },
    _count: { _all: true },
  });
  const near45 = new Map(near.map((r) => [r.league, r]));
  const today25 = new Map(today.map((r) => [r.league, r._count._all]));

  // "다음 경기"와 "시즌 개막"은 다르다. 시즌 중인 리그는 내일도 경기가 있지만 개막이 아니다.
  // 최근 30일에 치른 경기가 없는 리그만 "개막 대기"로 본다 — 이게 없으면 시즌 중 리그 69개가
  // 전부 "개막 14일 이내인데 시즌 없음"으로 잡혀 알림이 무의미해진다.
  const recentlyPlayed = new Set(
    (
      await prisma.match.groupBy({
        by: ["league"],
        where: {
          status: "FINISHED",
          startTime: { gte: new Date(now.getTime() - 30 * DAY), lte: now },
        },
        _count: { _all: true },
      })
    ).map((r) => r.league),
  );

  let targets: string[];
  if (opts.leagues && opts.leagues.length > 0) {
    targets = opts.leagues;
  } else if (opts.all) {
    targets = [...STATIC_CODES].filter((c) => SOCCER_LEAGUES.has(c));
  } else {
    targets = [...new Set([...near45.keys(), ...today25.keys()])].filter((l) =>
      SOCCER_LEAGUES.has(l),
    );
  }
  targets.sort();

  // ── 배치 조회 ────────────────────────────────────
  const registryReady = await isRegistryAvailable();
  const [tsCaches, afCaches, registryRows, heartbeat] = await Promise.all([
    prisma.theSportsStandingsCache.findMany({
      where: { league: { in: targets } },
      select: { league: true, tsSeasonId: true, fetchedAt: true, payload: true },
    }),
    prisma.apiFootballStandingsCache.findMany({
      where: { league: { in: targets } },
      select: { league: true, season: true, fetchedAt: true, rows: true },
    }),
    !registryReady
      ? Promise.resolve([] as SeasonRecord[])
      : prisma.competitionSeason
      .findMany({
        where: { league: { in: targets }, status: { in: ["ACTIVE", "VERIFIED"] } },
        select: {
          id: true, league: true, provider: true, providerLeagueId: true,
          providerSeasonId: true, seasonLabel: true, seasonYear: true,
          startsAt: true, endsAt: true, status: true, teamCount: true,
          mappedTeamCount: true, metadata: true, lastCheckedAt: true, activatedAt: true,
        },
      })
      .catch(() => [] as SeasonRecord[]), // 테이블 미생성 — 호환 경로
    prisma.botHeartbeat
      .findUnique({ where: { name: POLLER_NAME }, select: { lastAt: true, metadata: true } })
      .catch(() => null),
  ]);

  const tsBy = new Map(tsCaches.map((c) => [c.league, c]));

  // 유럽 컵 stale 면제 — UCL/UEL/UECL 순위표는 리그페이즈(9~1월)에만 갱신된다.
  // 2~8월은 예선·녹아웃 구간이라 갱신할 표가 없어 캐시가 멈추는 게 정상이다.
  // data-sanity 가 쓰는 판정과 같은 규칙: 컵 외 리그가 신선하면 poller 는 살아있는 것.
  // ⚠ 면제는 "stale" 에만 건다. 시즌 ID 불일치는 컵이라도 그대로 보고한다 —
  //   지금 UCL 이 딱 그 경우(캐시가 2025-26 season uuid)이고, 이건 진짜 문제다.
  const EUROPEAN_CUPS = new Set(["UCL", "UEL", "UECL"]);
  const cacheSaysAlive = tsCaches.some(
    (c) =>
      !EUROPEAN_CUPS.has(c.league) &&
      now.getTime() - c.fetchedAt.getTime() < 1.5 * HOUR,
  );
  const afBy = new Map(afCaches.map((c) => [c.league, c]));
  const activeBy = new Map<string, SeasonRecord>();
  const verifiedBy = new Map<string, SeasonRecord>();
  for (const r of registryRows as SeasonRecord[]) {
    if (r.provider !== PROVIDER_TS && r.provider !== PROVIDER_AF) continue;
    if (r.status === "ACTIVE" && r.provider === PROVIDER_TS) activeBy.set(r.league, r);
    if (r.status === "VERIFIED") verifiedBy.set(r.league, r);
  }

  // ── poller heartbeat ─────────────────────────────
  const hbMeta = (heartbeat?.metadata ?? {}) as Record<string, unknown>;
  const hbAgeMin = heartbeat?.lastAt ? (now.getTime() - heartbeat.lastAt.getTime()) / 60000 : null;
  const poller: AuditResult["poller"] = {
    name: POLLER_NAME,
    lastAt: heartbeat?.lastAt ?? null,
    ageMin: hbAgeMin,
    ok: typeof hbMeta.ok === "boolean" ? hbMeta.ok : null,
    consecutiveFailures:
      typeof hbMeta.consecutiveFailures === "number" ? hbMeta.consecutiveFailures : null,
    lastLeagues: typeof hbMeta.leagues === "number" ? hbMeta.leagues : null,
    lastOkCount: typeof hbMeta.ok_count === "number" ? hbMeta.ok_count : typeof hbMeta.okCount === "number" ? hbMeta.okCount : null,
    lastErrCount: typeof hbMeta.err === "number" ? hbMeta.err : null,
    failedLeagues: Array.isArray(hbMeta.failedLeagues) ? (hbMeta.failedLeagues as string[]) : [],
  };
  // heartbeat 가 있으면 그게 1순위 판단, 없으면(워커 미배포) 캐시 신선도로 대신한다.
  const pollerAlive =
    hbAgeMin != null ? hbAgeMin * 60000 <= POLLER_DOWN_MS : cacheSaysAlive;

  // ── 리그별 판정 ──────────────────────────────────
  const leagues: LeagueAudit[] = [];
  for (const league of targets) {
    const kind = competitionKind(league);
    const cache = tsBy.get(league);
    const af = afBy.get(league);
    const active = activeBy.get(league) ?? null;
    const nearRow = near45.get(league);
    const firstFixtureAt = nearRow?._min.startTime ?? null;
    const daysToFirst =
      firstFixtureAt == null ? null : (firstFixtureAt.getTime() - now.getTime()) / DAY;
    const { rate, rows } = cache ? mappingRateOf(league, cache.payload) : { rate: 0, rows: 0 };
    const cacheAgeH = cache ? (now.getTime() - cache.fetchedAt.getTime()) / HOUR : null;
    const afAgeH = af ? (now.getTime() - af.fetchedAt.getTime()) / HOUR : null;
    const expectedSeasonYear = active?.seasonYear ?? computeSeasonYear(league, now);
    const repoSeasonId = legacyTsSeasonId(league);

    const seasonOk = !active || (cache != null && cache.tsSeasonId === active.providerSeasonId);
    const afRowCount = Array.isArray(af?.rows) ? (af.rows as unknown[]).length : 0;
    const afSeasonOk = af != null && af.season === expectedSeasonYear && afRowCount > 0;
    const tsUsable = cache != null && rows > 0 && seasonOk;
    const standingsSource: LeagueAudit["standingsSource"] = tsUsable
      ? "thesports"
      : afSeasonOk
        ? "api-football"
        : "none";
    const state = standingsState(league, standingsSource !== "none", firstFixtureAt, now);

    const issues: AuditIssue[] = [];
    const urgent = daysToFirst != null && daysToFirst <= 3;
    // 최근 30일에 치른 경기가 없으면서 앞으로 경기가 있다 = 시즌 개막 대기.
    const awaitingOpen = !recentlyPlayed.has(league) && firstFixtureAt != null;

    if (kind !== "FRIENDLY") {
      // 시즌 ID 3자 대조 — 저장소 / ACTIVE / 캐시
      const ids = new Set(
        [repoSeasonId, active?.providerSeasonId ?? null, cache?.tsSeasonId ?? null].filter(
          Boolean,
        ) as string[],
      );
      if (ids.size > 1) {
        issues.push({
          code: "season-id-mismatch",
          severity: urgent ? "HIGH" : "MED",
          detail: `저장소=${repoSeasonId ?? "없음"} / ACTIVE=${active?.providerSeasonId ?? "없음"} / 캐시=${cache?.tsSeasonId ?? "없음"}`,
        });
      }

      if (!cache && !af) {
        issues.push({
          code: "no-standings-source",
          severity: state === "PRESEASON" ? "MED" : "HIGH",
          detail: `순위 소스 없음 (ts 캐시 X, af 캐시 X) — 일정 45일 ${nearRow?._count._all ?? 0}건`,
        });
      } else if (!cache) {
        issues.push({
          code: "cache-missing",
          severity: "MED",
          detail: "TheSports 순위 캐시 없음 (af 만 존재)",
        });
      } else {
        // 유럽 컵 + poller 살아있음 = 리그페이즈 사이 시즌 경계 → stale 아님(정상).
        const cupExempt = EUROPEAN_CUPS.has(league) && pollerAlive;
        if (cacheAgeH != null && cacheAgeH > CACHE_STALE_MS / HOUR && !cupExempt) {
          issues.push({
            code: "cache-stale",
            severity: cacheAgeH > 24 * 7 ? "HIGH" : "MED",
            detail: `ts 캐시 ${cacheAgeH.toFixed(0)}시간 경과 (poller 10분 주기)`,
          });
        }
        if (rows > 0 && rate < MIN_MAPPING_RATE) {
          issues.push({
            code: "low-mapping",
            severity: rate < 0.5 ? "MED" : "LOW",
            detail: `팀 매핑률 ${(rate * 100).toFixed(0)}% (${rows}행, 기준 95%)`,
          });
        }
      }

      if (active && !cache) {
        issues.push({
          code: "active-without-cache",
          severity: "HIGH",
          detail: `ACTIVE 시즌(${active.seasonLabel})인데 순위 캐시가 없다`,
        });
      }

      // 개막 14일 이내인데 검증된 시즌이 없다.
      // 레지스트리 자체가 아직 없으면(migration 미적용) 전 리그가 걸려 알림이 무의미하므로 건너뛴다.
      if (
        registryReady &&
        awaitingOpen &&
        daysToFirst != null &&
        daysToFirst <= 14 &&
        !active &&
        !verifiedBy.get(league)
      ) {
        issues.push({
          code: "no-season-before-open",
          severity: urgent ? "HIGH" : "MED",
          detail: `개막까지 ${daysToFirst.toFixed(1)}일인데 VERIFIED/ACTIVE 시즌이 없다`,
        });
      }
    }

    leagues.push({
      league,
      kind,
      repoSeasonId,
      activeSeasonId: active?.providerSeasonId ?? null,
      activeSeasonLabel: active?.seasonLabel ?? null,
      activeStatus: active?.status ?? verifiedBy.get(league)?.status ?? null,
      cacheSeasonId: cache?.tsSeasonId ?? null,
      cacheAgeH,
      cacheRows: rows,
      mappingRate: cache ? rate : null,
      afSeason: af?.season ?? null,
      afAgeH,
      expectedSeasonYear,
      fixtures25h: today25.get(league) ?? 0,
      fixtures45d: nearRow?._count._all ?? 0,
      firstFixtureAt,
      daysToFirstFixture: daysToFirst,
      standingsSource,
      state,
      issues,
    });
  }

  const summary = {
    checked: leagues.length,
    total: 0,
  } as AuditResult["summary"];
  for (const l of leagues) {
    for (const i of l.issues) {
      summary[i.code] = (summary[i.code] ?? 0) + 1;
      summary.total++;
    }
  }
  if (hbAgeMin != null && hbAgeMin * 60000 > POLLER_DOWN_MS) {
    summary["poller-down"] = 1;
    summary.total++;
  } else if (heartbeat == null) {
    // heartbeat 자체가 없다 = 아직 새 워커가 배포되지 않았거나 죽었다.
    summary["poller-down"] = 1;
    summary.total++;
  }

  return {
    generatedAt: now,
    poller,
    leagues,
    exceptions: leagues.filter((l) => l.issues.length > 0),
    summary,
  };
}

/** 사람이 읽는 표. CLI·텔레그램 공용. */
export function formatAuditTable(result: AuditResult): string {
  const head = [
    "league", "kind", "state", "src", "active", "cache", "ageH", "map%", "af", "45d", "D-",
  ];
  const rows = result.exceptions.map((l) => [
    l.league,
    l.kind[0],
    l.state,
    l.standingsSource === "thesports" ? "ts" : l.standingsSource === "api-football" ? "af" : "-",
    l.activeSeasonLabel ?? (l.activeSeasonId ? l.activeSeasonId.slice(0, 8) : "-"),
    l.cacheSeasonId ? l.cacheSeasonId.slice(0, 8) : "-",
    l.cacheAgeH == null ? "-" : l.cacheAgeH.toFixed(0),
    l.mappingRate == null ? "-" : (l.mappingRate * 100).toFixed(0),
    l.afSeason == null ? "-" : String(l.afSeason),
    String(l.fixtures45d),
    l.daysToFirstFixture == null ? "-" : l.daysToFirstFixture.toFixed(0),
  ]);
  const widths = head.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length), 3),
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => (c ?? "").padEnd(widths[i])).join("  ");
  const out = [line(head), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(line)];
  return out.join("\n");
}

/** 이 리그의 시즌 라벨 표기 (표·알림용). */
export function labelFor(league: string, seasonYear: number): string {
  return seasonLabelFor(league, seasonYear);
}

/** 리그의 고정 tournament id — 없으면 매핑 자체가 빠진 것. */
export function tournamentIdFor(league: string): string | null {
  return staticTsTournamentId(league);
}
