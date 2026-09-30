// 플레이오프 확률 엔진 (순수 함수) — 남은 정규시즌을 경기 단위로 샘플 → 리그 규정으로 시드 → 플레이오프를 끝까지 샘플.
// 결과 = 팀별 "도달 단계" 확률. 단계 0 = 탈락(진출 실패), 1 = 플레이오프 진출 … 마지막 = 우승.
// 데이터 조회·캐시는 load.ts. 형식별 규칙 근거는 reports/plans/playoff-odds-all/plan.md.

export type PlayoffFormat = "KBO" | "NPB" | "NHL" | "NBA" | "KHL" | "MLS" | "KBL";
export type Sport = "baseball" | "basketball" | "hockey" | "soccer";

export const FORMAT_SPORT: Record<PlayoffFormat, Sport> = {
  KBO: "baseball", NPB: "baseball", NHL: "hockey", NBA: "basketball", KHL: "hockey", MLS: "soccer", KBL: "basketball",
};

/** 표 열 이름 — 단계 1부터. 마지막이 우승 */
export const STAGES: Record<PlayoffFormat, string[]> = {
  KBO: ["가을야구", "준PO", "PO", "한국시리즈", "우승"],
  NPB: ["CS 진출", "CS 파이널", "일본시리즈", "우승"],
  NHL: ["PO 진출", "2라운드", "컨퍼런스 결승", "스탠리컵 결승", "우승"],
  NBA: ["PO 진출", "2라운드", "컨퍼런스 결승", "파이널", "우승"],
  KHL: ["PO 진출", "2라운드", "컨퍼런스 결승", "가가린컵 결승", "우승"],
  MLS: ["PO 진출", "컨퍼런스 4강", "컨퍼런스 결승", "MLS컵 결승", "우승"],
  KBL: ["6강 PO", "4강", "챔피언결정전", "우승"],
};

export interface SimTeam {
  id: number;
  /** 컨퍼런스·리그(센트럴/퍼시픽) — 단일 표 리그는 "ALL" */
  group: string;
  /** NHL 지구 */
  division?: string;
  w: number;
  l: number;
  d: number;
  otl: number;
  /** 하키·축구 현재 승점(공식 표). 없으면 계산 */
  pts?: number;
}
export interface SimGame { home: number; away: number }
/** 홈 팀 기준 경기 확률 */
export type GameProb = (home: number, away: number) => { home: number; draw: number; away: number };

export interface PlayoffOdds {
  teamId: number;
  group: string;
  /** stage[k] = 단계 k+1 이상 도달 확률 (STAGES 순서) */
  stage: number[];
  /** 평균 최종 순위(그룹 안) */
  expectedRank: number;
}

const HOCKEY_OT_RATE = 0.23;

interface Rec { w: number; l: number; d: number; otl: number; pts: number }

function pct(r: Rec) {
  return r.w + r.l > 0 ? r.w / (r.w + r.l) : 0;
}

export interface PlayoffSimOptions {
  /** 정규시즌 종료 후 — 그룹별 최종 순위(공식 표 순서). 있으면 잔여 경기·동률 추첨 없이 이 순서로 시드 */
  fixedRank?: Map<string, number[]>;
  /** 실제 포스트시즌 시리즈 승수 — (a, b) 순서로 [a 승, b 승]. 없으면 null */
  known?: (a: number, b: number) => [number, number] | null;
}

export function runPlayoffSim(
  format: PlayoffFormat,
  teams: SimTeam[],
  remaining: SimGame[],
  prob: GameProb,
  iterations = 3000,
  rand: () => number = Math.random,
  opts: PlayoffSimOptions = {},
): PlayoffOdds[] {
  const sport = FORMAT_SPORT[format];
  const nStage = STAGES[format].length;
  const ids = teams.map((t) => t.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const reach = ids.map(() => new Array<number>(nStage).fill(0));
  const rankSum = ids.map(() => 0);
  const byId = new Map(teams.map((t) => [t.id, t]));
  const games = remaining.filter((g) => idx.has(g.home) && idx.has(g.away));

  const basePts = (t: SimTeam) =>
    t.pts ?? (sport === "hockey" ? 2 * t.w + t.otl : sport === "soccer" ? 3 * t.w + t.d : t.w);

  // 한 경기 — 무승부 없는 종목은 무승부 확률을 둘로 나눈다
  const play = (home: number, away: number, allowDraw: boolean): 0 | 1 | 2 => {
    const p = prob(home, away);
    const r = rand();
    if (allowDraw) return r < p.home ? 1 : r < p.home + p.draw ? 0 : 2;
    const h = p.home + p.draw / 2;
    return r < h ? 1 : 2;
  };
  /** 시리즈 — top 이 상위 시드. pattern 은 top 기준 H/A. start=[top, bot] 선승 어드밴티지. 반환 승자 */
  const series = (top: number, bot: number, bestOf: number, pattern: string, start: [number, number] = [0, 0], topWinsTies = false): number => {
    const need = Math.ceil(bestOf / 2);
    // 실제로 치른 경기 승수를 얹고, 홈 순서는 치른 경기 수만큼 건너뛴다
    const k = opts.known?.(top, bot) ?? [0, 0];
    let a = start[0] + k[0];
    let b = start[1] + k[1];
    for (let g = k[0] + k[1]; g < pattern.length && a < need && b < need; g++) {
      const topHome = pattern[g] !== "A";
      const res = topHome ? play(top, bot, sport === "baseball") : play(bot, top, sport === "baseball");
      if (res === 0) continue; // 야구 무승부 — 승수 없음
      const topWon = topHome ? res === 1 : res === 2;
      if (topWon) a++;
      else b++;
    }
    if (a >= need) return top;
    if (b >= need) return bot;
    return topWinsTies || a >= b ? top : bot; // 무승부로 결판 안 나면 상위 시드(NPB·KBO 규정)
  };
  /** 단판 — 무승부면 승부차기 50% */
  const single = (home: number, away: number): number => {
    const res = play(home, away, sport === "soccer");
    if (res === 1) return home;
    if (res === 2) return away;
    return rand() < 0.5 ? home : away;
  };

  for (let it = 0; it < iterations; it++) {
    const rec = new Map<number, Rec>(teams.map((t) => [t.id, { w: t.w, l: t.l, d: t.d, otl: t.otl, pts: basePts(t) }]));
    for (const g of games) {
      const h = rec.get(g.home)!;
      const a = rec.get(g.away)!;
      if (sport === "hockey") {
        const res = play(g.home, g.away, false);
        const ot = rand() < HOCKEY_OT_RATE;
        const [win, lose] = res === 1 ? [h, a] : [a, h];
        win.w++;
        win.pts += 2;
        if (ot) { lose.otl++; lose.pts += 1; } else lose.l++;
      } else {
        const res = play(g.home, g.away, sport === "soccer" || sport === "baseball");
        if (res === 1) { h.w++; a.l++; h.pts += sport === "soccer" ? 3 : 1; }
        else if (res === 2) { a.w++; h.l++; a.pts += sport === "soccer" ? 3 : 1; }
        else { h.d++; a.d++; if (sport === "soccer") { h.pts++; a.pts++; } }
      }
    }
    const tb = new Map(ids.map((id) => [id, rand()]));
    const key = (id: number) => {
      const r = rec.get(id)!;
      return sport === "hockey" || sport === "soccer" ? r.pts * 1000 + r.w + tb.get(id)! : pct(r) * 1000 + tb.get(id)!;
    };
    const sortIds = (list: number[]) => [...list].sort((x, y) => key(y) - key(x));
    const groups = new Map<string, number[]>();
    for (const t of teams) groups.set(t.group, [...(groups.get(t.group) ?? []), t.id]);
    const ranked = opts.fixedRank ?? new Map([...groups].map(([g, list]) => [g, sortIds(list)]));
    for (const list of ranked.values()) list.forEach((id, i) => (rankSum[idx.get(id)!] += i + 1));

    const lvl = new Map<number, number>();
    const set = (id: number, l: number) => lvl.set(id, Math.max(lvl.get(id) ?? 0, l));
    const better = (x: number, y: number) => (key(x) >= key(y) ? [x, y] : [y, x]) as [number, number];

    let champ: number;
    if (format === "KBO") {
      const s = ranked.get("ALL")!.slice(0, 5);
      s.forEach((id) => set(id, 1));
      set(s[2], 2); set(s[1], 3); set(s[0], 4);
      const wc = series(s[3], s[4], 3, "HH", [1, 0], true); // 4위 1승 안고 2경기 모두 홈
      set(wc, 2);
      const spo = series(s[2], wc, 5, "HHAAH");
      set(spo, 3);
      const po = series(s[1], spo, 5, "HHAAH");
      set(po, 4);
      champ = series(s[0], po, 7, "HHAAAHH");
    } else if (format === "NPB") {
      const finals: number[] = [];
      for (const list of ranked.values()) {
        const s = list.slice(0, 3);
        s.forEach((id) => set(id, 1));
        set(s[0], 2);
        const first = series(s[1], s[2], 3, "HHH", [0, 0], true);
        set(first, 2);
        const fin = series(s[0], first, 7, "HHHHHH", [1, 0], true); // 1위 1승 어드밴티지·전 경기 홈
        set(fin, 3);
        finals.push(fin);
      }
      const [top, bot] = better(finals[0], finals[1]);
      champ = series(top, bot, 7, "HHAAAHH");
    } else if (format === "NBA") {
      const finalsTeams: number[] = [];
      for (const list of ranked.values()) {
        const s = list.slice(0, 10);
        const w78 = single(s[6], s[7]);
        const l78 = w78 === s[6] ? s[7] : s[6];
        const w910 = single(s[8], s[9]);
        const eighth = single(l78, w910);
        const seeds = [...s.slice(0, 6), w78, eighth];
        seeds.forEach((id) => set(id, 1));
        const r1 = [[0, 7], [3, 4], [1, 6], [2, 5]].map(([a, b]) => series(seeds[a], seeds[b], 7, "HHAAHAH"));
        r1.forEach((id) => set(id, 2));
        const r2 = [0, 2].map((i) => { const [t, b] = better(r1[i], r1[i + 1]); return series(t, b, 7, "HHAAHAH"); });
        r2.forEach((id) => set(id, 3));
        const [t, b] = better(r2[0], r2[1]);
        const cf = series(t, b, 7, "HHAAHAH");
        set(cf, 4);
        finalsTeams.push(cf);
      }
      const [top, bot] = better(finalsTeams[0], finalsTeams[1]);
      champ = series(top, bot, 7, "HHAAHAH");
    } else if (format === "NHL") {
      const finalsTeams: number[] = [];
      for (const list of ranked.values()) {
        const divs = [...new Set(list.map((id) => byId.get(id)!.division ?? "?"))];
        const top3 = new Map(divs.map((d) => [d, list.filter((id) => byId.get(id)!.division === d).slice(0, 3)]));
        const inTop = new Set([...top3.values()].flat());
        const wcs = list.filter((id) => !inTop.has(id)).slice(0, 2);
        [...inTop, ...wcs].forEach((id) => set(id, 1));
        // 지구 1위 중 승점 높은 쪽이 WC2, 낮은 쪽이 WC1
        const leaders = divs.map((d) => top3.get(d)![0]).sort((x, y) => key(y) - key(x));
        const sides = divs
          .map((d) => {
            const t = top3.get(d)!;
            const wc = t[0] === leaders[0] ? wcs[1] : wcs[0];
            const a = series(t[0], wc, 7, "HHAAHAH");
            const [bt, bb] = better(t[1], t[2]);
            const b = series(bt, bb, 7, "HHAAHAH");
            set(a, 2); set(b, 2);
            const [x, y] = better(a, b);
            const w = series(x, y, 7, "HHAAHAH");
            set(w, 3);
            return w;
          });
        const [t, b] = better(sides[0], sides[1]);
        const cf = series(t, b, 7, "HHAAHAH");
        set(cf, 4);
        finalsTeams.push(cf);
      }
      const [top, bot] = better(finalsTeams[0], finalsTeams[1]);
      champ = series(top, bot, 7, "HHAAHAH");
    } else if (format === "KHL") {
      const finalsTeams: number[] = [];
      for (const list of ranked.values()) {
        let alive = list.slice(0, 8);
        alive.forEach((id) => set(id, 1));
        for (let round = 2; alive.length > 1; round++) {
          const sorted = sortIds(alive);
          const next: number[] = [];
          for (let i = 0; i < sorted.length / 2; i++) next.push(series(sorted[i], sorted[sorted.length - 1 - i], 7, "HHAAHAH"));
          next.forEach((id) => set(id, Math.min(round, 4)));
          alive = next;
        }
        finalsTeams.push(alive[0]);
      }
      const [top, bot] = better(finalsTeams[0], finalsTeams[1]);
      champ = series(top, bot, 7, "HHAAHAH");
    } else if (format === "MLS") {
      const finalsTeams: number[] = [];
      for (const list of ranked.values()) {
        const s = list.slice(0, 9);
        s.forEach((id) => set(id, 1));
        const wc = single(s[7], s[8]);
        const seeds = [...s.slice(0, 7), wc];
        const r1 = [[0, 7], [3, 4], [1, 6], [2, 5]].map(([a, b]) => series(seeds[a], seeds[b], 3, "HAH"));
        r1.forEach((id) => set(id, 2));
        const semis = [0, 2].map((i) => { const [h, a] = better(r1[i], r1[i + 1]); return single(h, a); });
        semis.forEach((id) => set(id, 3));
        const [h, a] = better(semis[0], semis[1]);
        const cf = single(h, a);
        set(cf, 4);
        finalsTeams.push(cf);
      }
      const [h, a] = better(finalsTeams[0], finalsTeams[1]);
      champ = single(h, a);
    } else {
      // KBL
      const s = ranked.get("ALL")!.slice(0, 6);
      s.forEach((id) => set(id, 1));
      set(s[0], 2); set(s[1], 2);
      const q36 = series(s[2], s[5], 5, "HHAAH");
      const q45 = series(s[3], s[4], 5, "HHAAH");
      set(q36, 2); set(q45, 2);
      const sf1 = series(s[0], q45, 5, "HHAAH");
      const sf2 = series(s[1], q36, 5, "HHAAH");
      set(sf1, 3); set(sf2, 3);
      const [top, bot] = better(sf1, sf2);
      champ = series(top, bot, 7, "HHAAAHH");
    }
    set(champ, nStage);
    for (const [id, l] of lvl) {
      const r = reach[idx.get(id)!];
      for (let k = 0; k < l; k++) r[k]++;
    }
  }

  return teams.map((t) => ({
    teamId: t.id,
    group: t.group,
    stage: reach[idx.get(t.id)!].map((c) => c / iterations),
    expectedRank: rankSum[idx.get(t.id)!] / iterations,
  }));
}
