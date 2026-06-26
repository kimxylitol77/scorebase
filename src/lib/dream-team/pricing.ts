// 드림팀 선수 시세 — 기본 몸값에 육성(키운 만큼)·시즌 폼(랜덤 변동)을 반영. 싸게 사서 키워 비싸게.
import { grownOvr } from "./grow";
import type { DreamPlayer } from "./pool";

// 시즌·선수 결정적 폼 계수 (0.85~1.15) — 시즌마다 시세가 출렁이게
function seasonForm(id: string, seasonNo: number): number {
  let h = (seasonNo + 1) * 2654435761;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const r = ((h >>> 0) % 1000) / 1000;
  return 0.85 + r * 0.3;
}

// 선수 현재 시세(€M) — 기본 몸값 × 육성 보너스(OVR 1↑당 +10%) × 시즌 폼
export function marketValue(base: DreamPlayer, xp: number, seasonNo: number): number {
  const grown = grownOvr(base.ovr, base.potential, xp);
  const growthBonus = 1 + Math.max(0, grown - base.ovr) * 0.1;
  return Math.max(1, Math.round(base.value * growthBonus * seasonForm(base.id, seasonNo)));
}
