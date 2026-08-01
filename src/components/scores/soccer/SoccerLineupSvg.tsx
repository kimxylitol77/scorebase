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
  /** 헤더 아래 부제(예상 라인업 안내 문구 등). 없으면 미표시. */
  subtitle?: string;
  /** 현재 부상·결장 중인 ts player id — 피치 위에서 반투명 + OUT 배지 처리. */
  injuredIds?: Set<string>;
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
  injured,
}: {
  player: Player;
  top: number;
  left: number;
  nameById?: Record<string, string>;
  injured?: boolean;
}) {
  const name = displayName(player, nameById);
  const num = player.shirt_number ?? "";
  const captain = player.captain === 1;
  const rating =
    typeof player.rating === "string" ? parseFloat(player.rating) : (player.rating ?? 0);

  return (
    <div
      className={`absolute flex flex-col items-center ${injured ? "opacity-60" : ""}`}
      style={{ top: `${top}%`, left: `${left}%`, transform: "translate(-50%, -50%)" }}
    >
      <div className={`relative w-8 h-8 sm:w-10 sm:h-10 aspect-square shrink-0 ${injured ? "rounded-full ring-2 ring-red-500" : ""}`}>
        {/* 윈도우 타원 깨짐 다중 방어: (1) aspect-square 로 높이 계산이 어긋나도 1:1 강제,
            (2) img 자체에 rounded-full → overflow-hidden 클립이 transform 조상 아래서 실패해도 self-clip,
            (3) wrapper overflow-hidden 으로 이중 클립. */}
        <div
          className="w-full aspect-square rounded-full overflow-hidden border border-white/90 bg-white shadow"
          style={{ aspectRatio: "1 / 1" }}
        >
          {player.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.logo}
              alt={name}
              className="block w-full aspect-square object-cover rounded-full"
              style={{ aspectRatio: "1 / 1" }}
              loading="lazy"
            />
          ) : (
            <div className="w-full aspect-square rounded-full bg-emerald-900/60 flex items-center justify-center text-white text-[10px] sm:text-xs font-bold">
              {num}
            </div>
          )}
        </div>
        {/* 우상단 — 부상이면 OUT, 아니면 평점 배지 */}
        {injured ? (
          <span className="absolute -top-1 -right-1.5 px-0.5 rounded-sm text-[7px] sm:text-[9px] font-extrabold text-white leading-[1.3] shadow bg-red-600">
            OUT
          </span>
        ) : (
          rating > 0 && (
            <span
              className="absolute -top-1 -right-1.5 text-center px-0.5 rounded-sm text-[7px] sm:text-[9px] font-extrabold text-white leading-[1.3] shadow"
              style={{ background: ratingColor(rating) }}
            >
              {rating.toFixed(1)}
            </span>
          )
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
      {/* 이름 — 등번호·주장 배지(사진 아래로 4px 돌출)와 명확히 떨어지게 mt 확보 + truncate 로 옆 선수와 가로 겹침 차단 */}
      <span className="mt-3 inline-block max-w-[3.5rem] sm:max-w-[4.5rem] truncate px-1 py-px rounded text-[9px] sm:text-[10px] font-bold text-white bg-black/60 leading-tight text-center">
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
  injuredIds,
}: {
  players: Player[];
  side: "home" | "away";
  nameById?: Record<string, string>;
  injuredIds?: Set<string>;
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
        const half = 3 + frac * 46; // 3~46% — 줄 간격 넓혀 이름이 아랫줄 선수와 안 겹치게 (센터서클은 장식 SVG라 spread 와 무관)
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
              injured={p.id ? injuredIds?.has(p.id) : false}
            />
          );
        });
      })}
    </>
  );
}

/** 선발 y좌표로 라인 구성 유도 ("4-2-3-1"). GK 제외, y 간격 6 초과면 새 라인. 애매하면 빈 문자열. */
function deriveFormation(starters: Player[]): string {
  const outfield = starters
    .filter((p) => p.position !== "G" && ((p.x ?? 0) > 0 || (p.y ?? 0) > 0))
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
  if (outfield.length !== 10) return "";
  const lines: number[] = [];
  let prev = -99;
  let n = 0;
  for (const p of outfield) {
    const y = p.y ?? 0;
    if (y - prev > 6) {
      if (n) lines.push(n);
      n = 1;
    } else n++;
    prev = y;
  }
  if (n) lines.push(n);
  return lines.join("-");
}

export default function SoccerLineupSvg({ data, homeNameKo, awayNameKo, nameById, subtitle, injuredIds }: Props) {
  const lu = data.lineup;
  if (!lu) return null;
  const homeStarters = (lu.home ?? []).filter((p) => p.first === 1);
  const awayStarters = (lu.away ?? []).filter((p) => p.first === 1);
  if (homeStarters.length === 0 && awayStarters.length === 0) return null;

  // 친선 등에서 라인업이 점진적으로 들어오는 중이면 안내 문구로 대체(경기 임박 시 자동 완성).
  // 선발 수뿐 아니라 x/y 좌표가 유효(0,0 아님)한 선수 기준으로 판정 — 좌표 미도착 시
  // 선수들이 피치 좌상단(0,0)에 겹쳐 1~2명처럼 깨져 보이는 것 방지.
  const placed = (arr: Player[]) => arr.filter((p) => (p.x ?? 0) > 0 || (p.y ?? 0) > 0);
  const ready = placed(homeStarters).length >= 7 && placed(awayStarters).length >= 7;
  if (!ready) {
    return (
      <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-3 sm:p-4">
        <header className="flex items-center justify-between mb-3">
          <h2 className="text-sm sm:text-base font-bold tracking-tight">라인업</h2>
          <span className="text-[11px] text-neutral-500">확정 대기</span>
        </header>
        <div className="py-12 text-center text-sm text-neutral-500 leading-relaxed">
          선발 라인업이 아직 확정되지 않았습니다.
          <br />
          경기 시작 전 자동으로 업데이트됩니다.
        </div>
      </section>
    );
  }

  // TheSports 가 home/away 포메이션 라벨을 뒤바꿔 주는 경우가 있다(2026-08-01 아틀레티코 vs 맨유).
  // 좌표로 유도한 배치가 정확히 서로의 라벨과 맞아떨어질 때만 교환 — 애매하면 원본 그대로 둔다.
  const swapped =
    !!data.home_formation &&
    !!data.away_formation &&
    deriveFormation(homeStarters) === data.away_formation &&
    deriveFormation(awayStarters) === data.home_formation;
  const homeFormation = swapped ? data.away_formation : data.home_formation;
  const awayFormation = swapped ? data.home_formation : data.away_formation;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-3 sm:p-4">
      <header className="flex items-center justify-between mb-1">
        <h2 className="text-sm sm:text-base font-bold tracking-tight">라인업</h2>
        <span className="text-[11px] text-neutral-500">
          {data.confirmed === 1 ? "확정 라인업" : "예상 라인업"}
        </span>
      </header>
      {subtitle && (
        <p className="text-[11px] text-neutral-500 mb-3 leading-snug">{subtitle}</p>
      )}
      {!subtitle && <div className="mb-2" />}

      {/* 양 팀 헤더 — home(위) / away(아래) 포메이션 */}
      <div className="grid grid-cols-2 gap-2 mb-2 text-center text-xs">
        <div className="rounded-md bg-rose-50 dark:bg-rose-500/10 py-1.5">
          <div className="text-neutral-500 truncate px-1 text-[11px]">{homeNameKo}</div>
          <div className="text-rose-600 dark:text-rose-400 font-bold tabular-nums">
            {homeFormation || "-"}
          </div>
        </div>
        <div className="rounded-md bg-blue-50 dark:bg-blue-500/10 py-1.5">
          <div className="text-neutral-500 truncate px-1 text-[11px]">{awayNameKo}</div>
          <div className="text-blue-600 dark:text-blue-400 font-bold tabular-nums">
            {awayFormation || "-"}
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
        {/* 피치 마킹 — 단일 SVG 오버레이. viewBox(56×100, 비율 0.56 = 컨테이너와 동일)를
            통째로 스케일하므로 화면비·윈도우 aspect-square 타원버그에 영향 없음(원/박스가
            div 가 아니라 SVG 도형이라 개별 종횡비 계산이 없음). 잔디·선수와 같은 컨테이너에 종속.
            장식용 — 선수는 라인별 균등배치(실좌표 아님)라 최전방이 센터서클에 살짝 겹칠 수 있음(SofaScore 식). */}
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none"
          viewBox="0 0 56 100"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          fill="none"
          stroke="white"
          strokeOpacity={0.25}
          strokeWidth={0.2}
        >
          {/* 외곽선 + 중앙선 */}
          <rect x="1.5" y="1.5" width="53" height="97" rx="1" />
          <line x1="1.5" y1="50" x2="54.5" y2="50" />
          {/* 센터 서클 + 스폿 */}
          <circle cx="28" cy="50" r="7.5" />
          <circle cx="28" cy="50" r="0.6" fill="white" fillOpacity={0.35} stroke="none" />
          {/* 페널티 박스 (home 위 / away 아래) */}
          <rect x="11.4" y="1.5" width="33.2" height="15.7" />
          <rect x="11.4" y="82.8" width="33.2" height="15.7" />
          {/* 골 에어리어 */}
          <rect x="20.45" y="1.5" width="15.1" height="5.2" />
          <rect x="20.45" y="93.3" width="15.1" height="5.2" />
          {/* 페널티 스폿 */}
          <circle cx="28" cy="12" r="0.6" fill="white" fillOpacity={0.35} stroke="none" />
          <circle cx="28" cy="88" r="0.6" fill="white" fillOpacity={0.35} stroke="none" />
        </svg>

        {/* 선수 */}
        <TeamHalf players={homeStarters} side="home" nameById={nameById} injuredIds={injuredIds} />
        <TeamHalf players={awayStarters} side="away" nameById={nameById} injuredIds={injuredIds} />
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
