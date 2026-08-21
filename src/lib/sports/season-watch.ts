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
  TS_SHARED_SEASON_LEAGUES,
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
import { NO_TABLE_LEAGUES } from "./standings-valid";
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
  | "season-blocked"
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
  const known = TS_TEAM_IDS_BY_LEAGUE.get(league) ?? new Set<string>();
  let tables = p?.tables ?? [];
  // 한 시즌에 다른 티어까지 섞여 오는 리그(YKKONEN 등)는 우리 팀이 한 팀도 없는 표를 분모에서 뺀다.
  // 남는 표가 하나도 없으면 걸러내지 않는다 — 매핑이 통째로 비어 있으면 0% 가 그대로 보여야 한다.
  if (TS_SHARED_SEASON_LEAGUES.has(league)) {
    const ours = tables.filter((t) =>
      (t.rows ?? []).some((r) => r.team_id && known.has(r.team_id)),
    );
    if (ours.length > 0) tables = ours;
  }
  const ids = tables.flatMap(
    (t) => (t.rows ?? []).map((r) => r.team_id).filter(Boolean) as string[],
  );
  if (ids.length === 0) return { rate: 0, rows: 0 };
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
        where: { league: { in: targets }, status: { in: ["ACTIVE", "VERIFIED", "DISCOVERED"] } },
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
  const discoveredBy = new Map<string, SeasonRecord>();
  for (const r of registryRows as SeasonRecord[]) {
    if (r.provider !== PROVIDER_TS && r.provider !== PROVIDER_AF) continue;
    if (r.status === "ACTIVE" && r.provider === PROVIDER_TS) activeBy.set(r.league, r);
    if (r.status === "VERIFIED") verifiedBy.set(r.league, r);
    if (r.status === "DISCOVERED") discoveredBy.set(r.league, r);
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

    // 신시즌 롤오버 대기 — 저장소는 신시즌 후보를 가리키는데 ACTIVE 가 아직 없다
    // (ts 가 표를 발행해야 poller 가 활성화한다 — has_table 대기). 사람이 할 일이 없는
    // 시즌성 상태인데 컵 예선이 3일 내라 urgent 로 승격돼 매일 HIGH 가 갔다
    // (2026-08 실측: 14일간 HIGH 164건 중 122건이 UEFA·AFC 컵 5개의 이 상태).
    // ACTIVE 가 생긴 뒤의 불일치는 실제 설정 오류라 기존 급 그대로 남는다.
    const rolloverWait =
      active == null && repoSeasonId != null && cache != null && cache.tsSeasonId !== repoSeasonId;

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
          severity: rolloverWait ? "LOW" : urgent ? "HIGH" : "MED",
          detail:
            `저장소=${repoSeasonId ?? "없음"} / ACTIVE=${active?.providerSeasonId ?? "없음"} / 캐시=${cache?.tsSeasonId ?? "없음"}` +
            (rolloverWait ? " · 신시즌 표 발행 대기 (poller 활성화 시 자동 해소)" : ""),
        });
      }

      if (!cache && !af) {
        // 개막 전 컵은 순위표가 없는 게 정상이다 — 녹아웃 대회는 표 자체가 없고,
        // 리그페이즈가 있는 컵도 대진 확정 전에는 표가 발행되지 않는다. 추적용으로만 남긴다.
        // (시즌 중 컵이 소스를 잃는 건 다른 얘기라 기존 급을 유지한다.)
        const cupBeforeDraw = kind === "CUP" && state === "PRESEASON";
        // 순위표가 의미 없는 녹아웃 대회는 "순위 소스 없음"이 영구 정상이다 — 표가 발행될 일이
        // 아예 없으므로 HIGH 로 올리면 매일 울리기만 하는 범주 오류가 된다. 추적용 LOW 로 남긴다.
        // (2026-08-21 빅5 슈퍼컵 온보딩 때 확인 — 단발 대회 4개가 곧바로 HIGH 4건을 만들었고,
        //  COPA_DEL_REY·COPPA_ITALIA·COUPE_DE_FRANCE 도 비수기마다 같은 이유로 울리고 있었다.)
        const neverHasTable = NO_TABLE_LEAGUES.has(league);
        issues.push({
          code: "no-standings-source",
          severity:
            neverHasTable || cupBeforeDraw ? "LOW" : state === "PRESEASON" ? "MED" : "HIGH",
          detail:
            `순위 소스 없음 (ts 캐시 X, af 캐시 X) — 일정 45일 ${nearRow?._count._all ?? 0}건` +
            (neverHasTable ? " · 녹아웃 대회라 순위표 자체가 없다(정상)" : ""),
        });
      } else if (!cache) {
        issues.push({
          code: "cache-missing",
          severity: "MED",
          detail: "TheSports 순위 캐시 없음 (af 만 존재)",
        });
      } else {
        // 유럽 컵 + poller 살아있음 = 리그페이즈 사이 시즌 경계 → stale 아님(정상).
        // 롤오버 대기도 동일 — 지난 시즌 표 동결은 의도된 노출(preseason 정본)이라
        // AFC_CL 이 "캐시 1777시간 경과" HIGH 로 매일 가던 것을 함께 잠재운다.
        const cupExempt = (EUROPEAN_CUPS.has(league) && pollerAlive) || rolloverWait;
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
        // 컵에서 순위 캐시 부재는 정상일 수 있다 — 녹아웃은 표 자체가 없다. 게다가 바로 위
        // no-standings-source 가 같은 사실을 이미 보고하므로 한 리그를 HIGH 로 두 번
        // 울리지 않는다(2026-08-20 DFB_POKAL 을 ACTIVE 로 올리자 이 판정이 새로 떴다).
        const cupWithoutTable = kind === "CUP" && standingsSource === "none";
        issues.push({
          code: "active-without-cache",
          severity: cupWithoutTable ? "LOW" : "HIGH",
          detail: `ACTIVE 시즌(${active.seasonLabel})인데 순위 캐시가 없다`,
        });
      }

      // 개막 14일 이내인데 쓸 시즌이 없다.
      // 레지스트리 자체가 아직 없으면(migration 미적용) 전 리그가 걸려 알림이 무의미하므로 건너뛴다.
      //
      // ⚠ "시즌을 못 찾았다"와 "찾았는데 전환이 막혔다"를 구분한다.
      //   후보(DISCOVERED)가 이미 있으면 발견은 끝난 것이고 남은 건 차단 사유(대개 팀 매핑률)다.
      //   그건 low-mapping 으로 따로 보고되므로 같은 리그를 HIGH 로 두 번 울리지 않는다.
      //   구분 없이 올렸더니 개막철에 19개 리그가 한꺼번에 HIGH 로 떴다 — 1인 운영자가
      //   못 읽는 알림은 없는 알림과 같다.
      if (
        registryReady &&
        awaitingOpen &&
        daysToFirst != null &&
        daysToFirst <= 14 &&
        !active &&
        !verifiedBy.get(league)
      ) {
        const cand = discoveredBy.get(league);
        if (!cand) {
          // ⚠ 저장소에 시즌 uuid 가 있으면 "후보조차 없다"는 사실이 아니다. 레지스트리에 행이
          //   없어도 호출부가 정적 매핑으로 폴백하므로 poller 는 그 값으로 정상 수집한다.
          //   2026-08-20 실측 — SERIE_A 등 6개 리그가 신시즌 표를 그날 받아 놓고도(매핑 100%,
          //   캐시 0시간) 매일 HIGH 로 울렸다. 같은 감사가 몇 줄 위에서 순위 소스를 정상으로
          //   판정하고 아래에서 시즌이 없다고 말하는 모순이었다. discover 를 돌려봐야 이미
          //   쓰고 있는 그 값이 후보로 나올 뿐이다. 남은 일은 레지스트리 이관뿐이라 LOW.
          //   저장소 값이 지난 시즌인 경우는 season-id-mismatch 가 캐시와 대조해 따로 잡는다.
          const onLegacyMapping = repoSeasonId != null;
          issues.push({
            code: "no-season-before-open",
            severity: onLegacyMapping ? "LOW" : urgent ? "HIGH" : "MED",
            detail: onLegacyMapping
              ? `레지스트리 미등록 — 저장소 매핑(${repoSeasonId})으로 가동 중 · 개막 ${daysToFirst.toFixed(1)}일 전`
              : `개막까지 ${daysToFirst.toFixed(1)}일인데 시즌 후보조차 없다 — discover 필요`,
          });
        } else {
          const meta = (cand.metadata ?? {}) as { verification?: { blockers?: string[] } };
          const blockers = meta.verification?.blockers ?? [];
          issues.push({
            code: "season-blocked",
            severity: "LOW",
            detail:
              `후보 ${cand.seasonLabel}(${cand.providerSeasonId}) 는 찾았으나 전환 미완` +
              (blockers.length ? ` — 차단: ${blockers.join(", ")}` : ""),
          });
        }
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
