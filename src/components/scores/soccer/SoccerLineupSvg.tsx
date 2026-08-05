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
  /**
   * detailLive.incidents — 교체·카드·득점 배지와 교체명단 투입 시각에 쓴다.
   * 없으면 선발 11명만 그리던 기존 동작 그대로(호출부 5곳 중 넘기는 곳만 풍부해진다).
   */
  incidents?: unknown;
}

/** 한 선수에게 일어난 일 — incidents 를 player_id 로 접어 넣은 것 */
interface PlayerEvent {
  /** 교체 아웃된 분 */
  outMin?: number;
  /** 교체 투입된 분 */
  inMin?: number;
  yellow?: boolean;
  red?: boolean;
  goals: number;
  ownGoals: number;
}

/**
 * incidents → player_id 별 이벤트.
 * 타입 규칙은 live-scores.ts 의 tsIncidentsToGoals/Cards 와 같은 기준을 쓴다 —
 * 3 옐로 · 4 레드 · 9 교체(in/out) · 득점은 home_score|away_score 가 실린 incident.
 * 한쪽만 고치면 타임라인과 라인업이 서로 다른 사실을 말하게 된다.
 */
function buildPlayerEvents(incidents: unknown): Map<string, PlayerEvent> {
  const map = new Map<string, PlayerEvent>();
  if (!Array.isArray(incidents)) return map;
  const touch = (id: unknown): PlayerEvent | null => {
    if (typeof id !== "string" || !id) return null;
    if (!map.has(id)) map.set(id, { goals: 0, ownGoals: 0 });
    return map.get(id)!;
  };
  for (const raw of incidents) {
    const i = raw as Record<string, unknown>;
    const minute = typeof i.time === "number" ? i.time : undefined;
    if (i.type === 9) {
      const inE = touch(i.in_player_id);
      if (inE && minute != null) inE.inMin = minute;
      const outE = touch(i.out_player_id);
      if (outE && minute != null) outE.outMin = minute;
      continue;
    }
    if (i.type === 3 || i.type === 4) {
      const e = touch(i.player_id);
      if (e) {
        if (i.type === 3) e.yellow = true;
        else e.red = true;
      }
      continue;
    }
    // 득점 — 점수가 실린 incident 만(경고·교체엔 score 필드가 없다)
    if (typeof i.home_score === "number" || typeof i.away_score === "number") {
      const e = touch(i.player_id);
      if (e) {
        if (i.type === 17) e.ownGoals += 1;
        else e.goals += 1;
      }
    }
  }
  return map;
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
  event,
}: {
  player: Player;
  top: number;
  left: number;
  nameById?: Record<string, string>;
  injured?: boolean;
  event?: PlayerEvent;
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
        {/* 카드 — 좌상단. 평점(우상단)·등번호(좌하단)·주장(우하단)이 이미 차 있어 남은 자리다. */}
        {(event?.red || event?.yellow) && (
          <span
            className={`absolute -top-1 -left-1 w-1.5 h-3 sm:w-2 sm:h-3.5 rounded-[1px] shadow ${event.red ? "bg-red-600" : "bg-yellow-400"}`}
            aria-label={event.red ? "퇴장" : "경고"}
          />
        )}
        {/* 교체 아웃 — 사진 위. 몇 분에 나갔는지가 라인업에서 가장 자주 찾는 정보다. */}
        {event?.outMin != null && (
          <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-rose-600/90 px-1 text-[7px] sm:text-[8px] font-bold text-white leading-[1.4] shadow tabular-nums">
            ↓{event.outMin}&apos;
          </span>
        )}
        {/* 주장 마크 — 사진 우하단 */}
        {captain && (
          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-amber-400 text-[7px] sm:text-[8px] font-extrabold text-black flex items-center justify-center leading-none shadow">
            C
          </span>
        )}
      </div>
      {/* 이름 — 등번호·주장 배지(사진 아래로 4px 돌출)와 명확히 떨어지게 mt 확보 + truncate 로 옆 선수와 가로 겹침 차단 */}
      <span className="mt-3 inline-flex max-w-[4rem] sm:max-w-[5rem] items-center gap-0.5 px-1 py-px rounded text-[9px] sm:text-[10px] font-bold text-white bg-black/60 leading-tight">
        <span className="truncate">{name}</span>
        {/* 득점 — 개수만큼 점. 자책골은 붉게 구분한다(같은 골이라도 의미가 반대다). */}
        {Array.from({ length: Math.min(event?.goals ?? 0, 3) }).map((_, i) => (
          <span key={`g${i}`} className="inline-block w-1.5 h-1.5 rounded-full bg-white shrink-0" aria-label="득점" />
        ))}
        {Array.from({ length: Math.min(event?.ownGoals ?? 0, 2) }).map((_, i) => (
          <span key={`og${i}`} className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" aria-label="자책골" />
        ))}
      </span>
    </div>
  );
}

const POS_KO: Record<string, string> = { G: "골키퍼", D: "수비수", M: "미드필더", F: "공격수" };

/** 교체명단 한 줄 — 사진·번호·이름·포지션 + 투입 시각/카드 */
function BenchRow({
  player,
  nameById,
  event,
}: {
  player: Player;
  nameById?: Record<string, string>;
  event?: PlayerEvent;
}) {
  const name = displayName(player, nameById);
  return (
    <li className="flex items-center gap-2 py-1.5">
      <div className="w-7 h-7 shrink-0 rounded-full overflow-hidden bg-neutral-200 dark:bg-white/10" style={{ aspectRatio: "1 / 1" }}>
        {player.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.logo} alt="" className="block w-full h-full object-cover rounded-full" loading="lazy" />
        ) : null}
      </div>
      <span className="w-5 shrink-0 text-[11px] tabular-nums text-neutral-400 text-right">{player.shirt_number ?? ""}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium leading-tight">{name}</span>
        <span className="block text-[10px] text-neutral-500 leading-tight">{POS_KO[player.position ?? ""] ?? ""}</span>
      </span>
      {(event?.red || event?.yellow) && (
        <span
          className={`w-1.5 h-3 rounded-[1px] shrink-0 ${event.red ? "bg-red-600" : "bg-yellow-400"}`}
          aria-label={event.red ? "퇴장" : "경고"}
        />
      )}
      {event?.inMin != null && (
        <span className="shrink-0 text-[11px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          ↑{event.inMin}&apos;
        </span>
      )}
    </li>
  );
}

/** 교체명단 — 양 팀 좌우 분할. 투입된 선수를 위로 올려 "누가 들어갔나"가 먼저 보이게 한다. */
function BenchList({
  home,
  away,
  homeNameKo,
  awayNameKo,
  nameById,
  events,
}: {
  home: Player[];
  away: Player[];
  homeNameKo: string;
  awayNameKo: string;
  nameById?: Record<string, string>;
  events?: Map<string, PlayerEvent>;
}) {
  if (!home.length && !away.length) return null;
  const sortBench = (arr: Player[]) =>
    [...arr].sort((a, b) => {
      const ai = a.id ? events?.get(a.id)?.inMin : undefined;
      const bi = b.id ? events?.get(b.id)?.inMin : undefined;
      if ((ai != null) !== (bi != null)) return ai != null ? -1 : 1;
      if (ai != null && bi != null) return ai - bi;
      return (a.shirt_number ?? 99) - (b.shirt_number ?? 99);
    });
  return (
    <div className="mt-4">
      <h3 className="text-center text-[12px] font-bold text-neutral-500 mb-1">교체명단</h3>
      {/* 모바일은 1열 — 2열로 쪼개면 이름 칸이 45px 로 좁아져 한글 이름이 "산티아..." 로
          잘린다(실측 390px 에서 31px 부족). 세로가 길어져도 이름이 온전한 쪽을 택한다. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 sm:gap-x-6">
        {[
          { list: sortBench(home), label: homeNameKo },
          { list: sortBench(away), label: awayNameKo },
        ].map((col, ci) => (
          <div key={ci} className="min-w-0">
            <div className="truncate text-[10px] font-semibold text-neutral-400 mb-0.5 mt-2 sm:mt-0">{col.label}</div>
            <ul className="divide-y divide-black/5 dark:divide-white/5">
              {col.list.map((p, i) => (
                <BenchRow key={p.id ?? `${ci}-${i}`} player={p} nameById={nameById} event={p.id ? events?.get(p.id) : undefined} />
              ))}
            </ul>
          </div>
        ))}
      </div>
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
  events,
}: {
  players: Player[];
  side: "home" | "away";
  nameById?: Record<string, string>;
  injuredIds?: Set<string>;
  events?: Map<string, PlayerEvent>;
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
              event={p.id ? events?.get(p.id) : undefined}
            />
          );
        });
      })}
    </>
  );
}

const POS_RANK: Record<string, number> = { G: 0, D: 1, M: 2, F: 3 };

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

/** 선발의 포지션 분포(D / M 합 / F)가 formation 라벨과 맞는지 — 라벨 신뢰 판정용. */
function matchesLabel(starters: Player[], formation?: string): boolean {
  const lines = (formation ?? "").split("-").map((n) => parseInt(n, 10)).filter((n) => n > 0);
  if (lines.length < 3) return false;
  const cnt = (pos: string) => starters.filter((p) => p.position === pos).length;
  return (
    lines[0] === cnt("D") &&
    lines[lines.length - 1] === cnt("F") &&
    lines.slice(1, -1).reduce((s, n) => s + n, 0) === cnt("M")
  );
}

/** formation 라벨대로 좌표 재부여. 라인 배정은 포지션→원본 y 순, 라인 내 좌우는 원본 x 순서 유지. */
function relayout(starters: Player[], formation: string): Player[] {
  const lines = formation.split("-").map((n) => parseInt(n, 10)).filter((n) => n > 0);
  const outfield = starters
    .filter((p) => p.position !== "G")
    .sort(
      (a, b) =>
        (POS_RANK[a.position ?? ""] ?? 9) - (POS_RANK[b.position ?? ""] ?? 9) ||
        (a.y ?? 0) - (b.y ?? 0) ||
        (a.x ?? 0) - (b.x ?? 0),
    );
  if (lines.reduce((s, n) => s + n, 0) !== outfield.length) return starters;
  const out: Player[] = starters.filter((p) => p.position === "G").map((p) => ({ ...p, x: 50, y: 4 }));
  let i = 0;
  for (const [li, count] of lines.entries()) {
    const row = outfield.slice(i, i + count).sort((a, b) => (a.x ?? 50) - (b.x ?? 50));
    row.forEach((p, j) => out.push({ ...p, x: ((j + 1) / (count + 1)) * 100, y: 20 + li * 16 }));
    i += count;
  }
  return out;
}

/** 좌표가 없는 확정 라인업의 배치 합성 — 하위리그·친선은 TheSports 가 x/y·formation 을 안 준다
 *  (af 도 grid 미제공 실측, 2026-08-01). formation 라벨이 포지션 분포와 맞으면 라벨대로,
 *  없으면 포지션(D/M/F) 라인으로 배치. 6명 이상 라인은 두 줄로 쪼개 겹침 방지. */
function synthesize(starters: Player[], formation?: string): Player[] {
  if (formation && matchesLabel(starters, formation)) return relayout(starters, formation);
  const cnt = (pos: string) => starters.filter((p) => p.position === pos).length;
  const lines: number[] = [];
  for (const n of [cnt("D"), cnt("M"), cnt("F")]) {
    if (n <= 0) continue;
    if (n >= 6) { lines.push(Math.ceil(n / 2), Math.floor(n / 2)); } else lines.push(n);
  }
  if (!lines.length) return starters;
  const outfield = starters
    .filter((p) => p.position !== "G")
    .sort((a, b) => (POS_RANK[a.position ?? ""] ?? 9) - (POS_RANK[b.position ?? ""] ?? 9));
  const out: Player[] = starters.filter((p) => p.position === "G").map((p) => ({ ...p, x: 50, y: 4 }));
  const step = Math.min(16, 68 / Math.max(1, lines.length - 1 || 1));
  let i = 0;
  for (const [li, count] of lines.entries()) {
    const row = outfield.slice(i, i + count);
    row.forEach((p, j) => out.push({ ...p, x: ((j + 1) / (count + 1)) * 100, y: 18 + li * step }));
    i += count;
  }
  // 포지션 미상 등 잔여 선수는 최전방 라인에 얹음 (누락 방지)
  for (; i < outfield.length; i++) out.push({ ...outfield[i], x: 50, y: 86 });
  return out;
}

/** formation 라벨이 없을 때 헤더에 쓸 포지션 분포 문자열 ("4-4-2"). 선발 11명 미만이면 빈 값. */
function posFormation(starters: Player[]): string {
  if (starters.length !== 11) return "";
  const cnt = (pos: string) => starters.filter((p) => p.position === pos).length;
  const shape = [cnt("D"), cnt("M"), cnt("F")].filter((n) => n > 0);
  return shape.reduce((s, n) => s + n, 0) === 10 ? shape.join("-") : "";
}

export default function SoccerLineupSvg({ data, homeNameKo, awayNameKo, nameById, subtitle, injuredIds, incidents }: Props) {
  const lu = data.lineup;
  if (!lu) return null;
  const events = buildPlayerEvents(incidents);
  const homeStarters = (lu.home ?? []).filter((p) => p.first === 1);
  const awayStarters = (lu.away ?? []).filter((p) => p.first === 1);
  if (homeStarters.length === 0 && awayStarters.length === 0) return null;

  // 좌표(x/y)가 안 온 팀은 포지션 기반 배치를 합성한다 — 하위리그·친선 508경기(전체 16%)가
  // 명단은 완비된 채 좌표만 없어 "확정 대기"로 버려지던 문제(2026-08-01 전수 진단).
  // 일부만 찍힌 팀도 통째로 합성 — 실좌표·합성 혼재 시 0,0 뭉침으로 깨져 보이는 것 방지.
  const placed = (arr: Player[]) => arr.filter((p) => (p.x ?? 0) > 0 || (p.y ?? 0) > 0);
  const homePlaced = placed(homeStarters).length >= 7;
  const awayPlaced = placed(awayStarters).length >= 7;
  // 명단 자체가 7명 미만이면 합성해도 라인업이라 부를 수 없음 — 기존 안내 유지.
  const ready = homeStarters.length >= 7 && awayStarters.length >= 7;
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

  // TheSports 가 x/y 를 상대 팀 포메이션 격자로 찍어 보내는 경기가 있다(2026-08-01 아틀레티코 vs 맨유:
  // 맨유는 4-2-3-1 인데 4-4-2 격자에 얹혀 미드필더 도르구가 최전방에 찍혔다). 양 팀 포지션 분포가
  // 각자 라벨과 맞고 좌표에서 유도한 라인만 정확히 서로 뒤바뀐 경우에만 라벨 기준으로 좌표를 다시 만든다.
  const gridSwapped =
    homePlaced &&
    awayPlaced &&
    !!data.home_formation &&
    !!data.away_formation &&
    data.home_formation !== data.away_formation &&
    matchesLabel(homeStarters, data.home_formation) &&
    matchesLabel(awayStarters, data.away_formation) &&
    deriveFormation(homeStarters) === data.away_formation &&
    deriveFormation(awayStarters) === data.home_formation;
  const homeXi = !homePlaced
    ? synthesize(homeStarters, data.home_formation)
    : gridSwapped
      ? relayout(homeStarters, data.home_formation!)
      : homeStarters;
  const awayXi = !awayPlaced
    ? synthesize(awayStarters, data.away_formation)
    : gridSwapped
      ? relayout(awayStarters, data.away_formation!)
      : awayStarters;

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
            {data.home_formation || posFormation(homeStarters) || "-"}
          </div>
        </div>
        <div className="rounded-md bg-blue-50 dark:bg-blue-500/10 py-1.5">
          <div className="text-neutral-500 truncate px-1 text-[11px]">{awayNameKo}</div>
          <div className="text-blue-600 dark:text-blue-400 font-bold tabular-nums">
            {data.away_formation || posFormation(awayStarters) || "-"}
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
        <TeamHalf players={homeXi} side="home" nameById={nameById} injuredIds={injuredIds} events={events} />
        <TeamHalf players={awayXi} side="away" nameById={nameById} injuredIds={injuredIds} events={events} />
      </div>

      <BenchList
        home={(lu.home ?? []).filter((p) => p.first !== 1)}
        away={(lu.away ?? []).filter((p) => p.first !== 1)}
        homeNameKo={homeNameKo}
        awayNameKo={awayNameKo}
        nameById={nameById}
        events={events}
      />

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
