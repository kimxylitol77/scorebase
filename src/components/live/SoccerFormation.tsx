// 축구 포메이션 다이어그램 — 양 팀 startXI 를 한 piano 의 위/아래 절반에 plot.
// API-Football `grid="row:col"` 좌표 (row 1 = own goal, col 1 = 오른쪽).
//
// 레이아웃: 세로 피치 (높이 720) — 위 360 = away, 아래 360 = home.
// 양 팀 모두 GK 가 본인 골대 (각 끝) 에 위치, 공격수가 중앙선에 가까움.

interface FormationPlayer {
  number: number | null;
  name: string;
  pos: "G" | "D" | "M" | "F" | null;
  grid: string | null;
}

interface TeamLineup {
  teamName: string;
  formation: string | null;
  coach: string | null;
  startXI: FormationPlayer[];
  substitutes: FormationPlayer[];
}

interface Props {
  home: TeamLineup;
  away: TeamLineup;
  homeNameKo: string;
  awayNameKo: string;
}

const PITCH_W = 360;
const PITCH_H = 720;
const HALF_H = PITCH_H / 2;

function parseGrid(grid: string | null): { row: number; col: number } | null {
  if (!grid) return null;
  const [r, c] = grid.split(":").map((s) => parseInt(s, 10));
  if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
  return { row: r, col: c };
}

/**
 * grid 좌표를 한 팀의 half 안에서 (x, y) 픽셀로 변환.
 * - row 가 클수록 공격 방향 (중앙선 가까움)
 * - col 1 = 오른쪽 → x 큰 값, col N = 왼쪽 → x 작은 값
 *
 * `side` 가 "home" 이면 아래 half (y = HALF_H 시작), GK 는 맨 아래 (PITCH_H).
 * `side` 가 "away" 이면 위 half (y = 0 시작), GK 는 맨 위 (0).
 */
function gridToXY(
  grid: { row: number; col: number },
  maxRow: number,
  maxCol: number,
  side: "home" | "away",
): { x: number; y: number } {
  // x: col 1 (오른쪽) → 90% 위치, col maxCol → 10% 위치
  const colPct = maxCol > 1 ? (grid.col - 1) / (maxCol - 1) : 0.5;
  const x = PITCH_W * (0.9 - colPct * 0.8);
  // y: row 1 (own goal) → 본인 골대, row maxRow → 중앙선 가까움
  const rowPct = maxRow > 1 ? (grid.row - 1) / (maxRow - 1) : 0.5;
  let y: number;
  if (side === "home") {
    // home 아래 half — row 1 가 PITCH_H (맨 아래), row maxRow 가 HALF_H + 30
    y = PITCH_H - 40 - rowPct * (HALF_H - 60);
  } else {
    // away 위 half — row 1 가 0 + 40, row maxRow 가 HALF_H - 30
    y = 40 + rowPct * (HALF_H - 60);
  }
  return { x, y };
}

function plotTeam(
  players: FormationPlayer[],
  side: "home" | "away",
  color: string,
): Array<{ player: FormationPlayer; x: number; y: number }> {
  const positioned: Array<{
    player: FormationPlayer;
    grid: { row: number; col: number };
  }> = [];
  for (const p of players) {
    const g = parseGrid(p.grid);
    if (g) positioned.push({ player: p, grid: g });
  }
  if (positioned.length === 0) return [];
  const maxRow = Math.max(...positioned.map((p) => p.grid.row));
  // 같은 row 안의 player 수가 maxCol — 행마다 다를 수 있어 각 row 별 처리
  const result: Array<{ player: FormationPlayer; x: number; y: number }> = [];
  for (const item of positioned) {
    const rowMembers = positioned.filter((p) => p.grid.row === item.grid.row);
    const maxColInRow = Math.max(...rowMembers.map((p) => p.grid.col));
    const { x, y } = gridToXY(item.grid, maxRow, maxColInRow, side);
    result.push({ player: item.player, x, y });
  }
  // color 사용은 caller 에서 처리
  void color;
  return result;
}

function shortName(name: string): string {
  // "Hirokazu Ishihara" → "H. Ishihara" / 한글이면 그대로
  if (/[가-힣]/.test(name)) return name.length > 6 ? name.slice(0, 6) : name;
  const parts = name.split(/\s+/);
  if (parts.length <= 1) return name;
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

export default function SoccerFormation({ home, away, homeNameKo, awayNameKo }: Props) {
  const homePlayers = plotTeam(home.startXI, "home", "#dc2626");
  const awayPlayers = plotTeam(away.startXI, "away", "#1d4ed8");
  if (homePlayers.length === 0 && awayPlayers.length === 0) return null;

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-3">
      <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
        선발 라인업 · 포메이션
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-sm">
        <div className="text-right">
          <div className="font-bold truncate">{awayNameKo}</div>
          <div className="text-xs text-neutral-500">{away.formation ?? "—"}</div>
        </div>
        <div className="text-[10px] text-neutral-400 px-2">vs</div>
        <div className="text-left">
          <div className="font-bold truncate">{homeNameKo}</div>
          <div className="text-xs text-neutral-500">{home.formation ?? "—"}</div>
        </div>
      </div>

      <div className="flex justify-center">
        <svg
          viewBox={`0 0 ${PITCH_W} ${PITCH_H}`}
          className="w-full max-w-[300px]"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* 피치 배경 */}
          <rect width={PITCH_W} height={PITCH_H} fill="#15803d" />
          <rect x={4} y={4} width={PITCH_W - 8} height={PITCH_H - 8} fill="none" stroke="#fff" strokeWidth={2} opacity={0.5} />
          {/* 중앙선 */}
          <line x1={4} y1={HALF_H} x2={PITCH_W - 4} y2={HALF_H} stroke="#fff" strokeWidth={2} opacity={0.5} />
          {/* 중앙 원 */}
          <circle cx={PITCH_W / 2} cy={HALF_H} r={50} fill="none" stroke="#fff" strokeWidth={2} opacity={0.5} />
          {/* 페널티 박스 — 위 (away) */}
          <rect x={PITCH_W * 0.2} y={0} width={PITCH_W * 0.6} height={PITCH_H * 0.13} fill="none" stroke="#fff" strokeWidth={2} opacity={0.5} />
          {/* 페널티 박스 — 아래 (home) */}
          <rect x={PITCH_W * 0.2} y={PITCH_H * 0.87} width={PITCH_W * 0.6} height={PITCH_H * 0.13} fill="none" stroke="#fff" strokeWidth={2} opacity={0.5} />

          {/* away players (위 half) — 파란색 */}
          {awayPlayers.map(({ player, x, y }, i) => (
            <PlayerDot key={`a-${i}`} x={x} y={y} number={player.number} name={player.name} color="#1d4ed8" />
          ))}
          {/* home players (아래 half) — 빨간색 */}
          {homePlayers.map(({ player, x, y }, i) => (
            <PlayerDot key={`h-${i}`} x={x} y={y} number={player.number} name={player.name} color="#dc2626" />
          ))}
        </svg>
      </div>

      {/* 후보 (subs) 간략 list */}
      {(home.substitutes.length > 0 || away.substitutes.length > 0) && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-[11px]">
          <div>
            <div className="text-[10px] uppercase font-bold text-neutral-400 mb-1">{awayNameKo} 후보</div>
            <ul className="space-y-0.5 text-neutral-600 dark:text-neutral-400">
              {away.substitutes.slice(0, 7).map((p, i) => (
                <li key={i} className="truncate">
                  <span className="tabular-nums">#{p.number ?? "—"}</span> {shortName(p.name)}
                  <span className="text-neutral-400"> ({p.pos ?? "—"})</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-neutral-400 mb-1">{homeNameKo} 후보</div>
            <ul className="space-y-0.5 text-neutral-600 dark:text-neutral-400">
              {home.substitutes.slice(0, 7).map((p, i) => (
                <li key={i} className="truncate">
                  <span className="tabular-nums">#{p.number ?? "—"}</span> {shortName(p.name)}
                  <span className="text-neutral-400"> ({p.pos ?? "—"})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerDot({
  x,
  y,
  number,
  name,
  color,
}: {
  x: number;
  y: number;
  number: number | null;
  name: string;
  color: string;
}) {
  const short = shortName(name);
  return (
    <g>
      <circle cx={x} cy={y} r={14} fill={color} stroke="#fff" strokeWidth={2} />
      <text
        x={x}
        y={y}
        fill="#fff"
        fontSize={11}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {number ?? ""}
      </text>
      <text
        x={x}
        y={y + 24}
        fill="#fff"
        fontSize={9}
        textAnchor="middle"
        opacity={0.9}
        style={{ paintOrder: "stroke", stroke: "#15803d", strokeWidth: 2 }}
      >
        {short}
      </text>
    </g>
  );
}
