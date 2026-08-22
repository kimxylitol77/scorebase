"use client";
// 즐겨찾기 계정 스코프 동기화 — localStorage 즐겨찾기를 로그인 계정 단위로 격리한다.
// 배경. 정본이 localStorage 라 같은 브라우저에서 계정을 바꿔도 목록이 그대로 남고,
// 별표 토글 시 이전 계정의 집합이 새 계정의 서버 팔로우(텔레그램 알림 대상)로 PUT 되던 오염.
// 규칙 (use-me 의 /api/me 확정 시점마다 호출, owner 키와 비교).
//  - owner == 현재 닉네임        → no-op (라우트 이동마다 불리므로 저렴하게).
//  - 로그아웃 확정 + owner 있음   → 로컬 즐겨찾기 초기화.
//  - 로그인 + owner 없음(익명)    → 입양: 로컬 ∪ 서버 합집합을 양쪽에 반영 (비로그인 별표 UX 보존).
//  - 로그인 + owner 다른 계정     → 교체: 로컬 버리고 그 계정의 서버 팔로우로 내려받기.
// 로컬 → 서버 PUT 은 canPushFavorites()(owner == 닉네임)일 때만 — pull 완료 전 레이스로
// 이전 로컬이 서버를 덮는 것을 차단한다.
// 한계. 서버(UserMatchFollow)는 숫자 Match.id 만 저장 — ts-/ESPN 문자열 id 경기는
// 계정 전환·새 기기에서 복원되지 않는다(입양 경로에선 로컬에 유지).

import {
  replaceFavMatches,
  readFavIds,
  readFavMeta,
  type FavMeta,
} from "./useFavorites";
import { replaceFavTeams, readFavTeams, type FavTeam } from "./useFavoriteTeams";
import { replaceFavLeagues, readFavLeagues } from "./useFavoriteLeagues";

const OWNER_KEY = "scorebase:fav-owner";

function readOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function writeOwner(nickname: string | null): void {
  try {
    if (nickname) localStorage.setItem(OWNER_KEY, nickname);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    // localStorage 불가(시크릿 등) — 무시
  }
}

function readMyNickname(): string | null {
  try {
    const raw = localStorage.getItem("sb:me"); // use-me 의 세션 캐시
    if (!raw) return null;
    const me = JSON.parse(raw) as { nickname?: string | null };
    return me?.nickname ?? null;
  } catch {
    return null;
  }
}

/** 로컬 → 서버 PUT 허용 여부 — 로컬 즐겨찾기가 현재 로그인 계정 소유일 때만. */
export function canPushFavorites(): boolean {
  const nickname = readMyNickname();
  return Boolean(nickname) && readOwner() === nickname;
}

// === 서버 왕복 ===

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null; // 401(세션 무효)·5xx — 이번 전환은 중단, 다음 확정 때 재시도
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

function putJson(url: string, body: unknown): void {
  fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/** 숫자 id 경기의 표시 메타를 서버에서 재구성 — pull 로 받은 경기도 PiP·마이페이지에 보이게. */
async function buildMatchMeta(ids: string[]): Promise<Record<string, FavMeta>> {
  const numeric = ids.filter((id) => /^\d+$/.test(id));
  if (numeric.length === 0) return {};
  const d = await getJson<{
    matches?: Array<{
      id: number;
      league: string;
      externalId: string;
      status: string;
      startTime: string;
      homeName: string;
      awayName: string;
      homeScore: number | null;
      awayScore: number | null;
    }>;
  }>(`/api/matches/by-ids?ids=${numeric.join(",")}`);
  if (!d?.matches) return {};
  const meta: Record<string, FavMeta> = {};
  for (const m of d.matches) {
    const status =
      m.status === "LIVE"
        ? "live"
        : m.status === "FINISHED"
          ? "finished"
          : m.status === "POSTPONED"
            ? "postponed"
            : "scheduled";
    meta[String(m.id)] = {
      id: String(m.id),
      sport: "",
      league: m.league,
      homeName: m.homeName,
      awayName: m.awayName,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status,
      startTime: m.startTime,
      href: `/live/${m.league}/${m.externalId}`,
    };
  }
  return meta;
}

/** 팀 id 목록 → 이름·리그를 서버에서 채운 FavTeam 목록. 조회 실패한 id 는 빈 이름으로 유지. */
async function buildTeams(ids: number[], local: FavTeam[]): Promise<FavTeam[]> {
  const localById = new Map(local.map((t) => [t.id, t]));
  const infoById = new Map<number, { name: string; league: string }>();
  if (ids.length > 0) {
    const d = await getJson<{ teams?: Array<{ id: number; name: string; league: string }> }>(
      `/api/teams/by-ids?ids=${ids.join(",")}`,
    );
    for (const t of d?.teams ?? []) infoById.set(t.id, { name: t.name, league: t.league });
  }
  return ids.map((id) => {
    const info = infoById.get(id);
    const loc = localById.get(id);
    return {
      id,
      name: info?.name ?? loc?.name ?? "",
      league: info?.league ?? loc?.league ?? "",
    };
  });
}

async function doSync(nickname: string | null): Promise<void> {
  const owner = readOwner();
  if (owner === nickname) return;

  // 로그아웃 확정 — 계정 소유 즐겨찾기를 브라우저에 남기지 않는다.
  if (!nickname) {
    if (owner) {
      replaceFavMatches([], {});
      replaceFavTeams([]);
      replaceFavLeagues([]);
      writeOwner(null);
    }
    return; // owner 도 없으면 익명 로컬 즐겨찾기 — 그대로 둔다
  }

  // 로그인 — 그 계정의 서버 팔로우를 내려받는다. 실패 시 owner 미변경으로 중단(다음 확정 때 재시도).
  const [matchRes, teamRes, leagueRes] = await Promise.all([
    getJson<{ matchIds?: number[] }>("/api/favorites/matches"),
    getJson<{ teamIds?: string[] }>("/api/favorites/teams"),
    getJson<{ leagues?: string[] }>("/api/favorites/leagues"),
  ]);
  if (!matchRes || !teamRes) return;
  const serverLeagues = (leagueRes?.leagues ?? []).filter((x): x is string => typeof x === "string");
  const serverMatchIds = (matchRes.matchIds ?? []).map(String);
  const serverTeamIds = (teamRes.teamIds ?? [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

  if (owner) {
    // 계정 전환 — 이전 계정 로컬은 버리고 서버 세트로 교체. union 금지(계정 간 오염 방지 핵심).
    const meta = await buildMatchMeta(serverMatchIds);
    replaceFavMatches(serverMatchIds, meta);
    replaceFavTeams(await buildTeams(serverTeamIds, []));
    replaceFavLeagues(serverLeagues);
    writeOwner(nickname);
    return;
  }

  // 익명 → 로그인 입양 — 비로그인으로 찍은 별표를 계정에 합치고, 서버 세트도 로컬로 복원.
  const localMatchIds = [...readFavIds()];
  const localTeams = readFavTeams();
  const matchIds = [...new Set([...localMatchIds, ...serverMatchIds])];
  const teamIds = [...new Set([...localTeams.map((t) => t.id), ...serverTeamIds])];

  const pulled = await buildMatchMeta(matchIds);
  replaceFavMatches(matchIds, { ...pulled, ...readFavMeta() }); // 로컬 스냅샷(ts- 포함) 우선
  replaceFavTeams(await buildTeams(teamIds, localTeams));
  const leagues = [...new Set([...readFavLeagues(), ...serverLeagues])];
  replaceFavLeagues(leagues);
  writeOwner(nickname);

  // 합집합을 서버에도 반영 — 숫자 id 만 저장되는 건 라우트가 걸러준다.
  putJson("/api/favorites/matches", { matchIds });
  putJson("/api/favorites/teams", { teamIds });
  putJson("/api/favorites/leagues", { leagues });
}

// 동시 실행 가드 — 진행 중이면 마지막 요청만 보관했다가 끝나고 이어서 처리.
let inFlight: Promise<void> | null = null;
let queued: string | null | undefined; // undefined = 대기 없음

/**
 * /api/me 확정(로그인·로그아웃) 시마다 호출 — use-me 의 commit 훅.
 * fire-and-forget. owner 와 같으면 즉시 반환이라 라우트 이동마다 불려도 저렴하다.
 */
export function syncFavoritesToAccount(nickname: string | null): void {
  if (typeof window === "undefined") return;
  if (inFlight) {
    queued = nickname;
    return;
  }
  inFlight = doSync(nickname)
    .catch(() => {})
    .finally(() => {
      inFlight = null;
      if (queued !== undefined) {
        const next = queued;
        queued = undefined;
        syncFavoritesToAccount(next);
      }
    });
}
