// 리그별 "현재 시즌"의 단일 진실 — CompetitionSeason 테이블 접근 계층.
//
// 왜 필요한가.
//   기존엔 TheSports season_id 가 저장소 JSON(league-id-mapping.json)과 Lightsail 워커의
//   복사본 두 곳에 손으로 관리됐다. 새 시즌이 오면 두 파일을 사람이 각각 고쳐야 했고,
//   못 고치면 poller 가 지난 시즌 uuid 로 조회 → 빈 응답 → 캐시가 지난 시즌 표에 동결되고
//   새 시즌 경기에 작년 순위가 붙었다(2026-07 UCL·분데스리가 72일 동결).
//
// 구조.
//   리그의 고정 정보(tsId 같은 tournament id) = league-id-mapping.json (거의 안 바뀜)
//   매년 바뀌는 시즌 정보(season uuid·연도·기간) = CompetitionSeason (이 모듈)
//
// 상태 전이. DISCOVERED → VERIFIED → ACTIVE → ARCHIVED
//   자동 발견만으로 ACTIVE 가 되지 않는다. 검증(season-discovery.ts)을 통과해야 VERIFIED,
//   활성화는 별도 함수(activateSeason)로만 — 사유가 metadata 에 남는다.
//
// 호환. 테이블이 아직 없거나(운영 migration 미적용) 행이 없으면 모든 조회가 null 을 반환하고
//   호출부는 기존 정적 매핑/계산으로 자동 폴백한다. 즉 도입 자체로는 화면이 바뀌지 않는다.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeSeasonYear, seasonLabelFor } from "./season-calendar";
import tsLeagueMap from "./thesports/league-id-mapping.json";

export const PROVIDER_TS = "thesports";
export const PROVIDER_AF = "api-football";

export type SeasonStatus = "DISCOVERED" | "VERIFIED" | "ACTIVE" | "ARCHIVED";

export interface SeasonRecord {
  id: number;
  league: string;
  provider: string;
  providerLeagueId: string;
  providerSeasonId: string;
  seasonLabel: string;
  seasonYear: number;
  startsAt: Date | null;
  endsAt: Date | null;
  status: string;
  teamCount: number | null;
  mappedTeamCount: number | null;
  metadata: unknown;
  lastCheckedAt: Date | null;
  activatedAt: Date | null;
}

const SELECT = {
  id: true, league: true, provider: true, providerLeagueId: true,
  providerSeasonId: true, seasonLabel: true, seasonYear: true,
  startsAt: true, endsAt: true, status: true,
  teamCount: true, mappedTeamCount: true, metadata: true,
  lastCheckedAt: true, activatedAt: true,
} as const;

// ── 정적 매핑(fallback) ────────────────────────────────────────
interface StaticLeagueEntry {
  code: string;
  tsId: string;
  tsSeasonId?: string;
}
const STATIC_BY_CODE = new Map<string, StaticLeagueEntry>(
  (tsLeagueMap as StaticLeagueEntry[]).map((e) => [e.code, e]),
);

/** 리그의 고정 tournament id (TheSports competition_id). 시즌과 무관하게 유지되는 값. */
export function staticTsTournamentId(league: string): string | null {
  return STATIC_BY_CODE.get(league)?.tsId ?? null;
}

/** 저장소 JSON 에 남아 있는 season uuid — 레지스트리 이행 전 호환 경로 전용. */
export function legacyTsSeasonId(league: string): string | null {
  return STATIC_BY_CODE.get(league)?.tsSeasonId ?? null;
}

// ── 레지스트리 가용성 ──────────────────────────────────────────
// 운영 migration 적용 전에는 테이블이 없다. 매 조회마다 예외를 내고 삼키면 Prisma 가
// error 로그를 쏟아내므로, 프로세스당 한 번만 존재 여부를 확인하고 이후엔 건너뛴다.
let registryAvailable: boolean | null = null;

export async function isRegistryAvailable(): Promise<boolean> {
  if (registryAvailable !== null) return registryAvailable;
  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass('public."CompetitionSeason"') IS NOT NULL AS exists
    `;
    registryAvailable = rows[0]?.exists === true;
  } catch {
    registryAvailable = false;
  }
  return registryAvailable;
}

// ── ACTIVE 캐시 (in-process 60s) ───────────────────────────────
const ACTIVE_TTL_MS = 60 * 1000;
let activeCache: { at: number; byKey: Map<string, SeasonRecord> } | null = null;

function key(league: string, provider: string) {
  return `${provider}:${league}`;
}

/** 레지스트리 테이블 자체가 없거나 접근 불가일 때는 "행 없음"으로 간주해 기존 동작을 유지한다. */
async function loadActive(): Promise<Map<string, SeasonRecord>> {
  const now = Date.now();
  if (activeCache && now - activeCache.at < ACTIVE_TTL_MS) return activeCache.byKey;
  const byKey = new Map<string, SeasonRecord>();
  if (!(await isRegistryAvailable())) {
    activeCache = { at: now, byKey };
    return byKey;
  }
  try {
    const rows = await prisma.competitionSeason.findMany({
      where: { status: "ACTIVE" },
      select: SELECT,
    });
    for (const r of rows) byKey.set(key(r.league, r.provider), r as SeasonRecord);
  } catch (e) {
    // migration 미적용(P2021) 등 — 호환 경로로 조용히 폴백.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[season-registry] ACTIVE 조회 실패 — 정적 매핑으로 폴백:", (e as Error).message);
    }
  }
  activeCache = { at: now, byKey };
  return byKey;
}

/** 테스트·CLI 에서 캐시 무효화. */
export function invalidateSeasonCache(): void {
  activeCache = null;
  registryAvailable = null;
}

/** 리그+provider 의 ACTIVE 시즌. 없으면 null. */
export async function getActiveSeason(
  league: string,
  provider: string = PROVIDER_TS,
): Promise<SeasonRecord | null> {
  return (await loadActive()).get(key(league, provider)) ?? null;
}

/** provider 의 전체 ACTIVE 시즌 목록. */
export async function listActiveSeasons(provider?: string): Promise<SeasonRecord[]> {
  const all = [...(await loadActive()).values()];
  return provider ? all.filter((r) => r.provider === provider) : all;
}

/**
 * 순위 조회용 TheSports season uuid.
 * ACTIVE 레지스트리 우선 → 없으면 저장소 JSON(호환).
 */
export async function resolveTsSeasonId(league: string): Promise<string | null> {
  const active = await getActiveSeason(league, PROVIDER_TS);
  return active?.providerSeasonId ?? legacyTsSeasonId(league);
}

/**
 * api-football `season` 파라미터용 시즌 연도.
 * ACTIVE 레지스트리(af → ts 순) 우선 → 없으면 season-calendar 계산(제한적 fallback).
 */
export async function resolveSeasonYear(league: string, at: Date = new Date()): Promise<number> {
  const af = await getActiveSeason(league, PROVIDER_AF);
  if (af) return af.seasonYear;
  const ts = await getActiveSeason(league, PROVIDER_TS);
  if (ts) return ts.seasonYear;
  return computeSeasonYear(league, at);
}

// ── 상태 전이 ──────────────────────────────────────────────────

export interface DiscoverInput {
  league: string;
  provider?: string;
  providerLeagueId: string;
  providerSeasonId: string;
  seasonYear: number;
  seasonLabel?: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
  teamCount?: number | null;
  mappedTeamCount?: number | null;
  metadata?: Record<string, unknown>;
}

/**
 * 후보 시즌 기록(멱등). 이미 있으면 관측값만 갱신하고 status 는 건드리지 않는다.
 * — 이미 ACTIVE 인 시즌을 재발견해도 DISCOVERED 로 되돌아가지 않게 하기 위함.
 */
export async function recordDiscoveredSeason(input: DiscoverInput): Promise<SeasonRecord> {
  const provider = input.provider ?? PROVIDER_TS;
  const seasonLabel = input.seasonLabel ?? seasonLabelFor(input.league, input.seasonYear);
  const now = new Date();
  const observed = {
    providerLeagueId: input.providerLeagueId,
    seasonLabel,
    seasonYear: input.seasonYear,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    teamCount: input.teamCount ?? null,
    mappedTeamCount: input.mappedTeamCount ?? null,
    lastCheckedAt: now,
    ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
  };
  const row = await prisma.competitionSeason.upsert({
    where: {
      league_provider_providerSeasonId: {
        league: input.league,
        provider,
        providerSeasonId: input.providerSeasonId,
      },
    },
    create: {
      league: input.league,
      provider,
      providerSeasonId: input.providerSeasonId,
      status: "DISCOVERED",
      discoveredAt: now,
      ...observed,
    },
    update: observed,
    select: SELECT,
  });
  invalidateSeasonCache();
  return row as SeasonRecord;
}

/** 검증 통과 기록 — DISCOVERED → VERIFIED. 이미 ACTIVE 면 그대로 둔다. */
export async function markSeasonVerified(
  id: number,
  checks: Record<string, unknown>,
): Promise<SeasonRecord> {
  const cur = await prisma.competitionSeason.findUnique({ where: { id }, select: SELECT });
  if (!cur) throw new Error(`CompetitionSeason id=${id} 없음`);
  const meta = { ...(cur.metadata as Record<string, unknown> | null ?? {}), verification: checks };
  const row = await prisma.competitionSeason.update({
    where: { id },
    data: {
      status: cur.status === "ACTIVE" ? "ACTIVE" : "VERIFIED",
      verifiedAt: new Date(),
      lastCheckedAt: new Date(),
      metadata: meta as Prisma.InputJsonValue,
    },
    select: SELECT,
  });
  invalidateSeasonCache();
  return row as SeasonRecord;
}

/**
 * ACTIVE 전환 — 같은 league/provider 의 기존 ACTIVE 를 ARCHIVED 로 내리고 대상만 올린다.
 * 트랜잭션으로 "ACTIVE 는 하나" 불변식을 보장한다 (DB 부분 unique index 와 이중 방어).
 *
 * @param reason 전환 사유 — metadata.activationReason 에 기록.
 */
export async function activateSeason(id: number, reason: string): Promise<SeasonRecord> {
  const row = await prisma.$transaction(async (tx) => {
    const target = await tx.competitionSeason.findUnique({ where: { id }, select: SELECT });
    if (!target) throw new Error(`CompetitionSeason id=${id} 없음`);
    if (target.status === "DISCOVERED") {
      throw new Error(
        `id=${id} (${target.league}) 은 아직 VERIFIED 가 아니다 — 검증 없이 ACTIVE 전환 금지`,
      );
    }
    await tx.competitionSeason.updateMany({
      where: {
        league: target.league,
        provider: target.provider,
        status: "ACTIVE",
        id: { not: id },
      },
      data: { status: "ARCHIVED" },
    });
    const meta = {
      ...(target.metadata as Record<string, unknown> | null ?? {}),
      activationReason: reason,
    };
    return tx.competitionSeason.update({
      where: { id },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
        lastCheckedAt: new Date(),
        metadata: meta as Prisma.InputJsonValue,
      },
      select: SELECT,
    });
  });
  invalidateSeasonCache();
  return row as SeasonRecord;
}

/** 종료된 시즌 내리기. */
export async function archiveSeason(id: number, reason: string): Promise<void> {
  const cur = await prisma.competitionSeason.findUnique({ where: { id }, select: { metadata: true } });
  const meta = { ...(cur?.metadata as Record<string, unknown> | null ?? {}), archiveReason: reason };
  await prisma.competitionSeason.update({
    where: { id },
    data: { status: "ARCHIVED", metadata: meta as Prisma.InputJsonValue },
  });
  invalidateSeasonCache();
}
