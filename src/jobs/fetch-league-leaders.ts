// 리그별 시즌 리더보드 fetch — 매일 1회 cron.
//
// 데이터 소스:
//   - 축구: ts season/recent/player/stat 라이브 (TS_PLAYER_STAT_LEAGUES) — 소스 1순위 원칙
//   - 축구 잔여(AFC_U23 등): API-Football topscorers fallback — 2026-06 말부터 사망 상태
//   - 월드컵: TheSports 집계 (getWorldCupPlayerStats)
//   - NBA: ESPN unofficial site v3 /leaders (경기당 pts · ast · reb · stl · blk — BDL plan 401 로 전환)
//   - NHL: 공식 NHL API /v1/skater-stats-leaders + /v1/goalie-stats-leaders
//   - MLB: MLB Stats API /v1/stats/leaders (타격 4 + 투구 4)
//   - KBO: koreabaseball.com (시즌 hitter/pitcher basic — ajax JSON)
//   - NPB: npb.jp/bis/{Y}/stats/{bat,pit}_{c,p}.html (양리그 합산 TOP)
//   - LOL/LCK: DB lolGames 자체 집계 (aggregateLolPlayers — BDL 키 사망으로 2026-08 교체)

import "@/lib/env";
import { readFileSync } from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  fetchSeasonTopScorers,
  fetchTopAssists,
  fetchTopYellowCards,
  fetchTopRedCards,
  type PlayerLeaderEntry,
  type TopScorerEntry,
} from "@/lib/sports/api-football-pro";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { lookupNbaPlayer } from "@/lib/sports/nba-players";
import { npbPlayerToKorean } from "@/lib/sports/npb-player-names";
import {
  fetchNpbPlayerIndex,
  findNpbPidByName,
  type NpbPlayerIndexEntry,
} from "@/lib/sports/npb-official";
import { getWorldCupPlayerStats } from "@/lib/sports/thesports/world-cup-player-stats";
import { aggregateLolPlayers } from "@/lib/sports/lol-player-stats";
import { TS_LOL_TEAMS } from "@/lib/sports/lol-thesports";
import { tsPlayerToAf } from "@/lib/players/ts-af-map";
import { fetchFootballSeasonPlayerStat } from "@/lib/sports/thesports/football-collector";
import { thesportsGet } from "@/lib/sports/thesports/client";
import tsLeagueMap from "@/lib/sports/thesports/league-id-mapping.json";
import tsTeamMap from "@/lib/sports/thesports/team-id-mapping.json";
import { TS_SHARED_SEASON_LEAGUES } from "@/lib/sports/season-calendar";

const TOP_N = 10;

interface UpsertInput {
  league: string;
  category: string;
  rank: number;
  playerName: string;
  playerNameEn?: string;
  externalId?: string;
  teamName: string;
  teamShort?: string;
  value: number;
  unit?: string;
  appearances?: number;
  subLabel?: string;
  photoUrl?: string;
  season: string;
}

/** upsert 쿼리만 만들고 await 하지 않는다 — $transaction 으로 묶어 왕복을 줄이는 경로용. */
function leaderUpsertOp(d: UpsertInput) {
  return prisma.leagueLeader.upsert({
    where: {
      league_category_rank_season: {
        league: d.league,
        category: d.category,
        rank: d.rank,
        season: d.season,
      },
    },
    update: {
      playerName: d.playerName,
      playerNameEn: d.playerNameEn,
      externalId: d.externalId,
      teamName: d.teamName,
      teamShort: d.teamShort,
      value: d.value,
      unit: d.unit,
      appearances: d.appearances,
      subLabel: d.subLabel ?? null,
      photoUrl: d.photoUrl,
      fetchedAt: new Date(),
    },
    create: d,
  });
}

async function upsertLeader(d: UpsertInput) {
  await leaderUpsertOp(d);
}

async function clearOldRanks(
  league: string,
  category: string,
  season: string,
  keepFromRank: number,
) {
  await prisma.leagueLeader.deleteMany({
    where: { league, category, season, rank: { gt: keepFromRank } },
  });
}

/** 미래 라벨로 잘못 저장된 잔존 행만 제거 (NHL "2026-27" 조기 오라벨 같은 것).
 *  과거 시즌 행은 보존한다 — 위키형 축적: 시즌별 득점왕이 역사로 남는다.
 *  (이전에는 현재 시즌 외 전부 삭제 — 롤오버 때 지난 시즌 리더가 통째로 사라지는 새는 곳이었다.
 *   표시층은 전부 최신 시즌 필터/정렬 확인: predictions=latestSeason 필터·autocomplete=이름 dedup·
 *   free-board-bot=season desc 정렬. 라벨 형식이 리그 안에서 균일해 문자열 비교로 미래 판정 가능.) */
async function clearFutureSeasons(league: string, currentSeason: string) {
  const res = await prisma.leagueLeader.deleteMany({
    where: { league, season: { gt: currentSeason } },
  });
  if (res.count > 0) {
    console.log(`[leaders/${league}] removed ${res.count} future-labeled rows (season > ${currentSeason})`);
  }
}

/* ============================================================
 * 축구 클럽리그 (TheSports 시즌통계 = data/player-season-stats.json)
 *
 * api-football 키 만료(2026-07)로 클럽리그 리더를 TheSports 시즌통계로 이관.
 * predictions/[league] 가 이미 빅5 리더보드에 쓰는 것과 동일 소스·동일 이름 규칙.
 * - externalId 는 af id 우선(tsPlayerToAf) — 매핑 없으면 ts id. ballon 병합·평점 조회 위해.
 * - 저장 시즌 라벨은 데이터 자체의 s.season 사용 → 8월 2026-27 전환 시 자동 정합.
 *   (2025-26 최종 데이터는 시즌별 보존 — 과거 시즌 삭제 없음, ballon 심사창·위키 축적 겸용.)
 * - 커버리지가 충분한 리그만(allowlist), 그중 카테고리당 리더 <5 면 skip → 기존 데이터 보존.
 * - season-stats 미커버 리그(UCL/UEL/컵 등)는 순회 대상이 아니므로 기존 행 그대로 유지.
 * ==========================================================*/

// 리더 발행 대상 축구 리그 전체. season-stats 커버 리그는 ts, 나머지는 api-football fallback.
const SOCCER_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "WORLD_CUP",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "AFC_CL", "AFC_CL_TWO", "AFC_U23", "SAUDI_PL",
  "ASEAN_CHAMP",
  "UEL", "UECL",
  "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
  "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL",
  "BRASILEIRAO", "LIGA_MX", "COPA_LIB", "COPA_SUD",
  "CSL", "A_LEAGUE",
  "CLUB_WORLD_CUP",
  // 2026-08-02 확장 리그 — 소스는 전부 ts(TS_PLAYER_STAT_LEAGUES). 값 0 행은 필터가
  // 걸러내므로 기록이 아예 없는 리그는 카테고리 자체가 안 나간다(빈 표 방지).
  "WALES_PL", "MONTENEGRO_1L", "FAROE_PL",
  "PANAMA_LPF", "ELSALVADOR_PD", "NICARAGUA_PD",
  "RUSSIA_FNL", "ROMANIA_L2",
  "COSTA_RICA_PD", "GUATEMALA_LN", "HONDURAS_LN",
  "UZBEKISTAN_SL", "MEXICO_2", "CHINA_3", "COPA_DO_BRASIL",
  // 2026-08-02 2차 — 리더보드 미보유 59개 (TS_PLAYER_STAT_LEAGUES 와 동일 목록)
  "ARMENIA_PL", "AUSTRIA_BL", "BULGARIA_PL", "CHALLENGE_LEAGUE", "CZECH_L",
  "DENMARK_SL", "EGYPT_PL", "EKSTRAKLASA", "HUNGARY_NB1", "INDIA_ISL",
  "INDONESIA_L1", "LIGA_I", "MOLDOVA_SL", "MOROCCO_BP", "POLAND_1L",
  "SERBIA_SL", "SLOVAKIA_SL", "SLOVENIA_SNL", "SOUTHAFRICA_PSL", "SWISS_SL",
  "UKRAINE_PL", "SCOT_CHAMPIONSHIP", "SCOT_LEAGUE_ONE", "SCOT_LEAGUE_TWO",
  "RPL", "ALGERIA_L1", "GHANA_PL",
  "ALLSVENSKAN", "CANADA_PL", "CHILE_PB", "CHILE_PD", "COLOMBIA_PA",
  "ECUADOR_LP", "ELITESERIEN", "ESTONIA_ML", "GEORGIA_EL", "ICELAND_1L",
  "IRELAND_PD", "LATVIA_VL", "LITHUANIA_AL", "NORWAY_1L", "PERU_PD",
  "SUPERETTAN", "URVALSDEILD", "USA_USL_CH", "VEIKKAUSLIIGA", "YKKOSLIIGA", "VENEZUELA_PD",
  "VIETNAM_VL1", "YKKONEN", "ARGENTINA_PL", "ARG_PRIMERA_NACIONAL", "CHINA_2",
  "BOLIVIA_PD", "URUGUAY_PD", "NWSL", "KAZAKHSTAN_PL", "BELARUS_PL", "PARAGUAY_PD",
  "BRASILEIRAO_2",
  // 2026-08-16 3차 — 리더보드 미보유 잔여 리그 전수 실측(ts cur_season_id 기준)으로 추가.
  // 데이터 보유: 잉글랜드 3~5부·유럽 2부 8종·보스니아·UAE·리그스컵·룩셈부르크(재실측 197행).
  // 개막 전 0행(개막하면 자동 적재): 알바니아·키프로스·크로아티아·이스라엘·카타르·태국·
  // 아제르바이잔·싱가포르·이라크. WK리그는 시즌 중인데 0행 = ts 미커버라 제외.
  "LEAGUE_ONE", "LEAGUE_TWO", "NATIONAL_LEAGUE",
  "AUSTRIA_2", "BELGIUM_2", "CZECH_2", "DENMARK_2", "EREDIVISIE_2",
  "HUNGARY_2", "IRELAND_2", "PRIMEIRA_LIGA_2", "TURKEY_2",
  "BOSNIA_PL", "UAE_PL", "LEAGUES_CUP", "LUXEMBOURG_ND",
  "ALBANIA_SL", "CYPRUS_1D", "HNL", "ISRAEL_PL", "QATAR_SL", "THAI_L1",
  "AZERBAIJAN_PL", "SINGAPORE_PL", "IRAQ_SL",
  // 2026-08-22 국내컵 — 리그 페이지 통계 탭에 컵 득점왕을 내기 위해 등록. ts 실측(행·득점자):
  // EFL컵 1425·85, 스코 리그컵 1029·187, 코파 델 레이 2811·299(아직 2025-26 current),
  // 코파 이탈리아 877·56, DFB 포칼 160·14, 쿠프 드 프랑스 3450·301(2025-26), CONCACAF 챔스 695·90.
  // FA컵·천황배는 has_player_stats=0, AFC_CUP 은 2023-24 에 멈춰 제외.
  "EFL_CUP", "SCO_LEAGUE_CUP", "COPA_DEL_REY", "COPPA_ITALIA", "DFB_POKAL", "COUPE_DE_FRANCE", "CONCACAF_CCUP",
];

// ts 시즌 선수통계를 리그 1콜로 직접 받는 리그 (2026-08-02 도입).
// 과거의 정적 JSON 경로(data/player-season-stats.json, SEASON_STATS_LEAGUES)는 주간 빌더
// 재실행·커밋 전까지 동결되는 구조라 단계적으로 전부 이쪽으로 이전 — 2026-08-08 분데스2,
// 08-16 유럽 시즌제 9종(2026-27 개막 후 지난 시즌 동결), 같은 날 달력연도 4종
// (K리그1/2·MLS·브라질레이랑 — 주간 갱신 2주 누락으로 K리그1 득점왕이 실제와 다르게
// 표시된 것이 확인돼 이전, 정적 경로 코드는 제거)까지 완료. 이쪽은 cron 이 매번 호출하므로
// 항상 최신이다.
//
// ⚠️ 같은 리그를 ts·af 두 소스로 채우면 값이 어긋난다(팀순위 이중소스 사고와 같은 원인).
// 여기 등록한 리그는 af fallback 을 절대 타지 않는다 — runSoccer 분기가 단일 소스를 보장.
// 등록 기준: ts season/recent/player/stat 실측으로 행이 존재하는 리그. LUXEMBOURG_ND 는
// ts 0행이라 제외(= af 로 메우는 갭), PORTUGAL_SUPER_CUP 은 단일 경기라 리더보드 무의미.
const TS_PLAYER_STAT_LEAGUES = new Set([
  "BUNDESLIGA_2", // 2026-08-08 정적 JSON 에서 이동 — 위 주석 참고
  "K_LEAGUE_1", "K_LEAGUE_2", "MLS", "BRASILEIRAO", // 2026-08-16 정적 JSON 마지막 4종 이전
  // 2026-08-15 af fallback 잔존 리그 일괄 이전 — af 리더 엔드포인트 사망(6월 말~)으로
  // J1 리더보드가 아예 비어 있었다(사용자 신고). ts season/recent/player/stat 전수 실측:
  // J1 413행·득점자 37, UCL 1164행·167, UEL 1003행·111, UECL 3198행·443, CSL 510행·156,
  // COPA_LIB 956행·153, COPA_SUD 1205행·188, AFC_CL 177행·9, AFC_CL_TWO 88행·8,
  // CHAMPIONSHIP 40행·4(개막 직후 — MIN_LEADERS 가드가 채워질 때까지 보류),
  // GREEK_SL·A_LEAGUE 0행(개막 전 — 개막하면 자동 적재).
  // J2 는 2026-08-16 등록 — tsSeasonId 복구(빌더 NO_SEASON_ID 해제, af 매치 수집은
  // TS_COVERED_EXCEPTIONS 가 보호). 2026-27 실측 430행·득점자 38.
  // ASEAN_CHAMP 도 동시 등록 — 2026 대회 실측 285행·득점자 51.
  "J1_LEAGUE", "J2_LEAGUE", "ASEAN_CHAMP", "AFC_CL", "AFC_CL_TWO", "UCL", "UEL", "UECL",
  "CHAMPIONSHIP", "GREEK_SL", "CSL", "COPA_LIB", "COPA_SUD", "A_LEAGUE",
  // 2026-08-09 af fallback 에서 이동 — af 리더 엔드포인트가 6월 말부터 죽어(fetched 945h)
  // 개막 후에도 2025-26 리더보드가 그대로였다(사용자 신고: 에레디비시). 6개 전부
  // ts season/recent/player/stat 실측 통과(득점자 8~61명).
  "EREDIVISIE", "PRIMEIRA_LIGA", "JUPILER_PL", "LIGUE_2", "SPL", "LIGA_MX",
  // 2026-08-16 정적 JSON 에서 이동 — 2026-27 개막 후에도 지난 시즌 동결 (SEASON_STATS_LEAGUES 주석).
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "LALIGA_2", "SAUDI_PL", "SUPER_LIG", "SERIE_B",
  // 2026-08-16 3차 신규 (SOCCER_LEAGUES 주석 참고 — 실측 근거 동일)
  "LEAGUE_ONE", "LEAGUE_TWO", "NATIONAL_LEAGUE",
  "AUSTRIA_2", "BELGIUM_2", "CZECH_2", "DENMARK_2", "EREDIVISIE_2",
  "HUNGARY_2", "IRELAND_2", "PRIMEIRA_LIGA_2", "TURKEY_2",
  "BOSNIA_PL", "UAE_PL", "LEAGUES_CUP", "LUXEMBOURG_ND",
  "ALBANIA_SL", "CYPRUS_1D", "HNL", "ISRAEL_PL", "QATAR_SL", "THAI_L1",
  "AZERBAIJAN_PL", "SINGAPORE_PL", "IRAQ_SL",
  // 2026-08-22 국내컵 — 리그 페이지 통계 탭에 컵 득점왕을 내기 위해 등록. ts 실측(행·득점자):
  // EFL컵 1425·85, 스코 리그컵 1029·187, 코파 델 레이 2811·299(아직 2025-26 current),
  // 코파 이탈리아 877·56, DFB 포칼 160·14, 쿠프 드 프랑스 3450·301(2025-26), CONCACAF 챔스 695·90.
  // FA컵·천황배는 has_player_stats=0, AFC_CUP 은 2023-24 에 멈춰 제외.
  "EFL_CUP", "SCO_LEAGUE_CUP", "COPA_DEL_REY", "COPPA_ITALIA", "DFB_POKAL", "COUPE_DE_FRANCE", "CONCACAF_CCUP",
  "WALES_PL", "MONTENEGRO_1L", "FAROE_PL",
  "PANAMA_LPF", "ELSALVADOR_PD", "NICARAGUA_PD",
  "RUSSIA_FNL", "ROMANIA_L2",
  "COSTA_RICA_PD", "GUATEMALA_LN", "HONDURAS_LN",
  "UZBEKISTAN_SL", "MEXICO_2", "CHINA_3", "COPA_DO_BRASIL",
  // 2026-08-02 2차 — 리더보드가 아예 없던 리그 59개 (사용자 지적: /predictions/SWISS_SL 빈 화면).
  // ts 시즌 선수통계 전수 실측(득점자 5명 이상)으로 선별. 컵 대회는 시즌 라벨 체계가 리그와
  // 달라 오적재 위험이 있어 이번 배치에서 제외(FA컵·코파 델 레이 등).
  "ARMENIA_PL", "AUSTRIA_BL", "BULGARIA_PL", "CHALLENGE_LEAGUE", "CZECH_L",
  "DENMARK_SL", "EGYPT_PL", "EKSTRAKLASA", "HUNGARY_NB1", "INDIA_ISL",
  "INDONESIA_L1", "LIGA_I", "MOLDOVA_SL", "MOROCCO_BP", "POLAND_1L",
  "SERBIA_SL", "SLOVAKIA_SL", "SLOVENIA_SNL", "SOUTHAFRICA_PSL", "SWISS_SL",
  "UKRAINE_PL", "SCOT_CHAMPIONSHIP", "SCOT_LEAGUE_ONE", "SCOT_LEAGUE_TWO",
  "RPL", "ALGERIA_L1", "GHANA_PL",
  "ALLSVENSKAN", "CANADA_PL", "CHILE_PB", "CHILE_PD", "COLOMBIA_PA",
  "ECUADOR_LP", "ELITESERIEN", "ESTONIA_ML", "GEORGIA_EL", "ICELAND_1L",
  "IRELAND_PD", "LATVIA_VL", "LITHUANIA_AL", "NORWAY_1L", "PERU_PD",
  "SUPERETTAN", "URVALSDEILD", "USA_USL_CH", "VEIKKAUSLIIGA", "VENEZUELA_PD",
  "VIETNAM_VL1", "YKKONEN", "ARGENTINA_PL", "ARG_PRIMERA_NACIONAL", "CHINA_2",
  "BOLIVIA_PD", "URUGUAY_PD", "NWSL", "KAZAKHSTAN_PL", "BELARUS_PL", "PARAGUAY_PD",
  "BRASILEIRAO_2",
]);

/** 리그별 시즌. 단일 대회 → 마지막 개최 연도, 달력 연도 vs 유럽 8-5월 시즌.
 *  health-checks 의 season-label 검사가 이 함수를 정본으로 import 한다 — 분류를 여기서만
 *  바꾸면 검사가 따라온다(두 벌로 두었더니 J리그 추춘제·UEFA 컵 7월 전환에서 어긋나 오탐). */
export function currentSoccerSeason(league: string): { season: number; label: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  // J1·J2 는 2026-27 추춘제 전환, AFC_CL 엘리트는 2024-25 부터 8~5월 — 유럽형 라벨(2026-27).
  const calendarYearLeagues = [
    "MLS", "K_LEAGUE_1", "K_LEAGUE_2", "WORLD_CUP",
    "BRASILEIRAO", "COPA_LIB", "COPA_SUD", "CSL",
    "ASEAN_CHAMP", // ts 시즌 year "2026" 실측 — 단기 국대 토너먼트라 달력연도 라벨
    "IRELAND_2", "LEAGUES_CUP", // 2026-08-16 3차 — ts year "2026" 실측 (ts 메타 라벨의 폴백용)
    "CONCACAF_CCUP", // 2026-08-22 — ts year "2026" 실측 (폴백용)

    // 2026-08-02 확장 리그 중 달력연도 시즌 (af /leagues 의 현시즌 start~end 실측 분류).
    // 중미 아페르투라(7~11월)·페로/중국/우즈벡(봄~가을)·파나마·코파 두 브라질이 여기 해당.
    "FAROE_PL", "PANAMA_LPF", "UZBEKISTAN_SL", "CHINA_3", "COPA_DO_BRASIL",
    "COSTA_RICA_PD", "GUATEMALA_LN", "HONDURAS_LN", "ELSALVADOR_PD", "NICARAGUA_PD",
    "MEXICO_2",
    // 2026-08-02 2차 — 봄~가을·달력연도 리그. 8~5월 리그를 여기 넣으면 라벨이 "2026" 이 돼
    // 기존 "2026-27" 행이 season desc 정렬에서 이겨 새 데이터가 안 보인다(분류 주의).
    "ALLSVENSKAN", "CANADA_PL", "CHILE_PB", "CHILE_PD", "COLOMBIA_PA",
    "ECUADOR_LP", "ELITESERIEN", "ESTONIA_ML", "GEORGIA_EL", "ICELAND_1L",
    "IRELAND_PD", "LATVIA_VL", "LITHUANIA_AL", "NORWAY_1L", "PERU_PD",
    "SUPERETTAN", "URVALSDEILD", "USA_USL_CH", "VEIKKAUSLIIGA", "VENEZUELA_PD",
    // VIETNAM_VL1 은 2026-08-16 제외 — V리그1 은 추춘제(9~6월)라 달력 분류가 오분류였다
    // (ts 메타 라벨 "2025-26" 과 이중 적재 실측). ts 메타가 정본이라 폴백도 유럽형이 맞다.
    "YKKONEN", "ARGENTINA_PL", "ARG_PRIMERA_NACIONAL", "CHINA_2",
    "BOLIVIA_PD", "URUGUAY_PD", "NWSL", "KAZAKHSTAN_PL", "BELARUS_PL", "PARAGUAY_PD",
    "BRASILEIRAO_2",
  ];
  if (league === "CLUB_WORLD_CUP") return { season: 2025, label: "2025" };
  if (league === "AFC_U23") return { season: 2025, label: "2025" };
  if (calendarYearLeagues.includes(league)) {
    return { season: y, label: String(y) };
  }
  // UEFA 컨티넨탈 컵도 7월 전환 (2026-08-15). 과거 9월 지연은 af 경로가 예선 득점자를
  // "같은 시즌 라벨"로 덮어써 직전 시즌 최종판을 파괴했기 때문인데(2026-07 실측),
  // ts 경로는 tsSeasonId 가 시즌을 확정하고 라벨이 시즌마다 달라 과거 행이 보존된다.
  // 9월 지연을 유지하면 ts 예선 데이터(2026-27)가 직전 시즌 라벨(2025-26)로 오적재된다.
  const startYear = m >= 7 ? y : y - 1;
  return { season: startYear, label: `${startYear}-${String(startYear + 1).slice(2)}` };
}

// api-football 리더 적재 (season-stats 미커버 리그). 새 시즌 개막 전이면 raw=0 →
// clearOldRanks 가 새 라벨에서만 동작해 기존 최종 데이터는 그대로 보존된다.
async function syncSoccerCategory(
  league: string,
  category: "GOAL" | "ASSIST" | "YELLOW" | "RED",
  season: number,
  seasonLabel: string,
  fetcher: (league: string, season: number) => Promise<PlayerLeaderEntry[] | TopScorerEntry[]>,
  unit: string,
): Promise<number> {
  const raw = await fetcher(league, season);
  // 값 0 행 제외 + 커버리지 게이트 — af 는 개막 전에도 선수 목록을 0값으로 반환해
  // (2026-08-15 J2 실측: 전원 0골 리더보드 적재) 그대로 쓰면 쓰레기 표가 나간다.
  // ts 경로(MIN_LEADERS)와 같은 기준으로 부족하면 skip — 기존 데이터 보존.
  const valOf = (p: PlayerLeaderEntry & { goals?: number }) =>
    category === "GOAL" && "goals" in p ? p.goals ?? 0 : (p as PlayerLeaderEntry).value;
  const nonZero = (raw as (PlayerLeaderEntry & { goals?: number })[]).filter((p) => valOf(p) > 0);
  if (nonZero.length < MIN_LEADERS) return 0;
  const top = nonZero.slice(0, TOP_N);
  for (let i = 0; i < top.length; i++) {
    const p = top[i];
    const value = valOf(p);
    await upsertLeader({
      league,
      category,
      rank: i + 1,
      playerName: toKoreanPlayerName(p.playerName) || p.playerName,
      playerNameEn: p.playerName,
      externalId: p.playerId ? String(p.playerId) : undefined,
      teamName: toKoreanTeamName(p.teamName) || p.teamName,
      value,
      unit,
      appearances: p.appearances,
      photoUrl: p.photoUrl,
      season: seasonLabel,
    });
  }
  await clearOldRanks(league, category, seasonLabel, top.length);
  return top.length;
}

// 카테고리별 리더가 이 수 미만이면 커버리지 부족으로 보고 skip (기존 데이터 보존).
//
// 2026-08-22 5 → 1. 이 하한이 막던 두 가지를 이제 다른 장치가 맡는다.
//   - 0값 쓰레기 표 → 위아래 경로 모두 값 > 0 필터를 먼저 통과시킨다.
//   - "얕은 새 시즌 표가 지난 시즌을 밀어냄" → 표시층의 시즌 라벨 가드
//     (lib/sports/current-season-label.ts)가 지난 시즌을 접기로 따로 보존한다.
// 하한만 남으니 개막전 1경기를 치른 리그가 "시작했는데 통계가 빈" 상태로 며칠 방치됐다
// (2026-08-22 사용자 신고 — EPL·리그1 개막 이튿날 득점자 3명이 게이트에 걸려 skip).
const MIN_LEADERS = 1;

type PlayerNameOverride = { nameKo?: string };

let playerOverridesCache: Record<string, PlayerNameOverride> | null = null;
function loadJsonSafe<T>(rel: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), rel), "utf-8")) as T;
  } catch {
    return fallback;
  }
}
function playerOverrides(): Record<string, PlayerNameOverride> {
  return (playerOverridesCache ??= loadJsonSafe("data/player-overrides.json", {}));
}

/** ts 시즌 uuid 의 실제 연도로 시즌 라벨 도출 — "2026-2027" → "2026-27", "2026" → "2026".
 *  달력 공식(currentSoccerSeason)으로 라벨을 매기면 매핑 시즌 id 가 구버전일 때 지난 시즌
 *  데이터가 새 시즌 라벨로 오적재된다(2026-08-16 실측: 이집트·인니·알제리·모로코 4개 리그가
 *  2025-26 데이터를 "2026-27" 로 저장). 데이터가 온 시즌의 라벨을 정본으로 쓰면 이 클래스가
 *  원천 차단된다 — id 가 낡아도 지난 시즌 최종본이 제 라벨로 보존될 뿐이다. */
async function tsSeasonLabelOf(seasonId: string): Promise<string | null> {
  try {
    const meta = await thesportsGet<{ code: number; results?: Array<{ year?: string }> }>(
      "/v1/football/season/list",
      { uuid: seasonId },
    );
    const y = meta.results?.[0]?.year;
    if (!y) return null;
    const m = y.match(/^(\d{4})-(\d{4})$/);
    return m ? `${m[1]}-${m[2].slice(2)}` : y;
  } catch {
    return null;
  }
}

/** 이 리그에 속한 ts 팀 id — 저장소 JSON + DB TeamSourceId 양쪽 (수집 경로와 같은 출처). */
async function ourTsTeamIds(league: string): Promise<Set<string>> {
  const ids = new Set<string>(
    (tsTeamMap as Array<{ tsId: string; ourLeague: string }>)
      .filter((t) => t.ourLeague === league)
      .map((t) => t.tsId),
  );
  const rows = await prisma.teamSourceId.findMany({
    where: { league, source: "thesports" },
    select: { externalId: true },
  });
  for (const r of rows) ids.add(r.externalId);
  return ids;
}

// 축구 리더 주 경로 = ts season/recent/player/stat 직접 호출 (리그당 1콜) — 항상 최신.
// 한글 선수명은 TheSportsPlayer DB 에 있으면 쓰고, 없으면 ts 영문명 그대로 (하부리그는 미등재 다수).
async function syncLeagueFromTsPlayerStat(
  league: string,
  fallbackSeasonLabel: string,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const entry = (tsLeagueMap as Array<{ code: string; tsSeasonId?: string }>).find(
    (e) => e.code === league,
  );
  if (!entry?.tsSeasonId) return out;

  // 라벨은 ts 시즌 메타의 연도가 정본 — 달력 공식은 메타 조회 실패 시 폴백.
  const seasonLabel = (await tsSeasonLabelOf(entry.tsSeasonId)) ?? fallbackSeasonLabel;

  const res = await fetchFootballSeasonPlayerStat(entry.tsSeasonId);
  let rows = res.results ?? [];
  if (rows.length === 0) return out;

  // ts 한 시즌에 다른 티어 대회까지 담기는 리그는 우리 팀 선수만 남긴다.
  // 이 엔드포인트는 시즌 전체를 주므로 필터가 없으면 남의 대회 선수가 리더보드에 오른다
  // (2026-08-21 YKKONEN — 득점 Top10 중 7명이 4부 Kakkonen 선수였다).
  // 걸러낸 뒤 표본이 얕으면 아래 MIN_LEADERS 가드가 기존 표를 보존한다.
  if (TS_SHARED_SEASON_LEAGUES.has(league)) {
    const ours = await ourTsTeamIds(league);
    const before = rows.length;
    rows = rows.filter((r) => r.team?.id && ours.has(r.team.id));
    console.log(`[league-leaders/${league}] 다른 티어 선수 ${before - rows.length}행 제외 (남은 ${rows.length}행)`);
    if (rows.length === 0) return out;
  }

  // 평점은 비율 스탯이라 출전 게이트 필수 — 1경기 8.0 이 시즌 1위가 되지 않게.
  // 개막 직후에도 표가 서도록 절대값(5) 대신 리그 최다 출전의 절반(최소 2)으로 적응형.
  const maxCourt = rows.reduce((m, r) => Math.max(m, r.court ?? 0), 0);
  const ratingGate = Math.max(2, Math.ceil(maxCourt / 2));
  type StatRow = (typeof rows)[number];
  const cats: Array<{
    cat: string;
    unit: string;
    val: (r: StatRow) => number;
    /** 순위 대상 조건 — 기본 val>0 */
    ok?: (r: StatRow) => boolean;
    /** 값 옆 보조 맥락 — 전환율(득점/슈팅)·성공률(성공/시도) 등. null 이면 미표시 */
    sub?: (r: StatRow) => string | null;
  }> = [
    {
      cat: "GOAL", unit: "골", val: (r) => r.goals ?? 0,
      sub: (r) => ((r.shots ?? 0) > 0 ? `슛 ${r.shots} · 전환율 ${Math.round(((r.goals ?? 0) / r.shots!) * 100)}%` : null),
    },
    {
      cat: "ASSIST", unit: "도움", val: (r) => r.assists ?? 0,
      sub: (r) => ((r.key_passes ?? 0) > 0 ? `키패스 ${r.key_passes}` : null),
    },
    // 2026-08-30 확장 — ts 시즌 스탯 실응답에 있는 필드만 (경쟁사 FotMob·Sofascore 표준 세트).
    {
      cat: "SHOT_ON", unit: "회", val: (r) => r.shots_on_target ?? 0,
      // 유효슛 대비 득점 = 유효슛 전환율(on-target conversion)
      sub: (r) => `득점 ${r.goals ?? 0}${(r.shots_on_target ?? 0) > 0 ? ` · 전환율 ${Math.round(((r.goals ?? 0) / r.shots_on_target!) * 100)}%` : ""}`,
    },
    {
      cat: "DRIBBLE_SUCC", unit: "회", val: (r) => r.dribble_succ ?? 0,
      // 드리블 성공률(success rate) = 성공/시도
      sub: (r) => ((r.dribble ?? 0) > 0 ? `시도 ${r.dribble} · 성공률 ${Math.round(((r.dribble_succ ?? 0) / r.dribble!) * 100)}%` : null),
    },
    {
      cat: "CHANCE", unit: "회", val: (r) => r.key_passes ?? 0,
      sub: (r) => `도움 ${r.assists ?? 0}${(r.big_chance_created ?? 0) > 0 ? ` · 빅찬스 ${r.big_chance_created}` : ""}`,
    },
    {
      cat: "DEFENSE", unit: "회", val: (r) => (r.tackles ?? 0) + (r.interceptions ?? 0) + (r.clearances ?? 0),
      sub: (r) => `태클 ${r.tackles ?? 0} · 인터셉트 ${r.interceptions ?? 0} · 클리어 ${r.clearances ?? 0}`,
    },
    { cat: "SAVE", unit: "세이브", val: (r) => r.saves ?? 0 },
    {
      cat: "RATING",
      unit: "평점",
      val: (r) => +(((r.rating ?? 0) / Math.max(r.court ?? 1, 1)) / 100).toFixed(2),
      ok: (r) => (r.court ?? 0) >= ratingGate && (r.rating ?? 0) > 0,
      sub: (r) => ((r.minutes_played ?? 0) > 0 ? `${r.minutes_played}분 출전` : null),
    },
    { cat: "YELLOW", unit: "장", val: (r) => r.yellow_cards ?? 0 },
    { cat: "RED", unit: "장", val: (r) => r.red_cards ?? 0 },
  ];

  // 상위 후보의 한글명만 배치 조회 (전 리그 선수 전체를 조회하면 하부리그에서 수백 건이 된다).
  const candidateIds = [
    ...new Set(
      cats.flatMap((c) =>
        rows
          .filter((r) => (c.ok ? c.ok(r) : c.val(r) > 0))
          .sort((a, b) => c.val(b) - c.val(a))
          .slice(0, TOP_N)
          .map((r) => r.player?.id)
          .filter(Boolean) as string[],
      ),
    ),
  ];
  const known = candidateIds.length
    ? await prisma.theSportsPlayer.findMany({
        where: { id: { in: candidateIds } },
        select: { id: true, name: true, nameKo: true },
      })
    : [];
  const nm = new Map(known.map((p) => [p.id, p]));
  const ov = playerOverrides();

  // 리그당 1회 트랜잭션으로 묶는다 — 카테고리별로 낱개 await 하면 리그당 44 왕복이라
  // 리그 수가 늘자 cron maxDuration(300s)을 넘겼다 (2026-08-02 확장 시 실측 10분 초과).
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const c of cats) {
    // rating 은 x100 누적이라 court(출전)로 나눠야 평균 — tiebreak 에만 쓰므로 비율만 맞으면 된다.
    const top = rows
      .filter((r) => (c.ok ? c.ok(r) : c.val(r) > 0))
      .sort(
        (a, b) =>
          c.val(b) - c.val(a) ||
          (b.rating ?? 0) / Math.max(b.court ?? 1, 1) - (a.rating ?? 0) / Math.max(a.court ?? 1, 1),
      )
      .slice(0, TOP_N);
    // 커버리지 부족 → 기존 데이터 보존 (개막 직후 1~2골짜리 표가 지난 시즌을 밀어내지 않게).
    if (top.length < MIN_LEADERS) continue;

    for (let i = 0; i < top.length; i++) {
      const r = top[i];
      const pid = r.player?.id ?? "";
      const af = pid ? tsPlayerToAf(pid) : null;
      const koName = ov[pid]?.nameKo || nm.get(pid)?.nameKo || r.player?.name || "(미상)";
      ops.push(
        leaderUpsertOp({
          league,
          category: c.cat,
          rank: i + 1,
          playerName: koName,
          playerNameEn: r.player?.name ?? undefined,
          externalId: af ? String(af) : pid,
          teamName: toKoreanTeamName(r.team?.name ?? "", league) || r.team?.name || "",
          value: c.val(r),
          unit: c.unit,
          appearances: r.matches ?? undefined,
          subLabel: c.sub ? (c.sub(r) ?? undefined) : undefined,
          photoUrl: r.player?.logo || undefined,
          season: seasonLabel,
        }),
      );
    }
    ops.push(
      prisma.leagueLeader.deleteMany({
        where: { league, category: c.cat, season: seasonLabel, rank: { gt: top.length } },
      }),
    );
    out[c.cat] = top.length;
  }
  if (ops.length > 0) await prisma.$transaction(ops);
  return out;
}

// 월드컵 리더 = TheSports 집계(getWorldCupPlayerStats) 소스. api-football 은 월드컵 시즌 미제공/키
// 의존이라 사라짐(/ballon 월드컵 반복 소실 원인) → 이미 보유한 TheSports 데이터로 직접 적재.
// externalId 는 af id 우선(클럽 리그 리더와 병합·ballon 평점 조회 위해), 매핑 없으면 ts id.
async function syncWorldCupFromTheSports(seasonLabel: string): Promise<Record<string, number>> {
  const stats = await getWorldCupPlayerStats();
  const cats: Array<{ cat: "GOAL" | "ASSIST" | "YELLOW" | "RED"; unit: string; val: (s: (typeof stats)[number]) => number }> = [
    { cat: "GOAL", unit: "골", val: (s) => s.goals },
    { cat: "ASSIST", unit: "도움", val: (s) => s.assists },
    { cat: "YELLOW", unit: "장", val: (s) => s.yellow },
    { cat: "RED", unit: "장", val: (s) => s.red },
  ];
  const out: Record<string, number> = {};
  for (const c of cats) {
    const top = stats
      .filter((s) => c.val(s) > 0)
      .sort((a, b) => c.val(b) - c.val(a) || b.avgRating - a.avgRating)
      .slice(0, TOP_N);
    for (let i = 0; i < top.length; i++) {
      const s = top[i];
      const af = tsPlayerToAf(s.id);
      await upsertLeader({
        league: "WORLD_CUP",
        category: c.cat,
        rank: i + 1,
        playerName: s.name, // 이미 한글 우선
        playerNameEn: s.nameEn ?? undefined,
        externalId: af ? String(af) : s.id,
        teamName: toKoreanTeamName(s.country) || s.country,
        value: c.val(s),
        unit: c.unit,
        appearances: s.games,
        photoUrl: s.photo ?? undefined,
        season: seasonLabel,
      });
    }
    await clearOldRanks("WORLD_CUP", c.cat, seasonLabel, top.length);
    out[c.cat] = top.length;
  }
  return out;
}

// 리그 동시 처리 수. 순차로 돌면 리그당 ~11초(ts 응답 + 트랜잭션)라 110개에 20분이 걸려
// cron maxDuration(300s)을 넘긴다 (2026-08-02 실측). 리그끼리 의존이 없어 안전하게 겹칠 수 있다.
// ts/af rate limit 여유를 감안해 보수적으로 6.
const LEAGUE_CONCURRENCY = 6;

async function runSoccer() {
  const result: Record<string, Record<string, number>> = {};
  const queue = [...SOCCER_LEAGUES];
  const worker = async () => {
    for (;;) {
      const lg = queue.shift();
      if (!lg) return;
      result[lg] = {};
      try {
        // 월드컵 = TheSports 집계 (api-football 미제공 → /ballon 월드컵 소실 방지).
        if (lg === "WORLD_CUP") {
          result[lg] = await syncWorldCupFromTheSports(currentSoccerSeason(lg).label);
          continue;
        }
        // ts 시즌 선수통계 직접 호출 리그 — af 로 내려가지 않는다(이중 소스 금지).
        if (TS_PLAYER_STAT_LEAGUES.has(lg)) {
          result[lg] = await syncLeagueFromTsPlayerStat(lg, currentSoccerSeason(lg).label);
          continue;
        }
        // 나머지(J2·AFC_U23 등 ts 시즌통계 미커버) = api-football fallback.
        const { season, label } = currentSoccerSeason(lg);
        result[lg].GOAL = await syncSoccerCategory(lg, "GOAL", season, label, fetchSeasonTopScorers, "득점");
        result[lg].ASSIST = await syncSoccerCategory(lg, "ASSIST", season, label, fetchTopAssists, "도움");
        result[lg].YELLOW = await syncSoccerCategory(lg, "YELLOW", season, label, fetchTopYellowCards, "옐로");
        result[lg].RED = await syncSoccerCategory(lg, "RED", season, label, fetchTopRedCards, "레드");
      } catch (e) {
        console.warn(`[league-leaders/${lg}]`, (e as Error).message);
      }
    }
  };
  await Promise.all(Array.from({ length: LEAGUE_CONCURRENCY }, () => worker()));
  return { result };
}

/* ============================================================
 * NBA (ESPN unofficial site v3 leaders)
 * ==========================================================*/

// ESPN category name → 우리 카테고리 코드. value 는 경기당 평균 (프론트 decimals:1).
const NBA_CATS = [
  { espn: "pointsPerGame", code: "PTS", unit: "득점" },
  { espn: "assistsPerGame", code: "AST", unit: "도움" },
  { espn: "reboundsPerGame", code: "REB", unit: "리바" },
  { espn: "stealsPerGame", code: "STL", unit: "스틸" },
  { espn: "blocksPerGame", code: "BLK", unit: "블록" },
] as const;

interface EspnNbaLeaderEntry {
  value: number;
  athlete?: {
    displayName?: string;
    fullName?: string;
    headshot?: { href?: string };
  };
  team?: { displayName?: string; abbreviation?: string };
}

export async function runNba(seasonStartYear: number) {
  const seasonLabel = `${seasonStartYear}-${String(seasonStartYear + 1).slice(2)}`;
  const summary: Record<string, number> = {};
  // ESPN season 파라미터는 시즌 종료 연도 (2026-27 → 2027). seasontype=2 = 정규시즌
  // (생략 시 포스트시즌 중엔 플레이오프 리더가 나옴). 오프시즌에 미래 시즌 요청 시
  // categories 빈 배열 → 아래서 자연 skip.
  const espnSeason = seasonStartYear + 1;
  try {
    const r = await fetch(
      `https://site.api.espn.com/apis/site/v3/sports/basketball/nba/leaders?season=${espnSeason}&seasontype=2`,
      { cache: "no-store", signal: AbortSignal.timeout(15000) },
    );
    if (!r.ok) {
      console.warn(`[leaders/nba] ESPN leaders HTTP ${r.status} — skip`);
      return { season: seasonLabel, result: summary };
    }
    const data = (await r.json()) as {
      requestedSeason?: { year?: number };
      leaders?: { categories?: Array<{ name: string; leaders?: EspnNbaLeaderEntry[] }> };
    };
    // 응답 시즌이 요청과 다르면(폴백) 이전 시즌 데이터가 새 라벨로 저장되는 사고 방지
    if (data.requestedSeason?.year && data.requestedSeason.year !== espnSeason) {
      console.warn(`[leaders/nba] season mismatch: requested ${espnSeason}, got ${data.requestedSeason.year} — skip`);
      return { season: seasonLabel, result: summary };
    }
    const categories = data.leaders?.categories ?? [];
    for (const cat of NBA_CATS) {
      const top = (categories.find((c) => c.name === cat.espn)?.leaders ?? []).slice(0, TOP_N);
      for (let i = 0; i < top.length; i++) {
        const d = top[i];
        const fullName = (d.athlete?.displayName ?? d.athlete?.fullName ?? "").trim();
        if (!fullName) continue;
        // /players/[pid]?league=NBA 는 BDL id 기대 → 정적 사전(nba-players.json)으로 역매핑
        const bdlId = lookupNbaPlayer(fullName)?.bdlId;
        await upsertLeader({
          league: "NBA",
          category: cat.code,
          rank: i + 1,
          playerName: toKoreanPlayerName(fullName) || fullName,
          playerNameEn: fullName,
          externalId: bdlId != null ? String(bdlId) : undefined,
          teamName: toKoreanTeamName(d.team?.displayName ?? "") || d.team?.displayName || "",
          teamShort: d.team?.abbreviation,
          value: d.value,
          unit: cat.unit,
          season: seasonLabel,
          photoUrl: d.athlete?.headshot?.href,
        });
      }
      if (top.length > 0) {
        await clearOldRanks("NBA", cat.code, seasonLabel, top.length);
      }
      summary[cat.code] = top.length;
    }
  } catch (e) {
    console.warn("[leaders/nba] ESPN leaders", (e as Error).message);
  }
  // 오프시즌 빈 응답이면 삭제 없이 skip — 데이터 확보 시에만 stale 시즌 정리
  if (Object.values(summary).some((n) => n > 0)) {
    await clearFutureSeasons("NBA", seasonLabel);
  }
  return { season: seasonLabel, result: summary };
}

/* ============================================================
 * NHL (공식 API)
 * ==========================================================*/

const NHL_SKATER_CATS = [
  { cat: "goals", code: "GOAL_NHL", unit: "골" },
  { cat: "assists", code: "ASSIST_NHL", unit: "도움" },
  { cat: "points", code: "POINTS", unit: "포인트" },
] as const;
const NHL_GOALIE_CATS = [
  { cat: "savePctg", code: "SAVE_PCT", unit: "세이브%" },
] as const;

async function runNhl(seasonLabel: string) {
  // 공식 API "current" 리더는 오프시즌엔 직전 시즌 최종값을 반환한다. 달력 공식(m>=7)
  // 라벨을 그대로 쓰면 8월에 2025-26 데이터가 "2026-27" 로 오적재된다(2026-08-16 실측
  // 40행 — 맥데이비드 90도움이 26-27 라벨). standings/now 의 seasonId(예 20252026)가
  // 리더 데이터와 같은 시즌을 가리키므로 그걸 라벨 정본으로, 실패 시 달력 공식 폴백.
  try {
    const r = await fetch("https://api-web.nhle.com/v1/standings/now", { cache: "no-store" });
    if (r.ok) {
      const body = (await r.json()) as { standings?: Array<{ seasonId?: number }> };
      const sid = String(body.standings?.[0]?.seasonId ?? "");
      if (/^\d{8}$/.test(sid)) seasonLabel = `${sid.slice(0, 4)}-${sid.slice(6)}`;
    }
  } catch {
    /* 폴백: 인자로 받은 달력 공식 라벨 */
  }
  const summary: Record<string, number> = {};
  const fetchOne = async (
    base: "skater" | "goalie",
    cats: ReadonlyArray<{ cat: string; code: string; unit: string }>,
  ) => {
    for (const c of cats) {
      try {
        const r = await fetch(
          `https://api-web.nhle.com/v1/${base}-stats-leaders/current?categories=${c.cat}&limit=${TOP_N}`,
          { cache: "no-store" },
        );
        if (!r.ok) continue;
        const data = (await r.json()) as Record<
          string,
          Array<{
            id: number;
            firstName: { default: string };
            lastName: { default: string };
            teamAbbrev: string;
            teamName?: { default: string };
            headshot?: string;
            value: number;
          }>
        >;
        const arr = data[c.cat];
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const p = arr[i];
          const fullName = `${p.firstName?.default ?? ""} ${p.lastName?.default ?? ""}`.trim();
          const team = p.teamName?.default ?? p.teamAbbrev ?? "";
          await upsertLeader({
            league: "NHL",
            category: c.code,
            rank: i + 1,
            playerName: toKoreanPlayerName(fullName) || fullName,
            playerNameEn: fullName,
            externalId: String(p.id),
            teamName: toKoreanTeamName(team) || team,
            teamShort: p.teamAbbrev,
            value: p.value,
            unit: c.unit,
            photoUrl: p.headshot,
            season: seasonLabel,
          });
        }
        await clearOldRanks("NHL", c.code, seasonLabel, arr.length);
        summary[c.code] = arr.length;
      } catch (e) {
        console.warn(`[leaders/nhl-${base}] ${c.cat}`, (e as Error).message);
      }
    }
  };
  await fetchOne("skater", NHL_SKATER_CATS);
  await fetchOne("goalie", NHL_GOALIE_CATS);
  // NBA 와 동일 — 빈 결과 run 이 직전 시즌 리더보드를 지우지 않게 가드
  if (Object.values(summary).some((n) => n > 0)) {
    await clearFutureSeasons("NHL", seasonLabel);
  }
  return { season: seasonLabel, result: summary };
}

/* ============================================================
 * MLB (MLB Stats API)
 * ==========================================================*/

const MLB_CATS = [
  { cat: "homeRuns", code: "HR", unit: "홈런", group: "hitting", decimals: 0 },
  { cat: "battingAverage", code: "BA", unit: "타율", group: "hitting", decimals: 3 },
  { cat: "runsBattedIn", code: "RBI", unit: "타점", group: "hitting", decimals: 0 },
  { cat: "stolenBases", code: "SB", unit: "도루", group: "hitting", decimals: 0 },
  { cat: "earnedRunAverage", code: "ERA", unit: "ERA", group: "pitching", decimals: 2 },
  { cat: "wins", code: "WIN", unit: "승", group: "pitching", decimals: 0 },
  { cat: "strikeouts", code: "K", unit: "탈삼진", group: "pitching", decimals: 0 },
  { cat: "saves", code: "SAVE", unit: "세이브", group: "pitching", decimals: 0 },
] as const;

async function runMlb(season: number) {
  const summary: Record<string, number> = {};
  for (const c of MLB_CATS) {
    try {
      const url = `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=${c.cat}&season=${season}&sportId=1&limit=${TOP_N}&statGroup=${c.group}&leaderGameTypes=R`;
      const r = await fetch(url);
      if (!r.ok) continue;
      const data = (await r.json()) as {
        leagueLeaders?: Array<{
          leaders?: Array<{
            rank: number;
            value: string;
            person: { id: number; fullName: string };
            team?: { name?: string };
          }>;
        }>;
      };
      const leaders = data.leagueLeaders?.[0]?.leaders ?? [];
      for (const l of leaders.slice(0, TOP_N)) {
        // MLB Stats API 의 person id → 공식 헤드샷 URL 패턴 (213px)
        const photoUrl = l.person.id
          ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${l.person.id}/headshot/67/current`
          : undefined;
        await upsertLeader({
          league: "MLB",
          category: c.code,
          rank: l.rank,
          playerName: toKoreanPlayerName(l.person.fullName) || l.person.fullName,
          playerNameEn: l.person.fullName,
          externalId: String(l.person.id),
          teamName: toKoreanTeamName(l.team?.name ?? "") || l.team?.name || "",
          value: parseFloat(l.value),
          unit: c.unit,
          photoUrl,
          season: String(season),
        });
      }
      await clearOldRanks("MLB", c.code, String(season), leaders.length);
      summary[c.code] = leaders.length;
    } catch (e) {
      console.warn(`[leaders/mlb] ${c.cat}`, (e as Error).message);
    }
  }
  return { season: String(season), result: summary };
}

/* ============================================================
 * KBO (koreabaseball.com 시즌 stat)
 * ==========================================================*/

const KBO_HITTER_URL = "https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx";
const KBO_HITTER_URL_2 = "https://www.koreabaseball.com/Record/Player/HitterBasic/Basic2.aspx";
const KBO_PITCHER_URL = "https://www.koreabaseball.com/Record/Player/PitcherBasic/Basic1.aspx";

const KBO_HITTER_CATS = [
  { col: "AVG", code: "BA", unit: "타율", decimals: 3, ord: "DESC" },
  { col: "HR", code: "HR", unit: "홈런", decimals: 0, ord: "DESC" },
  { col: "RBI", code: "RBI", unit: "타점", decimals: 0, ord: "DESC" },
  { col: "SB", code: "SB", unit: "도루", decimals: 0, ord: "DESC" },
] as const;
const KBO_PITCHER_CATS = [
  { col: "ERA", code: "ERA", unit: "ERA", decimals: 2, ord: "ASC" },
  { col: "W", code: "WIN", unit: "승", decimals: 0, ord: "DESC" },
  { col: "SO", code: "K", unit: "탈삼진", decimals: 0, ord: "DESC" },
  { col: "SV", code: "SAVE", unit: "세이브", decimals: 0, ord: "DESC" },
] as const;

/** KBO 페이지의 hitter/pitcher 기본 표 — class="tData01 tt".
 *  player anchor 의 `playerId={id}` 도 함께 추출 (사진 URL 빌드용). */
async function fetchKboTable(
  url: string,
): Promise<Array<{ rank: number; player: string; team: string; playerId: string | null; cells: Record<string, string> }>> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return [];
    const html = await r.text();
    const $ = cheerio.load(html);
    // 표는 단순 `table` selector — class="tData01 tt" (확인된 구조)
    const table = $("table").filter((_, t) => $(t).find("tr").length > 5).first();
    if (table.length === 0) return [];
    const headers: string[] = [];
    table.find("tr").first().find("th").each((_, th) => {
      headers.push($(th).text().trim());
    });
    const rows: Array<{ rank: number; player: string; team: string; playerId: string | null; cells: Record<string, string> }> = [];
    table.find("tr").slice(1).each((_, tr) => {
      const $tr = $(tr);
      const tds = $tr.find("td").map((_, td) => $(td).text().trim()).get();
      if (tds.length < 4) return;
      const cells: Record<string, string> = {};
      for (let i = 0; i < headers.length && i < tds.length; i++) {
        cells[headers[i]] = tds[i];
      }
      // 선수명 셀 안의 anchor href 에서 playerId 추출
      const href = $tr.find("a[href*='playerId=']").first().attr("href") ?? "";
      const idMatch = href.match(/playerId=(\d+)/);
      const playerId = idMatch ? idMatch[1] : null;
      rows.push({
        rank: parseInt(tds[0], 10) || 0,
        player: cells["선수명"] ?? tds[1] ?? "",
        team: cells["팀명"] ?? tds[2] ?? "",
        playerId,
        cells,
      });
    });
    return rows;
  } catch (e) {
    console.warn(`[leaders/kbo] ${url}`, (e as Error).message);
    return [];
  }
}

/** KBO 공식 선수 사진 CDN URL (네이버 클라우드 edge). */
function kboPhotoUrl(playerId: string | null | undefined, season: number): string | undefined {
  if (!playerId) return undefined;
  return `https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/person/middle/${season}/${playerId}.jpg`;
}

async function runKbo(season: number) {
  const summary: Record<string, number> = {};
  // Basic1 + Basic2 머지 (Basic2 에 SB·OBP·SLG 등 있음)
  const hitter1 = await fetchKboTable(KBO_HITTER_URL);
  const hitter2 = await fetchKboTable(KBO_HITTER_URL_2);
  // 선수명+팀 key 로 cells 합치기
  const hitter = hitter1.map((row) => {
    const ex = hitter2.find((r2) => r2.player === row.player && r2.team === row.team);
    if (ex) {
      for (const [k, v] of Object.entries(ex.cells)) {
        if (!(k in row.cells)) row.cells[k] = v;
      }
    }
    return row;
  });
  const pitcher = await fetchKboTable(KBO_PITCHER_URL);

  const upsertFrom = async (
    rows: Awaited<ReturnType<typeof fetchKboTable>>,
    cats: typeof KBO_HITTER_CATS | typeof KBO_PITCHER_CATS,
  ) => {
    for (const c of cats) {
      // 값 추출 + 정렬 (페이지의 기본 정렬과 다를 수 있어 우리 쪽 sort)
      const enriched = rows
        .map((row) => {
          const raw = row.cells[c.col];
          if (!raw) return null;
          const v = parseFloat(raw);
          if (Number.isNaN(v)) return null;
          return { row, value: v };
        })
        .filter((x): x is { row: typeof rows[number]; value: number } => x !== null);
      enriched.sort((a, b) => (c.ord === "DESC" ? b.value - a.value : a.value - b.value));
      const top = enriched.slice(0, TOP_N);
      for (let i = 0; i < top.length; i++) {
        const e = top[i];
        await upsertLeader({
          league: "KBO",
          category: c.code,
          rank: i + 1,
          playerName: e.row.player,
          teamName: e.row.team,
          value: e.value,
          unit: c.unit,
          season: String(season),
          externalId: e.row.playerId ?? undefined,
          photoUrl: kboPhotoUrl(e.row.playerId, season),
        });
      }
      await clearOldRanks("KBO", c.code, String(season), top.length);
      summary[c.code] = top.length;
    }
  };
  await upsertFrom(hitter, KBO_HITTER_CATS);
  await upsertFrom(pitcher, KBO_PITCHER_CATS);
  return { season: String(season), result: summary };
}

/* ============================================================
 * NPB (npb.jp 시즌 stat — 센트럴/퍼시픽 합산)
 * ==========================================================*/

const NPB_BAT_PAGES = [
  { url: "https://npb.jp/bis/{Y}/stats/bat_c.html", league: "C" },
  { url: "https://npb.jp/bis/{Y}/stats/bat_p.html", league: "P" },
] as const;
const NPB_PIT_PAGES = [
  { url: "https://npb.jp/bis/{Y}/stats/pit_c.html", league: "C" },
  { url: "https://npb.jp/bis/{Y}/stats/pit_p.html", league: "P" },
] as const;

interface NpbStatRow {
  player: string;
  team: string;
  cells: string[]; // column index 별 값
  headers: string[];
}

async function fetchNpbTable(url: string): Promise<NpbStatRow[]> {
  try {
    const r = await axios.get<string>(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 15000,
      responseType: "text",
    });
    const $ = cheerio.load(r.data);
    const rows: NpbStatRow[] = [];
    // npb.jp stats 표: class="bgTable02" 보통
    const table = $("table").filter((_, el) => $(el).find("tr").length > 5).first();
    if (table.length === 0) return [];
    const headers: string[] = [];
    table.find("tr").first().find("th").each((_, th) => {
      headers.push($(th).text().trim());
    });
    table.find("tr").slice(1).each((_, tr) => {
      const cells = $(tr).find("td").map((_, td) => $(td).text().trim()).get();
      if (cells.length < 4) return;
      // npb.jp 표 row 구조: [순위, "선수명(팀약자)", stat1, stat2, ...]
      // (cells[2] 부터 stats — 별도 team 컬럼 없음)
      const raw = cells[1] ?? "";
      const tm = raw.match(/^(.+?)[（(]([^）)]+)[）)]\s*$/);
      const player = tm ? tm[1].trim() : raw;
      const team = tm ? `(${tm[2].trim()})` : "";
      rows.push({ player, team, cells, headers });
    });
    return rows;
  } catch (e) {
    console.warn(`[leaders/npb] ${url}`, (e as Error).message);
    return [];
  }
}

const NPB_TEAM_JP_TO_KOR: Record<string, string> = {
  "(巨)": "요미우리",
  "(神)": "한신",
  "(De)": "요코하마",
  "(デ)": "요코하마", // npb.jp 실표기는 가타카나 デ — 라틴 De 만 있던 매핑 miss (2026-06-12)
  "(広)": "히로시마",
  "(中)": "주니치",
  "(ヤ)": "야쿠르트",
  "(ソ)": "소프트뱅크",
  "(日)": "닛폰햄",
  "(ロ)": "롯데",
  "(オ)": "오릭스",
  "(楽)": "라쿠텐",
  "(西)": "세이부",
};

function findColIdx(headers: string[], targets: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (targets.includes(headers[i])) return i;
  }
  return -1;
}

/** npb.jp 의 player profile 에서 사진 URL (p.npb.jp/players_photo/...) 추출. */
async function fetchNpbPhotoUrl(pid: string): Promise<string | undefined> {
  try {
    const r = await fetch(`https://npb.jp/bis/players/${pid}.html`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!r.ok) return undefined;
    const html = await r.text();
    const m = html.match(/<img[^>]*src="(https?:\/\/p\.npb\.jp\/players_photo\/[^"]+)"/i);
    return m?.[1];
  } catch {
    return undefined;
  }
}

async function runNpb(season: number) {
  const summary: Record<string, number> = {};
  const batRows: NpbStatRow[] = [];
  for (const p of NPB_BAT_PAGES) {
    batRows.push(...(await fetchNpbTable(p.url.replace("{Y}", String(season)))));
  }
  const pitRows: NpbStatRow[] = [];
  for (const p of NPB_PIT_PAGES) {
    pitRows.push(...(await fetchNpbTable(p.url.replace("{Y}", String(season)))));
  }
  // 12팀 roster 인덱스 (한자 → pid 매칭용)
  let npbIndex: NpbPlayerIndexEntry[] = [];
  try {
    npbIndex = await fetchNpbPlayerIndex();
  } catch (e) {
    console.warn("[leaders/npb] roster index 실패:", (e as Error).message);
  }
  const photoCache = new Map<string, string | undefined>();
  const getPhoto = async (pid: string): Promise<string | undefined> => {
    if (photoCache.has(pid)) return photoCache.get(pid);
    const url = await fetchNpbPhotoUrl(pid);
    photoCache.set(pid, url);
    // burst 회피
    await new Promise((r) => setTimeout(r, 200));
    return url;
  };

  const upsertCat = async (
    rows: NpbStatRow[],
    code: string,
    unit: string,
    colTargets: string[],
    ord: "ASC" | "DESC",
  ) => {
    if (rows.length === 0) return;
    const idx = findColIdx(rows[0].headers, colTargets);
    if (idx < 0) return;
    const enriched = rows
      .map((row) => {
        const raw = row.cells[idx];
        if (!raw) return null;
        const v = parseFloat(raw);
        if (Number.isNaN(v)) return null;
        return { row, value: v };
      })
      .filter((x): x is { row: NpbStatRow; value: number } => x !== null);
    enriched.sort((a, b) => (ord === "DESC" ? b.value - a.value : a.value - b.value));
    const top = enriched.slice(0, TOP_N);
    for (let i = 0; i < top.length; i++) {
      const e = top[i];
      // 팀명 처리 — 한자/카타카나 → 한국명
      const teamRaw = e.row.team.trim();
      const teamKo = Object.entries(NPB_TEAM_JP_TO_KOR).find(([abbr]) =>
        teamRaw.includes(abbr.replace(/[()]/g, ""))
      )?.[1] ?? teamRaw;
      const playerKo = npbPlayerToKorean(e.row.player);
      // pid 매칭 → photo URL
      const cleanedName = e.row.player.replace(/[（(].+?[）)]/g, "").trim();
      const idx = npbIndex.length > 0 ? findNpbPidByName(npbIndex, cleanedName) : null;
      const photoUrl = idx ? await getPhoto(idx.pid) : undefined;
      await upsertLeader({
        league: "NPB",
        category: code,
        rank: i + 1,
        playerName: playerKo,
        playerNameEn: e.row.player,
        externalId: idx?.pid,
        teamName: teamKo,
        value: e.value,
        unit,
        photoUrl,
        season: String(season),
      });
    }
    await clearOldRanks("NPB", code, String(season), top.length);
    summary[code] = top.length;
  };

  await upsertCat(batRows, "BA", "타율", ["打率", "AVG"], "DESC");
  await upsertCat(batRows, "HR", "홈런", ["本塁打", "HR"], "DESC");
  await upsertCat(batRows, "RBI", "타점", ["打点", "RBI"], "DESC");
  await upsertCat(batRows, "SB", "도루", ["盗塁", "SB"], "DESC");
  await upsertCat(pitRows, "ERA", "ERA", ["防御率", "ERA"], "ASC");
  await upsertCat(pitRows, "WIN", "승", ["勝利", "W"], "DESC");
  await upsertCat(pitRows, "K", "탈삼진", ["三振", "奪三振", "K", "SO"], "DESC");
  await upsertCat(pitRows, "SAVE", "세이브", ["セーブ", "S", "SV"], "DESC");

  return { season: String(season), result: summary };
}

/* ============================================================
 * LOL/LCK (lolGames DB 자체 집계)
 *
 * BALLDONTLIE 키 Unauthorized(2026-06-12)로 동결 → /standings/LOL 이 이미 쓰는
 * lolGames 자체 집계(aggregateLolPlayers)로 교체. league="LOL" 매치(LCK 본선·Cup·
 * KeSPA Cup)만 집계 대상이라 BDL 시절 타 리그 유출 문제는 소스 단에서 사라졌지만,
 * 1군 10팀 화이트리스트는 이벤트성 참가팀 방어용으로 유지 (ts team id 기준).
 * ==========================================================*/

// LCK 1군 10팀 ts team id (TS_LOL_TEAMS 의 LCK 본선 10팀과 동일).
const LCK_TEAM_ID_WHITELIST = new Set([
  "4jwq2eku42pkq0v", // T1
  "k82repjtvpxzqep", // Gen.G
  "965mk6zt7d5jq1g", // 한화생명e스포츠
  "dn1m1eku4j7kqoe", // KT 롤스터
  "23xmvxjt3nj2rg8", // 디플러스 기아
  "965mk6zt7jezq1g", // BNK 피어엑스
  "vjxm89jb412kq6o", // 농심 레드포스
  "ednm926hky17ryo", // 한진 브리온
  "2y8m4exu32pkql0", // DN SOOPers
  "y0or59wblpd4mwz", // DRX
]);

async function runLol(season: number) {
  // 시즌 시작(1월) ~ 현재 — BDL 시절 dates[] 필터와 같은 경계. 시즌 라벨 "2026" 단일.
  const players = await aggregateLolPlayers("LOL", new Date(Date.UTC(season, 0, 1)));
  const summary: Record<string, number> = {};

  // 최소 3게임 + LCK 1군 화이트리스트 (기존 기준 유지)
  type Row = { id: string; nickname: string; teamId: string; kda: number; cs: number; killsAvg: number; games: number };
  const rows: Row[] = [];
  let droppedNonLck = 0;
  for (const p of players) {
    if (p.games < 3) continue;
    if (!LCK_TEAM_ID_WHITELIST.has(p.teamId)) { droppedNonLck++; continue; }
    rows.push({
      id: p.playerId,
      nickname: p.name,
      teamId: p.teamId,
      kda: p.kda,
      cs: p.csPerGame,
      killsAvg: p.games ? p.kills / p.games : 0,
      games: p.games,
    });
  }
  if (droppedNonLck > 0) {
    console.log(`[leaders/lol] dropped ${droppedNonLck} non-LCK players (이벤트 참가팀 등)`);
  }
  // 커버리지 부족 → 기존 데이터 보존 (MIN_LEADERS 가드 패턴)
  if (rows.length < MIN_LEADERS) {
    console.warn(`[leaders/lol] only ${rows.length} eligible players — skip (기존 보존)`);
    return { season: String(season), result: summary };
  }

  const photos = (loadJsonSafe<{ players: Record<string, { photo?: string }> }>(
    "data/lol-players.json",
    { players: {} },
  )).players;

  const writeCat = async (code: string, unit: string, key: "kda" | "cs" | "killsAvg") => {
    const sorted = [...rows].sort((a, b) => b[key] - a[key]);
    const top = sorted.slice(0, TOP_N);
    for (let i = 0; i < top.length; i++) {
      const r = top[i];
      const team = TS_LOL_TEAMS[r.teamId];
      await upsertLeader({
        league: "LOL",
        category: code,
        rank: i + 1,
        playerName: r.nickname,
        externalId: r.id, // ts player id — /players/[pid]?league=LOL 상세가 lolGames 기반이라 그대로 연결
        teamName: team?.name ?? r.teamId,
        teamShort: team?.short,
        value: r[key],
        unit,
        appearances: r.games,
        photoUrl: photos[r.id]?.photo || undefined,
        season: String(season),
      });
    }
    await clearOldRanks("LOL", code, String(season), top.length);
    summary[code] = top.length;
  };

  await writeCat("KDA", "KDA", "kda");
  await writeCat("CS", "CS", "cs");
  await writeCat("KILL", "킬/경기", "killsAvg");
  // NBA 와 동일 — 빈 결과 run 이 직전 시즌 리더보드를 지우지 않게 가드
  if (Object.values(summary).some((n) => n > 0)) {
    await clearFutureSeasons("LOL", String(season));
  }
  return { season: String(season), result: summary };
}

/* ============================================================
 * Entry
 * ==========================================================*/

export async function runFetchLeagueLeaders(opts?: {
  sport?: "soccer" | "baseball" | "basketball" | "hockey" | "esports";
}) {
  const sport = opts?.sport;
  const now = new Date();
  const yearNow = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  // NBA/NHL split 시즌 start year — 7월부터 다음 시즌으로 간주 (preseason 시작).
  // m=7..12 → year, m=1..6 → year-1.
  const nbaSeason = m >= 7 ? yearNow : yearNow - 1;
  const nhlSeasonStartYear = m >= 7 ? yearNow : yearNow - 1;
  const nhlSeasonLabel = `${nhlSeasonStartYear}-${String(nhlSeasonStartYear + 1).slice(2)}`;
  const summary: Record<string, unknown> = {};
  // 종목별 격리 — 한 종목의 unhandled throw (예: 2026-07-01 NBA BDL fetch) 가
  // 이후 종목 전체와 recordCronRun 까지 죽이는 것을 방지
  const errors: string[] = [];
  const safe = async (name: string, fn: () => Promise<unknown>) => {
    try {
      summary[name] = await fn();
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
      console.warn(`[league-leaders/${name}]`, (e as Error).message);
    }
  };
  if (!sport || sport === "soccer") await safe("soccer", () => runSoccer());
  if (!sport || sport === "basketball") await safe("nba", () => runNba(nbaSeason));
  if (!sport || sport === "hockey") await safe("nhl", () => runNhl(nhlSeasonLabel));
  if (!sport || sport === "baseball") {
    await safe("mlb", () => runMlb(yearNow));
    await safe("kbo", () => runKbo(yearNow));
    await safe("npb", () => runNpb(yearNow));
  }
  if (!sport || sport === "esports") await safe("lol", () => runLol(yearNow));
  if (errors.length) summary.errors = errors;
  return summary;
}
