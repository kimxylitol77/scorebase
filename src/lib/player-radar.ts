// 축구 선수 시즌 스탯 → 레이더 8축 0~100 정규화. 선수 페이지(PlayerSeasonOverview)·선수 비교(ComparePlayerRadar) 공용.
// per90 지표는 엘리트 상한 cap 으로 정규화, %지표(정확도)는 그대로. 단일 출처라 두 화면 축·스케일 일치 보장.

export interface RadarStat {
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  shots: number | null;
  sot: number | null;
  keyPasses: number | null;
  passAcc: number | null;
  tackles: number | null;
  interceptions: number | null;
  // 모던 지표(있으면 사용, 없으면 0) — 드리블 성공률·경합 승률
  dribbles?: number | null; // 성공한 드리블
  dribbleAtt?: number | null; // 시도한 드리블
  duelsWon?: number | null;
  duelsTotal?: number | null;
}

export interface RadarAxis {
  axis: string;
  value: number; // 0~100 정규화
  raw: string; // 실제 수치 텍스트
}

const n = (v: number | null | undefined) => v ?? 0;
const clamp = (v: number) => Math.max(0, Math.min(100, v));

const AXES: {
  label: string;
  raw: (s: RadarStat, p90: (v: number | null) => number) => { v: number; text: string };
}[] = [
  { label: "골/90", raw: (s, p90) => ({ v: clamp((p90(s.goals) / 0.8) * 100), text: p90(s.goals).toFixed(2) }) },
  { label: "도움/90", raw: (s, p90) => ({ v: clamp((p90(s.assists) / 0.6) * 100), text: p90(s.assists).toFixed(2) }) },
  { label: "슈팅 정확도", raw: (s) => { const a = n(s.shots) > 0 ? (n(s.sot) / n(s.shots)) * 100 : 0; return { v: clamp(a), text: `${Math.round(a)}%` }; } },
  { label: "키패스/90", raw: (s, p90) => ({ v: clamp((p90(s.keyPasses) / 3) * 100), text: p90(s.keyPasses).toFixed(2) }) },
  { label: "패스 정확도", raw: (s) => ({ v: clamp(n(s.passAcc)), text: `${Math.round(n(s.passAcc))}%` }) },
  // 드리블 성공률 — 시도 대비 성공 (시도 없으면 0)
  { label: "드리블 성공률", raw: (s) => { const a = n(s.dribbleAtt) > 0 ? (n(s.dribbles) / n(s.dribbleAtt)) * 100 : 0; return { v: clamp(a), text: `${Math.round(a)}%` }; } },
  // 경합 승률 — 총 경합 대비 승 (경합 없으면 0)
  { label: "경합 승률", raw: (s) => { const a = n(s.duelsTotal) > 0 ? (n(s.duelsWon) / n(s.duelsTotal)) * 100 : 0; return { v: clamp(a), text: `${Math.round(a)}%` }; } },
  // 수비 액션/90 — 태클+인터셉트 통합 (엘리트 상한 7)
  { label: "수비/90", raw: (s, p90) => { const d = p90(s.tackles) + p90(s.interceptions); return { v: clamp((d / 7) * 100), text: d.toFixed(2) }; } },
];

/** 시즌 스탯을 레이더 7축(0~100 정규화 + 실제 수치 텍스트)으로 변환 */
export function toRadarAxes(stat: RadarStat): RadarAxis[] {
  const mins = n(stat.minutes);
  const p90 = (v: number | null) => (mins > 0 ? (n(v) / mins) * 90 : 0);
  return AXES.map((a) => {
    const { v, text } = a.raw(stat, p90);
    return { axis: a.label, value: Math.round(v), raw: text };
  });
}
