// 리그 시즌 리더보드 데이터 — leagueLeader 테이블에서 최신 시즌만 카테고리별로 묶어 반환.
// standings/[league] 가 LeagueLeaderBoard 렌더에 사용.
// (predictions/[league] 는 빅5 ts 시즌통계 덮어쓰기 분기가 있어 자체 inline 유지 — 추후 통합 후보.)
import { prisma } from "@/lib/db";
import { toKoreanPlayerName } from "@/lib/player-names";
import { toKoreanTeamName } from "@/lib/team-names";
import { toEnglishTeamName } from "@/lib/i18n/en";
import { afPlayerToTs } from "@/lib/players/ts-af-map";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { fetchStandingsForLeague } from "@/lib/sports/thesports/standings-fetch";
import type { LeaderRow } from "@/components/LeagueLeaderBoard";
import { attachLeaderTeamLogos } from "@/lib/leaderboard-logos";
import { isStaleSeason } from "@/lib/sports/current-season-label";

// LeagueLeaderBoard 가 리그 이름만 보고 /transfers/{id} 로 링크하는 리그.
// leagueLeader 테이블의 externalId 는 api-football player id 인데 /transfers 페이지는 TheSports
// player id 만 조회 → 변환 없이 넘기면 /transfers/{afId} 가 전부 404. af→ts 로 변환해서 넘긴다.
// (변환 실패 선수는 null → 링크 비활성. predictions/[league] 는 자체 ts id 라 이 함수를 안 씀.)
const TRANSFERS_LEADER_LEAGUES = new Set(["EPL", "LALIGA", "BUNDESLIGA", "LIGUE_1", "WORLD_CUP"]);

const isAfId = (id: string) => /^\d+$/.test(id);

/**
 * 새 시즌 개막 대기 상태 판정 — ts 순위표가 0전적이면 이번 시즌 기록이 존재할 수 없다.
 * 그대로 두면 0-0 순위표 밑에 지난 시즌 득점왕이 붙는다(2026-08-14 챔피언십 실측).
 *
 * 시즌 라벨 비교(seasonLabelFor)로 판정하면 안 된다 — NBA·NHL·ROMANIA_L2 등에서 기대
 * 라벨과 저장 라벨이 어긋나(기대 2026 vs 저장 2026-27) 멀쩡한 리더보드까지 지운다.
 * "현재 시즌 완료매치 0" 으로 판정해도 EGYPT_PL·GHANA_PL 등 7개가 휩쓸린다(실측).
 * ts 0전적 + 매핑 90% 는 순위표가 0전적 표를 그리는 조건과 같아 판정이 정확히 일치한다.
 */
async function isPreSeasonZeroTable(league: string): Promise<boolean> {
  if (!SOCCER_LEAGUES.has(league)) return false;
  const ts = await fetchStandingsForLeague(league);
  const t0 = ts?.tables?.[0];
  if (!t0 || t0.rows.length === 0) return false;
  if (!t0.rows.every((r) => r.total === 0)) return false;
  const mapped = t0.rows.filter((r) => r.ourTeamId != null).length / t0.rows.length;
  return mapped >= 0.9;
}

/**
 * @param seasonOverride 특정 시즌을 지정해 읽는다 (개막 전 "지난 시즌 최종 기록" 노출용).
 *   지정하면 preSeason 가드를 건너뛴다 — 가드는 "현재 시즌 기록이 있을 리 없다"는 판정이라
 *   과거 시즌을 명시적으로 요청한 호출에는 해당하지 않는다.
 */
export async function loadLeagueLeaderboard(
  league: string,
  seasonOverride?: string,
  // locale='en' 이면 선수·팀명 한글 변환을 건너뛴다 (DB 원본이 영문).
  // standings-overview 의 StandingsLocale 과 같은 규칙.
  locale: "ko" | "en" = "ko",
): Promise<{
  rowsByCategory: Record<string, LeaderRow[]>;
  season: string;
  preSeason: boolean;
  /** 개막했지만 이번 시즌 기록이 아직 없어 노출을 보류한 지난 시즌 라벨. 없으면 null. */
  staleSeason: string | null;
}> {
  // 한 리그에 여러 시즌이 누적될 수 있어 최신 시즌만 노출 (중복 방지).
  const allRows = await prisma.leagueLeader.findMany({
    where: { league, ...(seasonOverride ? { season: seasonOverride } : {}) },
    orderBy: [{ season: "desc" }, { category: "asc" }, { rank: "asc" }],
    take: 400,
  });
  const season = seasonOverride ?? allRows[0]?.season ?? "";
  if (!seasonOverride && allRows.length > 0) {
    if (await isPreSeasonZeroTable(league)) {
      return { rowsByCategory: {}, season, preSeason: true, staleSeason: season };
    }
    // 개막 직후 며칠 — 순위표에 전적이 생겨 preSeason 가드는 풀렸는데 leagueLeader 는
    // MIN_LEADERS(5) 게이트에 막혀 아직 이번 시즌 행이 없다. 그대로 두면 지난 시즌
    // 득점왕이 "{지난시즌} 시즌 · 매일 자동 갱신" 라벨을 달고 현재 기록처럼 나간다
    // (2026-08-22 EPL·리그1 실측 — 35경기·38경기 출전 표가 개막 이튿날 노출).
    if (await isStaleSeason(league, season)) {
      return { rowsByCategory: {}, season, preSeason: false, staleSeason: season };
    }
  }
  const rows = allRows.filter((r) => r.season === season);
  const useTransfers = TRANSFERS_LEADER_LEAGUES.has(league);

  // externalId 정규화 — 컴포넌트의 링크 판정("축구 리그 + 비숫자 id = ts id → /transfers")과 짝.
  // 확장 축구 리그는 af 매핑 유무에 따라 ts id / af id 가 섞여 저장되므로 여기서 ts 로 모은다.
  // 매핑이 없으면 af id 를 그대로 둬서 /players af 뷰로 폴백 (SERIE_A·MLS·UCL 등).
  const tsCandidate = new Map<string, string>(); // 저장된 externalId → ts player id
  if (SOCCER_LEAGUES.has(league)) {
    for (const r of rows) {
      if (!r.externalId) continue;
      const ts = isAfId(r.externalId) ? afPlayerToTs(r.externalId) : r.externalId;
      if (ts) tsCandidate.set(r.externalId, ts);
    }
  }
  // /transfers 는 TheSportsPlayer 행이 있어야 렌더 → 없는 id 는 링크에서 빼 404 를 막는다.
  const liveTs = new Set<string>();
  if (tsCandidate.size > 0) {
    const found = await prisma.theSportsPlayer.findMany({
      where: { id: { in: [...new Set(tsCandidate.values())] } },
      select: { id: true },
    });
    for (const f of found) liveTs.add(f.id);
  }
  const resolveExternalId = (raw: string | null): string | null => {
    if (!raw) return null;
    const ts = tsCandidate.get(raw);
    if (ts && liveTs.has(ts)) return ts;
    // 리그 이름만으로 /transfers 로 보내는 리그는 ts 확보 실패 시 링크를 끊어야 404 를 막는다.
    return useTransfers ? null : raw;
  };

  const rowsByCategory: Record<string, LeaderRow[]> = {};
  for (const r of rows) {
    // 영어판 — playerNameEn 이 없고 원본이 한글이면(KBO 등) 낼 이름이 없어 행을 건너뛴다.
    // 이름 없는 행을 남기면 리더보드가 빈칸으로 보인다.
    if (locale === "en" && !r.playerNameEn && /[가-힣]/.test(r.playerName)) continue;
    if (!rowsByCategory[r.category]) rowsByCategory[r.category] = [];
    rowsByCategory[r.category].push({
      rank: r.rank,
      playerName: locale === "en" ? (r.playerNameEn ?? r.playerName) : toKoreanPlayerName(r.playerName),
      playerNameEn: r.playerNameEn ?? r.playerName,
      teamName: locale === "en" ? toEnglishTeamName(r.teamName) : toKoreanTeamName(r.teamName, league),
      teamShort: r.teamShort,
      value: r.value,
      unit: r.unit,
      appearances: r.appearances,
      subLabel: locale === "en" ? translateSubLabel(r.subLabel) : (r.subLabel ?? null),
      photoUrl: r.photoUrl,
      externalId: resolveExternalId(r.externalId),
    });
  }
  // PC 중앙 컬럼용 팀 로고/국기 — 이름 매칭이라 미스는 로고 없이(정상), 실패해도 rows 원본 유지.
  await attachLeaderTeamLogos(league, rowsByCategory);
  return { rowsByCategory, season, preSeason: false, staleSeason: null };
}

// 보조 맥락(subLabel)은 한국어 고정 어휘로 저장된다 — EN 은 읽기 시점 용어 치환.
// 형식을 수집 잡이 통제하므로(전환율·성공률·태클 등) 단어 치환으로 충분하다.
const SUB_LABEL_EN: Array<[RegExp, string]> = [
  [/슛/g, "Shots"],
  [/득점/g, "Goals"],
  [/전환율/g, "Conv."],
  [/시도/g, "Att."],
  [/성공률/g, "Succ."],
  [/키패스/g, "Key passes"],
  [/도움/g, "Assists"],
  [/빅찬스/g, "Big chances"],
  [/태클/g, "Tackles"],
  [/인터셉트/g, "Int."],
  [/클리어/g, "Clr."],
  [/(\d+)분 출전/g, "$1 min played"],
];
function translateSubLabel(ko: string | null | undefined): string | null {
  if (!ko) return null;
  let out = ko;
  for (const [re, en] of SUB_LABEL_EN) out = out.replace(re, en);
  // 못 옮긴 한글이 남으면 그 문구는 숨긴다 — 영어판에 한글 노출 금지
  return /[가-힣]/.test(out) ? null : out;
}
