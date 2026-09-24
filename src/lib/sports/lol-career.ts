// LoL 통산·최근폼 사전 reader — data/lol-career.json (TheSports player/stats·team/stats, scripts/build-lol-career.ts 생성).
// 우리가 수집한 세트 기록(lolGames)은 최근 시즌뿐이라, 데뷔 이후 누적은 이 사전이 유일한 출처다.
import rawCareer from "../../../data/lol-career.json";
import rawHeroes from "../../../data/lol-heroes.json";

export interface LolCareerLine {
  k: number; d: number; a: number; kda: number; part: number;
  win: number; lose: number; winRate: number;
  csPerMin: number; dmgPerMin: number; goldPerMin: number;
}
export interface LolCareerChamp { id: string; name: string; logo: string; played: number; won: number; winRate: number }
export interface LolPlayerCareer {
  career: LolCareerLine;
  champs: LolCareerChamp[];
  /** 최근 N경기 폼 — ts 가 주는 창은 10·20·30·40·50 */
  form: Array<{ window: number; line: LolCareerLine }>;
}
export interface LolTeamLine {
  matches: number; win: number; lose: number; winRate: number;
  firstBlood: number; firstTower: number; firstDragon: number; firstBaron: number;
  killsPerMatch: number; deathsPerMatch: number; assistsPerMatch: number;
  avgSeconds: number; goldPerMin: number;
}

type RawPlayer = { career?: LolCareerLine & { champs: [string, number, number][] }; form: Record<string, LolCareerLine> };
type RawTeam = { career?: LolTeamLine; form: Record<string, LolTeamLine> };
// JSON 리터럴 추론형이 champs 튜플과 안 맞아 unknown 경유 — 실제 형태는 빌더(scripts/build-lol-career.ts)가 보증한다.
const FILE = rawCareer as unknown as { updatedAt?: string; players?: Record<string, RawPlayer>; teams?: Record<string, RawTeam> };
const HERO_BY_ID = (rawHeroes as { byId?: Record<string, { name: string; logo: string }> }).byId ?? {};

export const LOL_CAREER_UPDATED_AT = FILE.updatedAt ?? null;

/** 선수 통산 + 챔피언 풀 + 최근폼. 사전에 없으면 null. */
export function lolPlayerCareer(playerId: string): LolPlayerCareer | null {
  const row = FILE.players?.[playerId];
  if (!row?.career) return null;
  const { champs: rawChamps, ...career } = row.career;
  const champs: LolCareerChamp[] = (rawChamps ?? []).map(([id, played, won]) => ({
    id,
    // 사전에 없는 신규 챔피언은 id 를 그대로 — 빈 칸보다 낫다(다음 build-lol-heroes 실행에서 채워진다)
    name: HERO_BY_ID[id]?.name ?? id,
    logo: HERO_BY_ID[id]?.logo ?? "",
    played,
    won,
    winRate: played > 0 ? won / played : 0,
  }));
  const form = Object.entries(row.form ?? {})
    .map(([w, line]) => ({ window: Number(w), line }))
    .sort((a, b) => a.window - b.window);
  return { career, champs, form };
}

/** 팀 최근폼 메타 스탯(퍼블·첫 타워·드래곤/바론 선취율 등). 키는 우리 Team.id. ts 는 팀엔 통산 행을 안 준다. */
export function lolTeamForm(teamId: number | null | undefined): Array<{ window: number; line: LolTeamLine }> {
  const row = teamId != null ? FILE.teams?.[String(teamId)] : undefined;
  if (!row) return [];
  return Object.entries(row.form ?? {})
    .map(([w, line]) => ({ window: Number(w), line }))
    .sort((a, b) => a.window - b.window);
}
