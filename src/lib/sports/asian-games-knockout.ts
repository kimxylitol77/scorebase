// 아시안게임 결선(녹아웃) 판정 — 조별 표 밖 경기를 라운드로 세우고 최종 순위(금·은·동·4위)를 가린다.
//  ts 는 농구 외 종목에 단계 이름을 주지 않아 경기 결과의 흐름으로 판정한다.
//   · 결선 경기 중 두 팀 모두 결선 패배가 없는 경기 = 승자 라운드. 라운드 번호 = 두 팀의 결선 승수 중 큰 값.
//   · 패배가 있는 팀이 낀 경기 = 순위 결정전. 그중 4강 패자끼리 = 3·4위전.
//   · 결선이 두 경기(결승·3·4위전)뿐인 대회(야구 — 슈퍼라운드 뒤 바로 메달전)는 2라운드 표 1·2위 맞대결이 결승.
//   · 끝난 대회는 결승에서 거꾸로 — 결승 두 팀이 직전에 이긴 경기 = 4강, 그 네 팀이 직전에 이긴 경기 = 8강.
//     순위결정전이 첫 라운드에 섞이는 배구(2026 여자 9/20 8강 4 + 9~12위전 2)도 이 방식이면 정확하다.
//   · 진행 중인 대회의 앞으로 세기는 단계가 확실한 대회(농구 — ts stage)에서만 쓴다(opts.forward).
export interface KoMatch {
  id: number;
  startTime: number;
  homeId: number;
  awayId: number;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
}
export interface KoRound { label: string; matches: KoMatch[] }
export interface KoResult { rounds: KoRound[]; bronze: KoMatch | null; podium: Array<number | null> }

export const koWinner = (m: KoMatch) =>
  m.finished && m.homeScore != null && m.awayScore != null && m.homeScore !== m.awayScore
    ? (m.homeScore > m.awayScore ? m.homeId : m.awayId)
    : null;
const koLoser = (m: KoMatch) => {
  const w = koWinner(m);
  return w == null ? null : w === m.homeId ? m.awayId : m.homeId;
};

const roundLabel = (matches: number) => (matches === 1 ? "결승" : `${matches * 2}강`);

const LABEL: Record<number, string> = { 1: "결승", 2: "4강", 4: "8강", 8: "16강" };

/** 결승부터 거꾸로 세운 승자 라운드. 결승을 못 찾으면 null. */
function backward(sorted: KoMatch[]): KoRound[] | null {
  const lastWin = (team: number, before: number, used: Set<number>) => {
    for (let i = sorted.length - 1; i >= 0; i--) {
      const x = sorted[i];
      if (used.has(x.id) || x.startTime >= before || (x.homeId !== team && x.awayId !== team)) continue;
      return koWinner(x) === team ? x : null; // 직전 결선 경기를 졌으면 승자 경로가 아니다
    }
    return null;
  };
  // 결승 = 마지막 날 경기 중 두 팀 모두 직전 결선 경기를 이긴(또는 첫 결선인) 경기 — 3·4위전이 결승 뒤에 열려도 안 헷갈린다
  const lastDay = Math.floor((sorted[sorted.length - 1].startTime + 9 * 3600_000) / 86400_000);
  const candidates = sorted.filter((m) => m.finished && Math.floor((m.startTime + 9 * 3600_000) / 86400_000) === lastDay).reverse();
  const final = candidates.find((m) => {
    const used = new Set([m.id]);
    return [m.homeId, m.awayId].every((t) => {
      const prior = sorted.filter((x) => x.startTime < m.startTime && (x.homeId === t || x.awayId === t));
      return prior.length === 0 || lastWin(t, m.startTime, used) != null;
    });
  });
  if (!final) return null;
  const rounds: KoMatch[][] = [[final]];
  const used = new Set([final.id]);
  for (;;) {
    const cur = rounds[0];
    const prev: KoMatch[] = [];
    for (const m of cur) for (const t of [m.homeId, m.awayId]) {
      const p = lastWin(t, m.startTime, used);
      if (p && !prev.includes(p)) prev.push(p);
    }
    if (prev.length !== cur.length * 2 || !LABEL[prev.length]) break;
    prev.forEach((p) => used.add(p.id));
    rounds.unshift(prev.sort((a, b) => a.startTime - b.startTime));
  }
  return rounds.map((ms) => ({ label: LABEL[ms.length], matches: ms }));
}

function withBronze(rounds: KoRound[], sorted: KoMatch[]): KoResult {
  const final = rounds.find((r) => r.label === "결승")?.matches[0] ?? null;
  const semis = rounds.find((r) => r.label === "4강")?.matches ?? [];
  const semiLosers = new Set(semis.map(koLoser).filter((x): x is number => x != null));
  const inTree = new Set(rounds.flatMap((r) => r.matches.map((m) => m.id)));
  const bronze = semiLosers.size === 2
    ? [...sorted].reverse().find((m) => !inTree.has(m.id) && semiLosers.has(m.homeId) && semiLosers.has(m.awayId)) ?? null
    : null;
  return {
    rounds,
    bronze,
    podium: [final && koWinner(final), final && koLoser(final), bronze && koWinner(bronze), bronze && koLoser(bronze)],
  };
}

/**
 * finalPair = 결선이 메달전 둘뿐일 때 결승 두 팀(2라운드 표 1·2위).
 * complete = 대회 전 경기가 끝났다(결승에서 거꾸로 센다). forward = 진행 중에도 앞으로 세도 되는 대회.
 */
export function buildKnockout(
  ko: KoMatch[],
  finalPair?: [number, number] | null,
  opts: { complete?: boolean; forward?: boolean } = {},
): KoResult {
  const sorted = [...ko].sort((a, b) => a.startTime - b.startTime);
  const empty: KoResult = { rounds: [], bronze: null, podium: [null, null, null, null] };
  if (sorted.length === 0) return empty;

  if (finalPair && sorted.length <= 2) {
    const isFinal = (m: KoMatch) => finalPair.includes(m.homeId) && finalPair.includes(m.awayId);
    const final = sorted.find(isFinal) ?? null;
    const bronze = sorted.find((m) => !isFinal(m)) ?? null;
    return {
      rounds: final ? [{ label: "결승", matches: [final] }] : [],
      bronze,
      podium: [final && koWinner(final), final && koLoser(final), bronze && koWinner(bronze), bronze && koLoser(bronze)],
    };
  }

  if (opts.complete) {
    const rounds = backward(sorted);
    if (rounds) return withBronze(rounds, sorted);
  }
  if (!opts.forward) return empty;

  const wins = new Map<number, number>();
  const lost = new Map<number, number>(); // 팀 → 진 라운드 번호
  const winners: KoMatch[][] = [];
  const placement: KoMatch[] = [];
  for (const m of sorted) {
    if (lost.has(m.homeId) || lost.has(m.awayId)) {
      placement.push(m);
      continue;
    }
    const r = Math.max(wins.get(m.homeId) ?? 0, wins.get(m.awayId) ?? 0);
    (winners[r] ??= []).push(m);
    const w = koWinner(m);
    if (w != null) {
      wins.set(w, (wins.get(w) ?? 0) + 1);
      lost.set(w === m.homeId ? m.awayId : m.homeId, r);
    }
  }
  // 라운드 이름은 첫 라운드 규모에서 반씩 줄여 붙인다(진행 중이라 뒤 라운드가 덜 찼어도 이름이 맞는다)
  const first = winners[0]?.length ?? 0;
  const rounds = winners.map((ms, i) => ({ label: roundLabel(Math.max(1, Math.round(first / 2 ** i))), matches: ms }));
  const semiIdx = rounds.findIndex((r) => r.label === "4강");
  const finalRound = rounds.find((r) => r.label === "결승");
  const final = finalRound?.matches[0] ?? null;
  const semiLosers = new Set(
    semiIdx >= 0 ? rounds[semiIdx].matches.map(koLoser).filter((x): x is number => x != null) : [],
  );
  const bronze = semiLosers.size === 2
    ? placement.find((m) => semiLosers.has(m.homeId) && semiLosers.has(m.awayId)) ?? null
    : null;
  return {
    rounds,
    bronze,
    podium: [final && koWinner(final), final && koLoser(final), bronze && koWinner(bronze), bronze && koLoser(bronze)],
  };
}
