// 조별리그→녹아웃 대회의 토너먼트 라운드를 매치 위상으로 유도한다 (8강·준결승·3위전·결승).
//
// 왜 유도인가. ts 배구 diary 에는 라운드 정보가 없다 — stage_id 필드 자체가 없고
// description 은 빈 문자열, stage/list 는 요금제 미승인("URL is not authorized", 2026-08-27 실측).
// 대신 구조가 결정론적이다: 그룹 순위표(이미 수집)로 팀→조를 알고, **조가 다른 두 팀의
// 경기 = 녹아웃**이며, 시간순 진행에서 각 팀의 직전 라운드 +1 로 라운드가 정해진다.
// 라운드 이름은 1라운드 참가 팀 수로 짓는다(8팀=8강) — 미래 라운드가 아직 수집 전이어도
// 이름이 흔들리지 않는다(끝에서 세면 결승이 8강으로 둔갑한다).
//
// 축구 컵(cup-bracket.ts)은 af round 라벨·ts stageName 이 있어 이 유도가 불필요하다 —
// 이건 라운드 원천이 아예 없는 종목(배구 등 ts 단독 대회)용이다.

export interface KnockoutMatch {
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  startTime: Date;
}

export interface KnockoutTie extends KnockoutMatch {
  /** 1 = 첫 녹아웃 라운드 */
  round: number;
  /** 3·4위전 여부 — 두 팀 모두 직전(준결승) 패자 */
  thirdPlace: boolean;
}

export interface KnockoutBracketData {
  /** 라운드 번호 순. 라벨은 roundName() 으로 */
  rounds: { round: number; label: string; ties: KnockoutTie[] }[];
}

/**
 * 라운드 라벨. 결승이 식별되면(마지막 메인 라운드의 경기 1개) 끝에서부터 역산한다 —
 * 부전승이 있는 대회(U17 세계선수권 24팀 등)는 1라운드 팀 수가 2^n 이 아니라
 * 앞에서 세면 "24강" 같은 비표준 라벨이 나온다. 진행 중이라 결승을 모르면
 * 1라운드 팀 수가 2^n 일 때만 N강, 아니면 "1라운드" 식으로 둔다.
 */
function labelRounds(maxRound: number, firstRoundTeams: number, finalKnown: boolean): (r: number) => string {
  if (finalKnown) {
    return (r: number) => {
      const fromEnd = maxRound - r; // 0=결승
      if (fromEnd === 0) return "결승";
      if (fromEnd === 1) return "준결승";
      return `${2 ** (fromEnd + 1)}강`;
    };
  }
  const pow2 = Number.isInteger(Math.log2(firstRoundTeams));
  return (r: number) => {
    if (pow2) {
      const teams = firstRoundTeams / 2 ** (r - 1);
      if (teams <= 2) return "결승";
      if (teams <= 4) return "준결승";
      return `${teams}강`;
    }
    return `${r}라운드`;
  };
}

/**
 * groups: 팀 id → 조 이름 (조 편성이 없는 대회면 빈 맵 → null 반환).
 * matches: 대회 전 매치. 반환 null = 녹아웃 없음(조별 진행 중이거나 리그형 대회).
 *
 * 메인 사다리 vs 순위 결정전 — 녹아웃에서 한 번이라도 진 팀이 낀 경기는 순위
 * 결정전(5~8위전 등)이다. NORCECA/판암처럼 패자전이 많은 대회에서 이걸 안 가르면
 * 결승 열에 순위전이 섞인다. 예외 = 3·4위전(양 팀 모두 메인 준결승 패자)만 이름을 준다.
 */
export function deriveKnockout(
  matches: KnockoutMatch[],
  groupOf: Map<number, string>,
): KnockoutBracketData | null {
  if (groupOf.size === 0 || matches.length === 0) return null;

  const sorted = [...matches].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const firstCross = sorted.find((m) => {
    const g1 = groupOf.get(m.homeTeamId);
    const g2 = groupOf.get(m.awayTeamId);
    return g1 != null && g2 != null && g1 !== g2;
  });
  if (!firstCross) return null;
  const cutoff = firstCross.startTime.getTime();
  const ko = sorted.filter((m) => m.startTime.getTime() >= cutoff);

  const lastMainRound = new Map<number, number>(); // 메인 사다리에서 마지막으로 뛴 라운드
  const koLost = new Set<number>(); // 녹아웃에서 한 번이라도 진 팀
  const lostMainRound = new Map<number, number>(); // 메인 사다리에서 진 라운드 (3위전 판정)
  const main: KnockoutTie[] = [];
  const consolation: KnockoutMatch[] = [];
  let firstRoundTeams = 0;
  let maxRound = 0;

  for (const m of ko) {
    const isMain = !koLost.has(m.homeTeamId) && !koLost.has(m.awayTeamId);
    const finished = m.status === "FINISHED" && m.homeScore != null && m.awayScore != null && m.homeScore !== m.awayScore;
    const loser = finished ? (m.homeScore! < m.awayScore! ? m.homeTeamId : m.awayTeamId) : null;

    if (isMain) {
      const r = Math.max(lastMainRound.get(m.homeTeamId) ?? 0, lastMainRound.get(m.awayTeamId) ?? 0) + 1;
      main.push({ ...m, round: r, thirdPlace: false });
      if (r === 1) firstRoundTeams += 2;
      maxRound = Math.max(maxRound, r);
      lastMainRound.set(m.homeTeamId, r);
      lastMainRound.set(m.awayTeamId, r);
      if (loser != null) { koLost.add(loser); lostMainRound.set(loser, r); }
    } else {
      if (loser != null) koLost.add(loser);
      consolation.push(m);
    }
  }
  if (firstRoundTeams < 4) return null;

  // 결승 식별 — 마지막 메인 라운드에 경기 1개면 결승으로 보고 역산 라벨
  const lastRoundTies = main.filter((t) => t.round === maxRound);
  const finalKnown = lastRoundTies.length === 1 && (maxRound >= 2 || firstRoundTeams === 2);
  const label = labelRounds(maxRound, firstRoundTeams, finalKnown);

  // 3·4위전 — **결승이 식별된 뒤에만** 판정한다. 결승이 아직 미수집이면 마지막 라운드가
  // 준결승인지 알 수 없어, 8강 패자전(5~8위전)을 3·4위전으로 오표한다(COPA_AM 실측).
  // 판정 = 순위전 중 양 팀 모두 메인 준결승(maxRound-1) 패자인 경기.
  const semiRound = finalKnown ? maxRound - 1 : -1;
  const thirdTies: KnockoutTie[] = [];
  const restConsolation: KnockoutMatch[] = [];
  for (const m of consolation) {
    const bothSemiLosers =
      semiRound >= 1 &&
      lostMainRound.get(m.homeTeamId) === semiRound &&
      lostMainRound.get(m.awayTeamId) === semiRound;
    if (bothSemiLosers) thirdTies.push({ ...m, round: maxRound, thirdPlace: true });
    else restConsolation.push(m);
  }

  const byRound = new Map<number, KnockoutTie[]>();
  for (const t of [...main, ...thirdTies]) {
    const arr = byRound.get(t.round) ?? [];
    arr.push(t);
    byRound.set(t.round, arr);
  }
  const rounds = [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, rts]) => ({
      round,
      label: label(round),
      // 3·4위전은 결승 뒤에
      ties: rts.sort((x, y) => Number(x.thirdPlace) - Number(y.thirdPlace) || x.startTime.getTime() - y.startTime.getTime()),
    }));
  // 순위 결정전(5위 이하) — 별도 열로 맨 뒤에
  if (restConsolation.length > 0) {
    rounds.push({
      round: maxRound + 1,
      label: "순위 결정전",
      ties: restConsolation
        .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
        .map((m) => ({ ...m, round: maxRound + 1, thirdPlace: false })),
    });
  }
  return { rounds };
}
