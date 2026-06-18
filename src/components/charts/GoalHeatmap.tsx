// 팀 골 위치 히트맵 — 시즌 골 슈터 위치 누적(공격 방향 오른쪽으로 정규화). "어디서 골이 나나".
// goal/line 의 슈터 좌표(0~100)를 반투명 점으로 겹쳐 밀도 표현. 골만이라 슛맵 아닌 골 히트맵.

const W = 105;
const H = 68;
const tx = (x: number) => (x / 100) * W;
const ty = (y: number) => (y / 100) * H;

interface Props {
  spots: { x: number; y: number }[]; // 공격 방향 정규화된 슈터 좌표 (0~100)
  teamName: string;
}

export default function GoalHeatmap({ spots, teamName }: Props) {
  if (spots.length < 3) return null;
  // 박스 근처 비율 (콘텐츠 멘트용)
  const inBox = spots.filter((s) => s.x >= 83).length;
  const boxPct = Math.round((inBox / spots.length) * 100);

  return (
    <div>
      <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} className="w-full rounded-lg" style={{ background: "#1a7a3c" }}>
        {/* 피치 라인 (오른쪽이 공격 골문) */}
        <g stroke="rgba(255,255,255,0.45)" strokeWidth={0.3} fill="none">
          <rect x={0} y={0} width={W} height={H} />
          <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
          <circle cx={W / 2} cy={H / 2} r={9.15} />
          <rect x={W - 16.5} y={(H - 40.3) / 2} width={16.5} height={40.3} />
          <rect x={W - 5.5} y={(H - 18.3) / 2} width={5.5} height={18.3} />
        </g>
        {/* 골 위치 — 반투명 점 겹침 = 밀도 */}
        {spots.map((s, i) => (
          <circle key={i} cx={tx(s.x)} cy={ty(s.y)} r={2.4} fill="#fbbf24" opacity={0.32} />
        ))}
        {/* 공격 방향 표시 */}
        <text x={W - 2} y={H - 1.5} fontSize={2.6} fill="rgba(255,255,255,0.7)" textAnchor="end">
          공격 →
        </text>
      </svg>
      <p className="mt-2 text-xs text-neutral-500">
        {teamName} 시즌 득점 {spots.length}골의 슈팅 위치 · 페널티박스 안 {boxPct}% · 진한 곳일수록 골이 자주 나는 지점
      </p>
    </div>
  );
}
