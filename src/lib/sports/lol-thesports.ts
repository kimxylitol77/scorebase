// TheSports LOL 매치 수집 — BDL(/lol/v1) 401 대체. LCK 계열 일정·결과를 NormalizedMatch 로 변환.
// ⚠️ TheSports 는 IP whitelist — Vercel serverless 호출 불가. 워커/로컬 전용.
//    collect.ts(Vercel cron)에서 직접 부르지 말 것 — thesportsGet 이 throw.
// 데이터 흐름: match/tournament?uuid={ts_tournament_id} → 시리즈(BO) 매치. home/away_score = 세트 점수.

import { thesportsGet } from "./thesports/client";
import type { League, MatchStatus, NormalizedMatch } from "./types";
import lecStandings from "../../../data/lol-standings-LEC.json";
import lcsStandings from "../../../data/lol-standings-LCS.json";

// ts tournament id → 우리 League 코드. (테스트 2026-06-20 확인)
//   LCK 본선·Cup = "LOL", Challengers = "LCK_CL". 해외(LPL/LEC/LCS)는 후속 단계.
export const TS_LOL_TOURNAMENTS: Record<string, League> = {
  l7oqd9kb6y6m510: "LOL", // LCK 2026
  "4wyrnxyt8jgm86p": "LOL", // LCK Cup 2026
  "4wyrnxyt8ggm86p": "LEC", // LEC Spring 2026 (해외 — 순위·인게임 수집)
  l5erg5ef300m8k0: "LCS", // LCS Spring 2026
  // ⚠️ 6ypq3e3u501md7o 는 ts 실명 "Mid-Season Invitational 2026" — EWC 로 오인 매핑됐던 것.
  // 대회 종료(7/11)·기존 매치 10개는 사용자 결정으로 EWC 라벨 유지 (2026-07-18).
  "6ypq3e3u501md7o": "EWC", // MSI 2026 (6/28~7/11, 종료)
  y39mp8xu53gqojx: "EWC", // Esports World Cup 2026 본선 (7/15~7/19)
  // LCK_CL(x7lm797bog7r2wd)·LPL(Split 2그룹제라 단일순위 부정확, 보류)은 후속.
  // LCK 서머 새 UUID 는 TheSports 일정에 뜨면 "LOL" 로 추가.
};

// ts team id → 한글명·약자·로고. 한글명은 한국 통용 표기(기존 BDL 매핑 재활용).
// 로고는 TheSports 제공(eimg) — 소스 일관.
type TeamInfo = { name: string; short: string; logo: string };
export const TS_LOL_TEAMS: Record<string, TeamInfo> = {
  // === LCK 본선 / Cup 10팀 ===
  "4jwq2eku42pkq0v": { name: "T1", short: "T1", logo: "https://eimg.thesports.com/lol/team/FvlF-KaNF_aUW28gaY0-Uw5ITFoW" },
  k82repjtvpxzqep: { name: "Gen.G", short: "GEN", logo: "https://eimg.thesports.com/lol/team/FmS7NLx8b7zRARpNmDkvDrhjKx0w" },
  "965mk6zt7d5jq1g": { name: "한화생명e스포츠", short: "HLE", logo: "https://eimg.thesports.com/lol/team/FosSfN6KzBxq4oiU_Xi7z_DJ4rMF" },
  dn1m1eku4j7kqoe: { name: "KT 롤스터", short: "KT", logo: "https://eimg.thesports.com/lol/team/Fqw0V_AbDcoKj78Xxm1tbGMYP0o2" },
  "23xmvxjt3nj2rg8": { name: "디플러스 기아", short: "DK", logo: "https://eimg.thesports.com/lol/team/Fg1Z7jhh5zluHsCcrWC2vOiiEo7s" },
  "965mk6zt7jezq1g": { name: "BNK 피어엑스", short: "BFX", logo: "https://eimg.thesports.com/lol/team/FlycExNPh_FPU6tqsmvMotdwigIt" },
  vjxm89jb412kq6o: { name: "농심 레드포스", short: "NS", logo: "https://eimg.thesports.com/lol/team/FgXx-XxZb5L3_QPcFFJAFKWVrHhE" },
  ednm926hky17ryo: { name: "한진 브리온", short: "BRO", logo: "https://eimg.thesports.com/lol/team/FlFdQU07TgJrOF4wvMOGFRJzg8KK" },
  "2y8m4exu32pkql0": { name: "DN SOOPers", short: "DNS", logo: "https://eimg.thesports.com/lol/team/FiREL-9p9kEsrBd0LMbO_gmBv6qC" },
  y0or59wblpd4mwz: { name: "DRX", short: "DRX", logo: "https://eimg.thesports.com/lol/team/FrJTPfp5FygOCrCXcHyzETJXGi6c" },
  // === EWC(이스포츠 월드컵) 해외 참가팀 — LCK 외 지역. (TBD 슬롯은 미매핑 → route 가 skip) ===
  y39mp8xu3g6yqoj: { name: "팀 리퀴드", short: "TL", logo: "https://eimg.thesports.com/lol/team/Fr_aqE1CaVsWXV-j7QqFquzknuvz" },
  "318q6g8to50vro9": { name: "카민 코프", short: "KC", logo: "https://eimg.thesports.com/lol/team/FpvzFLOCAur7cd59-22EEQlzsSw0" },
  "2y8m4exu3kx7ql0": { name: "딥 크로스 게이밍", short: "DCG", logo: "https://eimg.thesports.com/lol/team/FvoIo9QMK8gFby_e2GafGA_971_j" },
  // === EWC 2026 본선(y39mp8xu53gqojx) 추가 참가팀 — 2026-07-18. 예선 uuid 와 팀 uuid 다름 주의(G2 등) ===
  "318q6g8toepdro9": { name: "팀 시크릿", short: "TS", logo: "https://eimg.thesports.com/lol/team/FsWDvr9s1qwVIIKATJeNZ9CBn9cU" },
  y0or59wblvd9mwz: { name: "센티널스", short: "SEN", logo: "https://eimg.thesports.com/lol/team/FuNY6_Z7GLK1__dP2dzvr3Lo2k8X" },
  dj2ryy6tk6p1r1z: { name: "GAM e스포츠", short: "GAM", logo: "https://eimg.thesports.com/lol/team/FlILBcHMX4Rlg0hrt3BvGPeC3Eiw" },
  "4wyrnxyt8pldm86": { name: "빌리빌리 게이밍", short: "BLG", logo: "https://eimg.thesports.com/lol/team/FuQ-HVlJW08a3QSsFNrwgDSrV-kn" },
  "1l4rjevu6o0km7v": { name: "모비스타 KOI", short: "KOI", logo: "https://eimg.thesports.com/lol/team/FoyVZW9gn_9VOl5znxsz4F-jDwRq" },
  ednm926hknxzryo: { name: "G2 e스포츠", short: "G2", logo: "https://eimg.thesports.com/lol/team/Fn8KDMp7ktyLFpTuoe4B7-WCxOAb" },
  "4jwq2eku42deq0v": { name: "푸리아", short: "FUR", logo: "https://eimg.thesports.com/lol/team/Fvf1ddjsQwkosJUfvondE1DNSS_o" },
  n54qleou2okvmvy: { name: "애니원스 레전드", short: "AL", logo: "https://eimg.thesports.com/lol/team/FnCKmQiZLEqRnh8cpocOQmLbcQhi" },
  l5erg5efoxdym8k: { name: "리옹", short: "LYON", logo: "https://eimg.thesports.com/lol/team/FqK-TIHWghskhdl64vtXoHPLrVJ0" },
  zp5rz5pfjvw9r82: { name: "징동 게이밍", short: "JDG", logo: "https://eimg.thesports.com/lol/team/FjTJM1hEw1EE9T_fTiz7W2efVrxU" },
  y39mp8xu3x35qoj: { name: "MIBR", short: "MIBR", logo: "https://eimg.thesports.com/lol/team/Fts2CUJ_8yCRRDk9gXLp5jq-uZmu" },
};
// 해외(LEC/LCS) 팀은 순위 json(build-lol-standings --league 생성)에서 머지 — 한글명·로고 단일 진실.
for (const d of [lecStandings, lcsStandings] as { standings: { teamId: string; name: string; short: string; logo: string }[] }[]) {
  for (const t of d.standings) TS_LOL_TEAMS[t.teamId] = { name: t.name, short: t.short, logo: t.logo };
}

// TheSports Match State → 우리 MatchStatus.
//   0 Abnormal(hide) · 1 Not started · 2 Ongoing · 3 End · 11 Interrupt · 12 Cancel
//   13 Extension · 14 Cut in half · 15 TBD
function mapStatus(statusId: number): MatchStatus {
  switch (statusId) {
    case 2:
    case 13:
      return "LIVE";
    case 3:
      return "FINISHED";
    case 11:
    case 12:
      return "POSTPONED";
    default:
      return "SCHEDULED"; // 1, 0, 14, 15 등
  }
}

export interface TsLolMatch {
  id: string;
  tournament_id: string;
  stage_id: string;
  home_team_id: string;
  away_team_id: string;
  box: number; // BO 타입 (1·3·5)
  match_time: number; // unix sec
  status_id: number;
  home_score: number;
  away_score: number;
  coverage?: { mlive?: number };
}

interface TsLolMatchTournamentResp {
  code: number;
  results?: TsLolMatch[];
}

/**
 * raw TheSports lol 매치 배열 → NormalizedMatch[]. 순수 변환(네트워크 X).
 * tournament_id 로 League 결정 — 미등록 토너먼트·TS_LOL_TEAMS 미매핑 팀은 skip(upsert name 필수).
 * 워커(raw POST → /api/internal/lol-matches)와 로컬 수집(fetchLolThesportsAll) 공용 단일 소스.
 */
export function normalizeLolMatches(raw: TsLolMatch[]): NormalizedMatch[] {
  const out: NormalizedMatch[] = [];
  for (const m of raw) {
    const league = TS_LOL_TOURNAMENTS[m.tournament_id];
    if (!league) continue; // 미등록 토너먼트
    const home = TS_LOL_TEAMS[m.home_team_id];
    const away = TS_LOL_TEAMS[m.away_team_id];
    if (!home || !away) continue; // 미매핑 팀
    out.push({
      league,
      externalId: m.id,
      homeTeam: {
        externalId: m.home_team_id,
        name: home.name,
        shortName: home.short,
        logoUrl: home.logo,
      },
      awayTeam: {
        externalId: m.away_team_id,
        name: away.name,
        shortName: away.short,
        logoUrl: away.logo,
      },
      homeScore: m.home_score,
      awayScore: m.away_score,
      status: mapStatus(m.status_id),
      startTime: new Date(m.match_time * 1000),
      raw: m,
    });
  }
  return out;
}

/**
 * LCK 계열 전체 토너먼트 매치 (thesportsGet 호출 → normalize).
 * ⚠️ Vercel 호출 불가(IP whitelist) — 로컬/스크립트 전용. 워커는 raw 를 route 로 POST.
 */
export async function fetchLolThesportsAll(): Promise<NormalizedMatch[]> {
  const raw: TsLolMatch[] = [];
  for (const tournamentId of Object.keys(TS_LOL_TOURNAMENTS)) {
    const res = await thesportsGet<TsLolMatchTournamentResp>(
      "/v1/lol/match/tournament",
      { uuid: tournamentId },
    );
    raw.push(...(res.results ?? []));
  }
  return normalizeLolMatches(raw);
}
