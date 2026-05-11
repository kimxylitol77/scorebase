// LoL 게임 단위 MVP/LVP 자동 선정.
// 사용자 사양: kda*10 + kp*50 + dpm/50 + gpm/30 + cs/20 + kills*5 - deaths*3
//             + (승리팀 +15) + (mid/jungle +5)
// MVP = 최고점, LVP = 패배팀 중 최저점 (승리팀 LVP는 어색).

import { getKoreanStarBy } from "./star-players";
import { championKoreanName } from "./leaguepedia";

export interface MvpCandidate {
  bdlPlayerId: number;
  team: "team1" | "team2";
  isWinningTeam: boolean;
  playerName: string; // BDL nickname (예: "Faker")
  koreanName?: string; // 한국 닉네임 (예: "페이커")
  realName?: string; // 본명 (예: "이상혁")
  role: "TOP" | "JGL" | "MID" | "ADC" | "SUP" | string;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  cs: number;
  gpm: number;
  dpm: number;
  kp: number; // 킬 관여율 (0~1)
  mvpScore: number;
  isMvp: boolean;
  isLvp: boolean;
  /** 자동 생성 한 줄 평 — 데이터 기반 ("솔로킬 N회 / 데스 0" 등) */
  highlight: string;
}

interface PlayerRawStat {
  bdlPlayerId: number;
  team: "team1" | "team2";
  isWinningTeam: boolean;
  nickname: string;
  nameEn?: string;
  role: string; // BDL 응답 그대로 ("mid", "top", "jungle", "adc"/"bot", "support"/"sup")
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  goldEarned: number;
  goldPerMin?: number;
  damageToChamps: number;
  /** kill_participation (0~1) — 없으면 팀 킬 기준 자체 계산 */
  killParticipation?: number;
  /** 게임 길이(초) — DPM 환산용 */
  durationSec: number;
  /** 팀 총 킬 수 (kp 자체 계산용) */
  teamKills?: number;
}

const ROLE_NORM: Record<string, MvpCandidate["role"]> = {
  top: "TOP",
  jungle: "JGL",
  jun: "JGL",
  jg: "JGL",
  mid: "MID",
  middle: "MID",
  adc: "ADC",
  bot: "ADC",
  "ad carry": "ADC",
  support: "SUP",
  sup: "SUP",
  supp: "SUP",
};

function normRole(r: string): MvpCandidate["role"] {
  const lo = (r ?? "").toLowerCase().trim();
  return ROLE_NORM[lo] ?? lo.toUpperCase();
}

function calcMvpScore(p: PlayerRawStat, role: MvpCandidate["role"]): {
  score: number;
  kda: number;
  dpm: number;
  gpm: number;
  kp: number;
} {
  const kda = p.deaths === 0 ? p.kills + p.assists : (p.kills + p.assists) / p.deaths;
  const minutes = p.durationSec > 0 ? p.durationSec / 60 : 30;
  const dpm = minutes > 0 ? p.damageToChamps / minutes : 0;
  const gpm = p.goldPerMin ?? (minutes > 0 ? p.goldEarned / minutes : 0);
  const kp =
    p.killParticipation ??
    (p.teamKills && p.teamKills > 0
      ? Math.min(1, (p.kills + p.assists) / p.teamKills)
      : 0);

  const score =
    (kda > 0 ? kda * 10 : 0) +
    kp * 50 +
    dpm / 50 +
    gpm / 30 +
    p.cs / 20 +
    p.kills * 5 -
    p.deaths * 3 +
    (p.isWinningTeam ? 15 : 0) +
    (role === "MID" || role === "JGL" ? 5 : 0);
  return { score: Math.round(score * 10) / 10, kda, dpm, gpm, kp };
}

function buildHighlight(c: Omit<MvpCandidate, "highlight" | "isMvp" | "isLvp">): string {
  const parts: string[] = [];
  if (c.deaths === 0) parts.push("데스 0");
  if (c.kills >= 8) parts.push(`킬 ${c.kills}`);
  if (c.kda >= 10) parts.push(`KDA ${c.kda.toFixed(1)}`);
  if (c.kp >= 0.7) parts.push(`KP ${Math.round(c.kp * 100)}%`);
  if (c.dpm >= 800) parts.push(`DPM ${Math.round(c.dpm)}`);
  if (c.cs >= 280) parts.push(`CS ${c.cs}`);
  if (parts.length === 0) {
    parts.push(`KDA ${c.kda.toFixed(1)}`, `${championKoreanName(c.champion)}`);
  } else {
    parts.push(championKoreanName(c.champion));
  }
  return parts.slice(0, 4).join(" · ");
}

function buildLvpHighlight(c: Omit<MvpCandidate, "highlight" | "isMvp" | "isLvp">): string {
  const parts: string[] = [];
  if (c.deaths >= 5) parts.push(`데스 ${c.deaths}`);
  if (c.kda < 1) parts.push(`KDA ${c.kda.toFixed(1)}`);
  if (c.kp < 0.4) parts.push(`KP ${Math.round(c.kp * 100)}%`);
  if (parts.length === 0) parts.push(`KDA ${c.kda.toFixed(1)}`);
  parts.push(championKoreanName(c.champion));
  return parts.slice(0, 3).join(" · ");
}

/** 양 팀 10명 raw stat → MVP 1명 + LVP 1명 (패배팀에서) */
export function selectMvpLvp(rawPlayers: PlayerRawStat[]): {
  mvp: MvpCandidate;
  lvp: MvpCandidate;
  all: MvpCandidate[];
} {
  const candidates: MvpCandidate[] = rawPlayers.map((p) => {
    const role = normRole(p.role);
    const star = getKoreanStarBy(p.nickname);
    const { score, kda, dpm, gpm, kp } = calcMvpScore(p, role);
    const base: Omit<MvpCandidate, "highlight" | "isMvp" | "isLvp"> = {
      bdlPlayerId: p.bdlPlayerId,
      team: p.team,
      isWinningTeam: p.isWinningTeam,
      playerName: p.nickname,
      koreanName: star?.koreanName,
      realName: star?.realName ?? p.nameEn,
      role,
      champion: p.champion,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      kda: Math.round(kda * 100) / 100,
      cs: p.cs,
      gpm: Math.round(gpm),
      dpm: Math.round(dpm),
      kp: Math.round(kp * 1000) / 1000,
      mvpScore: score,
    };
    return {
      ...base,
      isMvp: false,
      isLvp: false,
      highlight: buildHighlight(base),
    };
  });

  // MVP — 점수 최고. 동점 시 KDA → DPM
  const sortedDesc = [...candidates].sort(
    (a, b) =>
      b.mvpScore - a.mvpScore ||
      b.kda - a.kda ||
      b.dpm - a.dpm,
  );
  const mvp = sortedDesc[0];

  // LVP — 패배팀 중 점수 최저. 동점 시 KDA 낮은 쪽
  const losers = candidates.filter((c) => !c.isWinningTeam);
  const lvpPool = losers.length > 0 ? losers : candidates; // 모두 승리(드물)면 전체에서
  const sortedAsc = [...lvpPool].sort(
    (a, b) =>
      a.mvpScore - b.mvpScore ||
      a.kda - b.kda ||
      a.dpm - b.dpm,
  );
  const lvp = sortedAsc[0];

  // mark flags + override highlight for lvp
  for (const c of candidates) {
    if (c === mvp) c.isMvp = true;
    if (c === lvp) {
      c.isLvp = true;
      c.highlight = buildLvpHighlight(c);
    }
  }

  return { mvp, lvp, all: candidates };
}
