// 커리어 시뮬레이터 엔진 — 성장·스탯·이적 제안·은퇴를 계산하는 순수 함수 모음
// 서버·DB 를 쓰지 않는다. 같은 시드를 넣으면 같은 커리어가 나오므로 테스트가 가능하다.
import type { CareerState, Club, ClubOption, Decision, Position, Spell } from "./types";
import { LEAGUES } from "./leagues";

/** mulberry32 — 시드 하나로 재현 가능한 난수 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng: () => number, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];

/** 티어별 "그 리그 주전의 평균 능력치" — 출전 시간과 이적 제안의 기준선 */
const TIER_OVR: Record<number, number> = { 1: 80, 2: 75, 3: 70, 4: 64, 5: 58, 6: 52 };

/** 능력치를 뛸 만한 리그 티어로 환산 */
export function ovrToTier(ovr: number): number {
  if (ovr >= 84) return 1;
  if (ovr >= 78) return 2;
  if (ovr >= 72) return 3;
  if (ovr >= 65) return 4;
  if (ovr >= 58) return 5;
  return 6;
}

/** 능력치 → 몸값(€M). 구간 보간으로 곡선을 만든다. */
const VALUE_TABLE: [number, number][] = [
  [45, 0.05], [50, 0.15], [55, 0.6], [60, 1.6], [65, 3.8],
  [70, 9], [75, 20], [80, 42], [85, 75], [90, 115], [95, 165],
];

/** 나이에 따른 몸값 배수 — 20대 중반이 정점, 30 넘으면 빠르게 꺾인다 */
function ageMultiplier(age: number): number {
  if (age <= 19) return 1.15;
  if (age <= 22) return 1.1;
  if (age <= 28) return 1.0;
  if (age === 29) return 0.85;
  if (age === 30) return 0.7;
  if (age === 31) return 0.55;
  if (age === 32) return 0.42;
  if (age === 33) return 0.3;
  if (age === 34) return 0.2;
  return 0.12;
}

export function valueOf(ovr: number, age: number): number {
  const t = VALUE_TABLE;
  let base = t[t.length - 1][1];
  if (ovr <= t[0][0]) base = t[0][1];
  else {
    for (let i = 0; i < t.length - 1; i++) {
      const [o1, v1] = t[i];
      const [o2, v2] = t[i + 1];
      if (ovr >= o1 && ovr <= o2) {
        base = v1 + ((v2 - v1) * (ovr - o1)) / (o2 - o1);
        break;
      }
    }
  }
  const v = base * ageMultiplier(age);
  return v < 1 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10;
}

/** 2년 동안의 능력치 증감 */
function growth(ovr: number, potential: number, age: number, rng: () => number): number {
  if (age >= 30) return -randInt(rng, 1, age >= 34 ? 5 : 3);
  if (age >= 27) return randInt(rng, -1, 1);
  const gap = Math.max(0, potential - ovr);
  const rate = age <= 19 ? 0.38 : age <= 23 ? 0.26 : 0.14;
  return Math.max(0, Math.round(gap * rate) + randInt(rng, -1, 2));
}

/** 구단 수준 대비 내 능력치로 출전 수를 정한다 (2시즌 = 최대 68경기) */
function appearances(ovr: number, club: Club, rng: () => number): number {
  const fit = ovr - TIER_OVR[club.t];
  if (fit >= 3) return randInt(rng, 54, 68);
  if (fit >= -3) return randInt(rng, 34, 53);
  return randInt(rng, 10, 33);
}

function goalsAssists(pos: Position, ovr: number, apps: number, rng: () => number): [number, number] {
  if (pos === "GK") return [0, 0];
  const q = Math.max(0.5, Math.min(1.6, (ovr - 55) / 25 + 0.6));
  const rate: Record<Exclude<Position, "GK">, [number, number]> = {
    FW: [0.42, 0.14],
    MF: [0.14, 0.22],
    DF: [0.05, 0.06],
  };
  const [gr, ar] = rate[pos];
  const noise = () => 0.75 + rng() * 0.5;
  return [Math.round(apps * gr * q * noise()), Math.round(apps * ar * q * noise())];
}

/** 상위 구단일수록 우승 확률이 높다 */
function titlesWon(club: Club, ovr: number, rng: () => number): number {
  const base: Record<number, number> = { 1: 0.5, 2: 0.3, 3: 0.22, 4: 0.12, 5: 0.06, 6: 0.03 };
  const p = base[club.t] * (ovr >= TIER_OVR[club.t] ? 1.25 : 0.7);
  let n = 0;
  if (rng() < p) n++;
  if (rng() < p * 0.4) n++;
  return n;
}

export function startCareer(nation: string, position: Position, rng: () => number): CareerState {
  const ovr = randInt(rng, 46, 54);
  return {
    nation,
    position,
    age: 16,
    ovr,
    potential: Math.min(99, ovr + randInt(rng, 18, 45)),
    value: valueOf(ovr, 16),
    club: null,
    history: [],
    caps: 0,
    capGoals: 0,
    retired: false,
  };
}

function sample(rng: () => number, arr: Club[], n: number): Club[] {
  const copy = arr.slice();
  const out: Club[] = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return out;
}

/** 티어를 넓혀가며 후보를 채운다. 특정 국가에 구단이 적어도 빈손이 되지 않게 한다. */
function clubsNear(clubs: Club[], tier: number, country: string | null, rng: () => number, want: number): Club[] {
  const out: Club[] = [];
  for (let spread = 0; spread <= 5 && out.length < want; spread++) {
    for (const t of [tier + spread, tier - spread]) {
      if (t < 1 || t > 6) continue;
      const pool = clubs.filter(
        (c) => c.t === t && (country ? c.c === country : true) && !out.includes(c),
      );
      out.push(...sample(rng, pool, want - out.length));
      if (out.length >= want) break;
    }
  }
  return out;
}

/** 16세 유스 제안 — 자국 리그에서 3곳 */
export function youthOffers(clubs: Club[], nation: string, rng: () => number): Club[] {
  const home = clubsNear(clubs, 5, nation, rng, 3);
  if (home.length >= 3) return home;
  // 자국 구단이 부족하면 해외 하위 리그로 채운다
  return [...home, ...clubsNear(clubs, 5, null, rng, 3 - home.length)];
}

/** 현재 능력치에 맞는 이적 제안. 잔류 선택지를 포함한다. */
export function transferOffers(state: CareerState, clubs: Club[], rng: () => number): ClubOption[] {
  const tier = ovrToTier(state.ovr);
  const taken = new Set<string>([state.club?.n ?? ""]);
  const out: Club[] = [];

  // 셋 중 하나는 자국 리그에서 — 전부 낯선 나라만 뜨면 커리어가 겉돈다
  if (rng() < 0.45) {
    const home = clubsNear(clubs, tier, state.nation, rng, 1).filter((c) => !taken.has(c.n));
    if (home[0]) { out.push(home[0]); taken.add(home[0].n); }
  }
  for (const c of clubsNear(clubs, tier, null, rng, 4)) {
    if (out.length >= 2) break;
    if (taken.has(c.n)) continue;
    out.push(c);
    taken.add(c.n);
  }

  const opts: ClubOption[] = out.map((club) => ({ club, stay: false }));
  if (state.club) opts.push({ club: state.club, stay: true });
  return opts;
}

/**
 * 갈림길 생성. 확률형 이벤트는 20대에 가끔 끼어든다.
 * allowEvent=false 면 반드시 구단 선택을 돌려준다 — 이벤트가 연달아 나오는 것을 막는다.
 */
export function nextDecision(
  state: CareerState,
  clubs: Club[],
  rng: () => number,
  allowEvent = true,
): Decision {
  if (!state.club) {
    return {
      kind: "club",
      title: "유스 입단 제안",
      desc: "세 구단이 유스 합류를 제안했습니다. 커리어를 시작할 곳을 고르세요.",
      youth: true,
      options: youthOffers(clubs, state.nation, rng).map((club) => ({ club, stay: false })),
    };
  }
  if (allowEvent && state.age >= 22 && state.age <= 30 && rng() < 0.35) {
    return pick(rng, EVENTS);
  }
  const options = transferOffers(state, clubs, rng);
  const renewed = state.ovr >= TIER_OVR[state.club.t] - 6;
  if (state.age >= 32) {
    options.push({ club: state.club, stay: true, retire: true });
  }
  return {
    kind: "club",
    title: renewed ? "이적 시장" : "계약 만료",
    desc: renewed
      ? "지난 두 시즌을 지켜본 구단들이 제안을 보내왔습니다."
      : "구단이 재계약하지 않기로 했습니다. 다음 행선지를 고르세요.",
    options: renewed ? options : options.filter((o) => !o.stay || o.retire),
  };
}

/** 20대에 등장하는 확률형 갈림길 */
const EVENTS: Decision[] = [
  {
    kind: "event",
    title: "이중 훈련",
    desc: "하루 두 번 훈련해 기량을 끌어올릴 수 있습니다. 다만 몸에 무리가 갑니다.",
    options: [
      {
        id: "push",
        label: "전력으로 훈련",
        desc: "기량이 크게 오르지만 부상 위험을 감수합니다.",
        odds: { good: "성장", goodPct: 65, bad: "부상", badPct: 35 },
      },
      { id: "rest", label: "부하를 낮춘다", desc: "안전하게 가되 성장은 더딥니다.", odds: null },
    ],
  },
  {
    kind: "event",
    title: "대표팀 차출",
    desc: "시즌 중 대표팀 소집이 겹쳤습니다. 장거리 이동이 부담입니다.",
    options: [
      {
        id: "join",
        label: "대표팀에 간다",
        desc: "A매치 출전이 쌓이지만 체력 소모가 큽니다.",
        odds: { good: "무사 복귀", goodPct: 70, bad: "피로 누적", badPct: 30 },
      },
      { id: "skip", label: "소집을 고사한다", desc: "소속팀에 집중합니다.", odds: null },
    ],
  },
];

/** 이벤트 선택의 결과를 상태에 반영한다. 화면에 띄울 문구를 함께 돌려준다. */
export function applyEvent(state: CareerState, optionId: string, rng: () => number): { state: CareerState; message: string } {
  const s = { ...state };
  if (optionId === "push") {
    if (rng() < 0.65) {
      s.ovr = Math.min(99, s.ovr + 3);
      return { state: s, message: "혹독한 훈련이 통했습니다. 기량이 눈에 띄게 올랐습니다." };
    }
    s.ovr = Math.max(40, s.ovr - 2);
    return { state: s, message: "훈련 중 부상을 당했습니다. 회복까지 시간이 걸립니다." };
  }
  if (optionId === "join") {
    if (rng() < 0.7) {
      s.caps += randInt(rng, 4, 9);
      s.capGoals += s.position === "FW" ? randInt(rng, 0, 3) : randInt(rng, 0, 1);
      return { state: s, message: "대표팀에서 좋은 활약을 남기고 돌아왔습니다." };
    }
    s.caps += randInt(rng, 2, 5);
    s.ovr = Math.max(40, s.ovr - 1);
    return { state: s, message: "강행군이 겹쳐 피로가 쌓였습니다." };
  }
  if (optionId === "rest") return { state: s, message: "무리하지 않고 시즌을 준비했습니다." };
  return { state: s, message: "소속팀에 집중하기로 했습니다." };
}

/** 구단을 정하고 두 시즌을 보낸다 */
export function advance(state: CareerState, club: Club, rng: () => number): CareerState {
  const apps = appearances(state.ovr, club, rng);
  const [goals, assists] = goalsAssists(state.position, state.ovr, apps, rng);
  const titles = titlesWon(club, state.ovr, rng);

  const spell: Spell = { age: state.age, club, ovr: state.ovr, apps, goals, assists, titles };
  const nextOvr = Math.max(40, Math.min(99, state.ovr + growth(state.ovr, state.potential, state.age, rng)));
  const nextAge = state.age + 2;

  // 능력치가 일정 수준을 넘으면 대표팀에 뽑힌다
  let caps = state.caps;
  let capGoals = state.capGoals;
  if (state.ovr >= 70) {
    caps += randInt(rng, 6, 14);
    capGoals += state.position === "FW" ? randInt(rng, 1, 5) : state.position === "MF" ? randInt(rng, 0, 3) : randInt(rng, 0, 1);
  }

  return {
    ...state,
    club,
    age: nextAge,
    ovr: nextOvr,
    value: valueOf(nextOvr, nextAge),
    history: [...state.history, spell],
    caps,
    capGoals,
    retired: nextAge > 38,
  };
}

export function retire(state: CareerState): CareerState {
  return { ...state, retired: true };
}

export interface CareerSummary {
  apps: number;
  goals: number;
  assists: number;
  titles: number;
  peakOvr: number;
  peakValue: number;
  clubs: number;
  seasons: number;
}

export function summarize(state: CareerState): CareerSummary {
  const h = state.history;
  return {
    apps: h.reduce((a, s) => a + s.apps, 0),
    goals: h.reduce((a, s) => a + s.goals, 0),
    assists: h.reduce((a, s) => a + s.assists, 0),
    titles: h.reduce((a, s) => a + s.titles, 0),
    peakOvr: h.reduce((a, s) => Math.max(a, s.ovr), state.ovr),
    peakValue: h.reduce((a, s) => Math.max(a, valueOf(s.ovr, s.age)), 0),
    clubs: new Set(h.map((s) => s.club.n)).size,
    seasons: h.length * 2,
  };
}

/** 리그 코드를 표시용 이름으로 */
export function leagueLabel(code: string): string {
  return LEAGUES[code]?.label ?? code;
}
