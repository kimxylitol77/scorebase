// 축구 라인업 — 피치 위 선수 배치 (사진 + 등번호 + 한글이름 + 평점).
// 네이버 스포츠 스타일: 큰 세로 피치, home 위 / away 아래 (한 피치에 양 팀).
//
// TheSports lineup/detail 응답:
//   { confirmed, home_formation, away_formation, lineup: { home:[...], away:[...] } }
//   선수: { id, first(1=선발), captain, name, logo(사진), shirt_number, position(G|D|M|F), x, y, rating }
//   좌표: x(0~100 가로), y(0~90, 0=자기 골문 / 90=중앙선 방향)
//     home top% = y*0.5  (위 절반 0~45%),  left% = x
//     away top% = 100 - y*0.5 (아래 절반 55~100%, 거울),  left% = 100 - x

interface Player {
  id?: string;
  first?: number;
  captain?: number;
  name?: string;
  logo?: string;
  shirt_number?: number;
  position?: string;
  x?: number;
  y?: number;
  rating?: string | number;
}

interface LineupData {
  confirmed?: number;
  home_formation?: string;
  away_formation?: string;
  lineup?: {
    home?: Player[];
    away?: Player[];
  };
}

interface Props {
  data: LineupData;
  homeNameKo: string;
  awayNameKo: string;
  /** ts player id → 한글 이름 (TheSportsPlayer.nameKo). 없으면 영문 last name fallback. */
  nameById?: Record<string, string>;
}

/** 표시 이름: nameKo(DB) 우선 → 영문 last name. */
function displayName(player: Player, nameById?: Record<string, string>): string {
  const ko = player.id ? nameById?.[player.id] : undefined;
  if (ko) return ko;
  const full = player.name || "";
  if (!full) return "";
  const parts = full.split(/\s+/);
  return parts[parts.length - 1] ?? full;
}

/** 평점 색 — SofaScore 식 (8.5+ 보라 / 7+ 초록 / 6.5+ 연두 / 6+ 노랑 / 미만 빨강). */
function ratingColor(r: number): string {
  if (r >= 8.5) return "#7c3aed";
  if (r >= 7.5) return "#15803d";
  if (r >= 7.0) return "#22c55e";
  if (r >= 6.5) return "#84cc16";
  if (r >= 6.0) return "#eab308";
  return "#ef4444";
}

function PlayerDot({
  player,
  top,
  left,
  nameById,
}: {
  player: Player;
  top: number;
  left: number;
  nameById?: Record<string, string>;
}) {
  const name = displayName(player, nameById);
  const num = player.shirt_number ?? "";
  const captain = player.captain === 1;
  const rating =
    typeof player.rating === "string" ? parseFloat(player.rating) : (player.rating ?? 0);

  return (
    <div
      className="absolute flex flex-col items-center"
      style={{ top: `${top}%`, left: `${left}%`, transform: "translate(-50%, -50%)" }}
    >
      <div className="relative">
        {player.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.logo}
            alt={name}
            className="w-8 h-8 sm:w-11 sm:h-11 rounded-full object-cover border border-white/90 bg-white shadow"
            loading="lazy"
          />
        ) : (
          <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-full border border-white/90 bg-emerald-900/60 shadow flex items-center justify-center text-white text-[10px] sm:text-xs font-bold">
            {num}
          </div>
        )}
        {/* 평점 배지 — 사진 우상단 */}
        {rating > 0 && (
          <span
            className="absolute -top-1 -right-1.5 text-center px-0.5 rounded-sm text-[7px] sm:text-[9px] font-extrabold text-white leading-[1.3] shadow"
            style={{ background: ratingColor(rating) }}
          >
            {rating.toFixed(1)}
          </span>
        )}
        {/* 등번호 — 사진 좌하단 작은 원 */}
        <span className="absolute -bottom-1 -left-1 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-neutral-900/85 text-white text-[7px] sm:text-[8px] font-bold flex items-center justify-center tabular-nums leading-none">
          {num}
        </span>
        {/* 주장 마크 — 사진 우하단 */}
        {captain && (
          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-amber-400 text-[7px] sm:text-[8px] font-extrabold text-black flex items-center justify-center leading-none shadow">
            C
          </span>
        )}
      </div>
      {/* 이름 — truncate 로 옆 선수와 가로 겹침 차단 */}
      <span className="mt-0.5 inline-block max-w-[3.75rem] sm:max-w-[5rem] truncate px-1 py-px rounded text-[9px] sm:text-[10px] font-bold text-white bg-black/55 leading-tight text-center">
        {name}
      </span>
    </div>
  );
}

/**
 * 선수를 y값(자기 골 기준 0~90)으로 라인(GK/DF/MF/FW…)에 그룹핑 후
 * 라인을 세로 균등 배치 → 원좌표 간격이 좁아도 겹침 구조적 차단 (네이버/SofaScore 방식).
 * 라인 내 가로 위치는 x 원좌표 유지(좌우 의미 보존).
 */
function TeamHalf({
  players,
  side,
  nameById,
}: {
  players: Player[];
  side: "home" | "away";
  nameById?: Record<string, string>;
}) {
  // 1) y 오름차순 정렬 후 인접 y 차이 8 이내면 같은 라인으로 묶음
  const sorted = [...players].sort((a, b) => (a.y ?? 50) - (b.y ?? 50));
  const lines: Player[][] = [];
  for (const p of sorted) {
    const last = lines[lines.length - 1];
    const lastY = last ? (last[0].y ?? 50) : null;
    if (last && lastY != null && Math.abs((p.y ?? 50) - lastY) <= 8) last.push(p);
    else lines.push([p]);
  }
  const n = lines.length || 1;

  return (
    <>
      {lines.map((line, li) => {
        // 라인 세로 위치 — 자기 진영(절반)을 n등분, GK 가 바깥(골문)쪽.
        // home: 위 절반(top 3~47%), away: 아래 절반(거울).
        const frac = (li + 0.5) / n; // 0~1, 0=골문쪽
        const half = 3 + frac * 44; // 3~47%
        // 라인 내 가로 — x 원좌표 정렬 유지 (home 그대로 / away 거울)
        const byX = [...line].sort((a, b) => (a.x ?? 50) - (b.x ?? 50));
        return byX.map((p, pi) => {
          const top = side === "home" ? half : 100 - half;
          const x = p.x ?? 50;
          const left = side === "home" ? x : 100 - x;
          return (
            <PlayerDot
              key={`${side}-${p.id ?? `${li}-${pi}`}`}
              player={p}
              top={top}
              left={left}
              nameById={nameById}
            />
          );
        });
      })}
    </>
  );
}

export default function SoccerLineupSvg({ data, homeNameKo, awayNameKo, nameById }: Props) {
  const lu = data.lineup;
  if (!lu) return null;
  const homeStarters = (lu.home ?? []).filter((p) => p.first === 1);
  const awayStarters = (lu.away ?? []).filter((p) => p.first === 1);
  if (homeStarters.length === 0 && awayStarters.length === 0) return null;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-3 sm:p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm sm:text-base font-bold tracking-tight">라인업</h2>
        <span className="text-[11px] text-neutral-500">
          {data.confirmed === 1 ? "확정 라인업" : "예상 라인업"}
        </span>
      </header>

      {/* 양 팀 헤더 — home(위) / away(아래) 포메이션 */}
      <div className="grid grid-cols-2 gap-2 mb-2 text-center text-xs">
        <div className="rounded-md bg-rose-50 dark:bg-rose-500/10 py-1.5">
          <div className="text-neutral-500 truncate px-1 text-[11px]">{homeNameKo}</div>
          <div className="text-rose-600 dark:text-rose-400 font-bold tabular-nums">
            {data.home_formation || "-"}
          </div>
        </div>
        <div className="rounded-md bg-blue-50 dark:bg-blue-500/10 py-1.5">
          <div className="text-neutral-500 truncate px-1 text-[11px]">{awayNameKo}</div>
          <div className="text-blue-600 dark:text-blue-400 font-bold tabular-nums">
            {data.away_formation || "-"}
          </div>
        </div>
      </div>

      {/* 피치 — 세로, home 위 / away 아래. 모바일 풀폭, 데스크탑 max-w 제한. */}
      <div
        className="relative w-full mx-auto rounded-lg overflow-hidden border border-emerald-800/40 max-w-[460px]"
        style={{
          aspectRatio: "0.56",
          backgroundColor: "#1f8a4c",
          backgroundImage:
            "repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 9.09%, rgba(0,0,0,0.05) 9.09%, rgba(0,0,0,0.05) 18.18%)",
        }}
      >
        {/* 필드 라인 */}
        <div className="absolute inset-2 border border-white/25 rounded-sm" />
        {/* 중앙선 */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/25" />
        {/* 센터 서클 */}
        <div className="absolute top-1/2 left-1/2 w-20 h-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
        <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />
        {/* 페널티 박스 (위/아래) */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-2/5 h-[12%] border border-white/25 border-t-0" />
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-2/5 h-[12%] border border-white/25 border-b-0" />

        {/* 선수 */}
        <TeamHalf players={homeStarters} side="home" nameById={nameById} />
        <TeamHalf players={awayStarters} side="away" nameById={nameById} />
      </div>

      {/* 평점 색 범례 */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-3 text-[10px] text-neutral-500">
        <span className="font-semibold text-neutral-400">평점</span>
        <span><span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: "#7c3aed" }} />8.5+</span>
        <span><span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: "#22c55e" }} />7.0+</span>
        <span><span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: "#eab308" }} />6.0+</span>
        <span><span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: "#ef4444" }} />6.0-</span>
      </div>
    </section>
  );
}
