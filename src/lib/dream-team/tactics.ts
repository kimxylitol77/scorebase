// 드림팀 전술(멘탈리티) 정의 — 시뮬 람다 계수와 상성. 게임 전용(실데이터 무관).

export interface Mentality {
  key: string;
  name: string; // 한국어 라벨
  desc: string; // 빌더 설명 한 줄
  atk: number; // 내 득점 람다 배수 (공격성)
  exp: number; // 내 수비 노출 배수 → 상대 득점 람다에 곱
}

// atk·exp 는 1.0(균형) 기준 ± 배수. 양 팀 멘탈리티가 두 람다에 함께 곱해져
// "둘 다 공격=난타전 / 둘 다 수비=짠물 / 공격 vs 수비=상성" 이 자연스럽게 발생.
// 계수는 전력(OVR) 위에 얹는 보조 레이어 — 전력차를 뒤집지 않는 범위로 보수적 설정.
export const MENTALITIES: Record<string, Mentality> = {
  ultra_attack: { key: "ultra_attack", name: "초공격", desc: "전원 공격 — 다득점을 노리지만 뒷공간이 크게 열린다", atk: 1.3, exp: 1.28 },
  attack: { key: "attack", name: "공격", desc: "공격 우위 — 화력을 끌어올린다", atk: 1.15, exp: 1.12 },
  balanced: { key: "balanced", name: "균형", desc: "공수 균형 — 무난한 표준 전술", atk: 1.0, exp: 1.0 },
  defend: { key: "defend", name: "수비", desc: "안정 우선 — 실점을 줄이고 기회를 노린다", atk: 0.86, exp: 0.84 },
  ultra_defend: { key: "ultra_defend", name: "초수비", desc: "버스 — 극단적으로 잠그고 역습을 노린다", atk: 0.72, exp: 0.7 },
};

export const MENTALITY_ORDER = ["ultra_attack", "attack", "balanced", "defend", "ultra_defend"];

export function getMentality(key: string | null | undefined): Mentality {
  return (key && MENTALITIES[key]) || MENTALITIES.balanced;
}

// 선수 역할 — 같은 선수의 OVR 을 공격/수비 어느 쪽에 더 싣느냐(공격 share 보정).
export interface Role {
  key: string;
  name: string;
  short: string; // 배지용 한 글자
  atkBias: number; // 포지션 기본 공격 share 에 더할 값
}

export const ROLES: Record<string, Role> = {
  attack: { key: "attack", name: "공격형", short: "공", atkBias: 0.18 },
  balanced: { key: "balanced", name: "균형", short: "균", atkBias: 0 },
  defend: { key: "defend", name: "수비형", short: "수", atkBias: -0.18 },
};

export const ROLE_ORDER = ["attack", "balanced", "defend"];

export function getRole(key: string | null | undefined): Role {
  return (key && ROLES[key]) || ROLES.balanced;
}

// 포지션별 공격 성향(0.5 기준, 나머지는 수비). FW 는 공격 쪽, DF·GK 는 수비 쪽.
const POS_ATK_BASE: Record<string, number> = { FW: 0.78, MF: 0.5, DF: 0.26, GK: 0.05 };

// 팀 성향(공격 lean)을 공·수 격차로 환산하는 계수. 클수록 역할 선택이 전력에 크게 반영.
const TILT_SPREAD = 30;

export interface TeamPower {
  atk: number; // 공격력 (OVR 스케일)
  def: number; // 수비력 (OVR 스케일)
}

// 스쿼드의 공격력·수비력 산출 — 팀 평균 OVR 을 중심으로 포지션+역할 성향만큼 공/수를 벌린다.
// 전원 균형이면 공=수(=평균 OVR). 공격형이 많을수록 공격력↑·수비력↓ (직관 일치).
export function teamStrength(players: { ovr: number; pos: string; role?: string }[]): TeamPower {
  if (!players.length) return { atk: 50, def: 50 };
  const avg = players.reduce((s, p) => s + p.ovr, 0) / players.length;
  let leanSum = 0;
  for (const p of players) {
    const base = POS_ATK_BASE[p.pos] ?? 0.5;
    leanSum += base + getRole(p.role).atkBias - 0.5; // 양수=공격 성향
  }
  const lean = leanSum / players.length;
  const clamp = (v: number) => Math.round(Math.max(40, Math.min(99, v)) * 10) / 10;
  return { atk: clamp(avg + lean * TILT_SPREAD), def: clamp(avg - lean * TILT_SPREAD) };
}

// 결과 카드용 전술 한 줄 코멘트 — 두 팀 멘탈리티 조합 + 결과로 분기
export function tacticNote(myKey: string, oppKey: string, outcome: "win" | "draw" | "loss", totalGoals: number): string {
  const isAtk = (k: string) => k === "ultra_attack" || k === "attack";
  const isDef = (k: string) => k === "ultra_defend" || k === "defend";
  const myAtk = isAtk(myKey);
  const myDef = isDef(myKey);
  const opAtk = isAtk(oppKey);
  const opDef = isDef(oppKey);

  if (myAtk && opAtk) return totalGoals >= 4 ? "양 팀의 공격 전술이 맞붙어 난타전이 벌어졌다." : "양 팀이 공격적으로 맞섰지만 골은 적었다.";
  if (myDef && opDef) return "양 팀 모두 단단히 잠그며 좀처럼 기회가 나지 않았다.";
  if (myAtk && opDef) return outcome === "win" ? "끈질긴 공격이 상대의 수비를 끝내 열어젖혔다." : "상대가 버스를 세우며 공격을 받아냈다.";
  if (myDef && opAtk) return outcome === "win" ? "수비 후 역습이 정확히 꽂혔다." : outcome === "draw" ? "두꺼운 수비로 상대의 강공을 버텨냈다." : "수비를 두텁게 했지만 끝내 균열이 났다.";
  return `${getMentality(myKey).name} 전술로 경기에 임했다.`;
}
