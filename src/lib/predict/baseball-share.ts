// 야구판 "실질적으로 주전인가" — 축구 starter-share 의 야구 버전.
//
// 야구엔 출전 시간(minutes)이 없어 축구 기준을 그대로 못 쓴다. 대신
//   투수 = 팀 최다 이닝 투수 대비 이닝 비중
//   타자 = 팀 최다 출장 선수 대비 출장 경기 비중
// 로 "팀에서 얼마나 쓰이는 선수인가"를 잰다. 둘 다 실제 기용을 반영한다.
//
// ⚠️ 둘 다 **팀 내 최대값 대비**로 맞춘 이유. 처음엔 투수를 "팀 총 이닝 중 몫"으로 뒀는데
//   타자(최다출장 대비 0.8~0.9)와 투수(총이닝 대비 0.001~0.15)의 자릿수가 달라져
//   같은 teamShare 컬럼에 섞이면 해석이 꼬인다. 기준을 통일해 둘 다 "팀 최고 대비 얼마나
//   쓰이나"(0~1)로 읽히게 했다.
//
// ⚠️ 부상자 수를 세지 않는다(사용자 지시). 후보 1명과 4번 타자가 같을 수 없다.
// ⚠️ 야구 선발 투수는 이미 예측에 반영된다(starter-adjust). 여기서 새로 얻는 정보는
//   주로 **야수 결장과 불펜 이탈**이다.
import { prisma } from "@/lib/db";

/** 팀 표본이 이보다 얕으면 비중을 내지 않는다 — 분모가 자기 자신이 돼 100% 로 튄다 */
const MIN_SQUAD = 8;

export interface BaseballShare {
  matches: number | null;
  innings: number | null;
  teamShare: number | null;
  shareBasis: "innings" | "games" | null;
  teamName: string;
}

interface StatRow {
  playerName: string;
  playerNameEn: string | null;
  teamName: string;
  games: number | null;
  ip: number | null;
}

const norm = (s: string) => s.replace(/[\s·.]/g, "").toLowerCase();

export interface BaseballShareIndex {
  /** 정규화 이름 → 스탯 (한글·영문 양쪽 색인) */
  byName: Map<string, StatRow>;
  /** 팀명 → 최다 이닝 / 최다 출장 / 선수 수 (둘 다 "팀 최고" 가 분모다) */
  teamAgg: Map<string, { maxInnings: number; maxGames: number; players: number }>;
}

/** 리그 하나의 색인을 만든다 — 부상자 수백 명을 훑기 전에 한 번만 */
export async function buildBaseballShareIndex(league: string): Promise<BaseballShareIndex> {
  const rows = await prisma.baseballPlayerSeasonStats.findMany({
    where: { league },
    select: { playerName: true, playerNameEn: true, teamName: true, games: true, ip: true },
  });
  const byName = new Map<string, StatRow>();
  const teamAgg = new Map<string, { maxInnings: number; maxGames: number; players: number }>();
  for (const r of rows) {
    byName.set(norm(r.playerName), r);
    if (r.playerNameEn) byName.set(norm(r.playerNameEn), r);
    const cur = teamAgg.get(r.teamName) ?? { maxInnings: 0, maxGames: 0, players: 0 };
    cur.maxInnings = Math.max(cur.maxInnings, r.ip ?? 0);
    cur.maxGames = Math.max(cur.maxGames, r.games ?? 0);
    cur.players++;
    teamAgg.set(r.teamName, cur);
  }
  return { byName, teamAgg };
}

/**
 * 이름으로 주전도를 찾는다. 스탯이 없으면 null — **모르면 0 이 아니라 모른다고 둔다.**
 * 0 으로 채우면 "후보였다"로 오해돼 나중 백테스트가 오염된다.
 */
export function baseballShareByName(idx: BaseballShareIndex, name: string): BaseballShare | null {
  const s = idx.byName.get(norm(name));
  if (!s) return null;
  const agg = idx.teamAgg.get(s.teamName);
  const usable = agg != null && agg.players >= MIN_SQUAD;

  // 투수(이닝 있음)는 이닝 비중, 타자는 출장 비중
  if (s.ip != null && s.ip > 0) {
    return {
      matches: s.games,
      innings: s.ip,
      teamShare: usable && agg.maxInnings > 0 ? s.ip / agg.maxInnings : null,
      shareBasis: usable && agg.maxInnings > 0 ? "innings" : null,
      teamName: s.teamName,
    };
  }
  return {
    matches: s.games,
    innings: null,
    teamShare: usable && agg.maxGames > 0 && s.games != null ? s.games / agg.maxGames : null,
    shareBasis: usable && agg.maxGames > 0 && s.games != null ? "games" : null,
    teamName: s.teamName,
  };
}
