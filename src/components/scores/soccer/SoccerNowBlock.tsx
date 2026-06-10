// 축구 라이브 상세 — "지금" 블록 (2026-06-10 목업 확정 구조).
// 스코어보드 바로 아래에서 status 별로 다른 답을 준다:
//   LIVE/FINISHED → 골·카드 타임라인 (+LIVE 는 모멘텀 미니바)
//   SCHEDULED + 라인업 확정 → 키 플레이어 칩 (평점 상위)
// 데이터 없으면 null — 빈 카드는 렌더하지 않는다 (접는 게 아니라 숨김).

import type { SoccerGoal, SoccerCard } from "@/lib/sports/live-scores";

interface TrendData {
  count?: number;
  per?: number;
  data?: number[][];
}

interface LineupPlayer {
  id?: string;
  first?: number;
  name?: string;
  rating?: string;
  position?: string;
}

export interface PredictedXiTeam {
  formation: string;
  basedOnGames: number;
  xi: Array<{ name: string; nameKo?: string; position: string; confidence: number }>;
}

interface Props {
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
  homeNameKo: string;
  awayNameKo: string;
  goals: SoccerGoal[] | null;
  cards: SoccerCard[] | null;
  trend: TrendData | null;
  /** TheSports cache.lineup (confirmed=1 일 때만 전달) */
  lineup: { home?: LineupPlayer[]; away?: LineupPlayer[] } | null;
  /** 선수 한글명 매핑 (TheSportsPlayer.nameKo) */
  nameById?: Record<string, string>;
  /** 예상 라인업 (월드컵 — 최근 국제경기 XI 가중투표). 확정 라인업 없을 때만 표시. */
  predictedHome?: PredictedXiTeam | null;
  predictedAway?: PredictedXiTeam | null;
}

function parseMinute(minute: string): number {
  const m = minute.match(/^(\d+)(?:\+(\d+))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) / 10 : 0);
}

/** 골 + 카드 통합 양방향 타임라인 — 홈 왼쪽 / 원정 오른쪽. */
function Timeline({ goals, cards }: { goals: SoccerGoal[]; cards: SoccerCard[] }) {
  // 골 시각 기준 누적 스코어 계산
  const events: Array<{
    minute: string;
    sortKey: number;
    side: "home" | "away";
    player: string;
    kind: "goal" | "yellow" | "red";
    score?: string;
  }> = [];
  let h = 0;
  let a = 0;
  for (const g of [...goals].sort((x, y) => parseMinute(x.minute) - parseMinute(y.minute))) {
    if (g.side === "home") h++;
    else a++;
    events.push({
      minute: g.minute, sortKey: parseMinute(g.minute), side: g.side,
      player: g.player, kind: "goal", score: `${h}-${a}`,
    });
  }
  for (const c of cards) {
    // 옐로는 노이즈 — 레드만 타임라인에 (옐로 수는 팀 통계 영역 담당)
    if (c.kind !== "red") continue;
    events.push({
      minute: c.minute, sortKey: parseMinute(c.minute), side: c.side,
      player: c.player, kind: "red",
    });
  }
  events.sort((x, y) => x.sortKey - y.sortKey);
  if (events.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {events.map((e, i) => (
        <div key={i} className="grid grid-cols-[1fr_72px_1fr] items-center gap-2 text-[13px]">
          <span className={`text-right truncate ${e.side === "home" ? "text-neutral-900 dark:text-neutral-100" : "text-transparent select-none"}`}>
            {e.side === "home" && (
              <>
                {e.kind === "goal" ? "⚽" : "🟥"} {e.player}
              </>
            )}
          </span>
          <span className="text-center text-[11px] text-neutral-500 tabular-nums whitespace-nowrap">
            {e.minute} {e.score ?? ""}
          </span>
          <span className={`truncate ${e.side === "away" ? "text-neutral-900 dark:text-neutral-100" : "text-transparent select-none"}`}>
            {e.side === "away" && (
              <>
                {e.player} {e.kind === "goal" ? "⚽" : "🟥"}
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 라이브 모멘텀 미니바 — trend.data 후반부 최근 15분. 양수=홈 우세(주황), 음수=원정(파랑). */
function MomentumBars({ trend }: { trend: TrendData }) {
  const flat = (trend.data ?? []).flat().filter((v) => typeof v === "number");
  if (flat.length < 5) return null;
  const recent = flat.slice(-15);
  const maxAbs = Math.max(...recent.map((v) => Math.abs(v)), 1);
  return (
    <div>
      <div className="flex justify-between text-[11px] text-neutral-500 mb-1">
        <span>모멘텀 (최근 {recent.length}분)</span>
        <span className="flex gap-2">
          <span className="text-orange-600 dark:text-orange-400">홈</span>
          <span className="text-blue-600 dark:text-blue-400">원정</span>
        </span>
      </div>
      <div className="flex items-end gap-[2px] h-7">
        {recent.map((v, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm ${v >= 0 ? "bg-orange-400/80 self-end" : "bg-blue-400/80 self-start"}`}
            style={{ height: `${Math.max(12, Math.round((Math.abs(v) / maxAbs) * 100))}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** 킥오프 전 키 플레이어 칩 — 선발 중 평점 상위 (평점 없으면 공격수·미드필더 우선). */
function KeyPlayerChips({
  lineup,
  nameById,
  homeNameKo,
  awayNameKo,
}: {
  lineup: { home?: LineupPlayer[]; away?: LineupPlayer[] };
  nameById: Record<string, string>;
  homeNameKo: string;
  awayNameKo: string;
}) {
  const pick = (side: LineupPlayer[] | undefined, n: number) => {
    const starters = (side ?? []).filter((p) => p.first === 1 && p.name);
    const posRank: Record<string, number> = { F: 0, M: 1, D: 2, G: 3 };
    return starters
      .sort((x, y) => {
        const rx = parseFloat(x.rating ?? "0") || 0;
        const ry = parseFloat(y.rating ?? "0") || 0;
        if (rx !== ry) return ry - rx;
        return (posRank[x.position ?? ""] ?? 9) - (posRank[y.position ?? ""] ?? 9);
      })
      .slice(0, n);
  };
  const chip = (p: LineupPlayer, tone: "home" | "away") => {
    const name = (p.id && nameById[p.id]) || p.name || "";
    const rating = parseFloat(p.rating ?? "0") || 0;
    return (
      <span
        key={`${tone}-${p.id ?? p.name}`}
        className={`text-[12px] px-2.5 py-1 rounded-full ${
          tone === "home"
            ? "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200"
            : "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200"
        }`}
      >
        {name}
        {rating > 0 && <span className="opacity-70"> · {rating.toFixed(1)}</span>}
      </span>
    );
  };
  const homeTop = pick(lineup.home, 3);
  const awayTop = pick(lineup.away, 3);
  if (homeTop.length === 0 && awayTop.length === 0) return null;
  const total =
    (lineup.home ?? []).filter((p) => p.first === 1).length +
    (lineup.away ?? []).filter((p) => p.first === 1).length;
  return (
    <div>
      <div className="flex justify-between text-[11px] text-neutral-500 mb-1.5">
        <span>선발 라인업 확정 · 키 플레이어</span>
        <span>
          {homeNameKo} · {awayNameKo}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {homeTop.map((p) => chip(p, "home"))}
        {awayTop.map((p) => chip(p, "away"))}
        {total > homeTop.length + awayTop.length && (
          <span className="text-[12px] px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            전체 라인업은 아래 탭에서
          </span>
        )}
      </div>
    </div>
  );
}

/** 예상 라인업 — 한 팀 분량 (G→D→M→F 순 칩, 신뢰도 낮은 선수는 흐리게). */
function PredictedXiRow({ team, label }: { team: PredictedXiTeam; label: string }) {
  const order: Record<string, number> = { G: 0, D: 1, M: 2, F: 3 };
  const sorted = [...team.xi].sort(
    (a, b) => (order[a.position] ?? 9) - (order[b.position] ?? 9),
  );
  return (
    <div>
      <div className="flex justify-between text-[11px] text-neutral-500 mb-1">
        <span>{label} · {team.formation}</span>
        <span>최근 {team.basedOnGames}경기 기반</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {sorted.map((p) => (
          <span
            key={p.name}
            className={`text-[11.5px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 ${p.confidence < 0.6 ? "opacity-55" : ""}`}
            title={`선발 확률 ${Math.round(p.confidence * 100)}%`}
          >
            {p.position === "G" ? "🧤 " : ""}{p.nameKo ?? p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SoccerNowBlock({
  status,
  homeNameKo,
  awayNameKo,
  goals,
  cards,
  trend,
  lineup,
  nameById = {},
  predictedHome,
  predictedAway,
}: Props) {
  const isPlayedOrPlaying = status === "LIVE" || status === "FINISHED";
  const hasGoals = isPlayedOrPlaying && goals && goals.length > 0;
  const hasMomentum = status === "LIVE" && trend;
  const showChips = status === "SCHEDULED" && lineup;
  // 예상 라인업 — 확정 라인업이 아직 없는 예정 매치에서만 (확정 도착 시 자동 교체)
  const showPredicted =
    status === "SCHEDULED" && !lineup && (predictedHome || predictedAway);

  if (!hasGoals && !hasMomentum && !showChips && !showPredicted) return null;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3">
      {hasGoals && (
        <div>
          <div className="flex justify-between text-[11px] text-neutral-500 mb-1.5">
            <span>골 타임라인</span>
            <span>
              {homeNameKo} · {awayNameKo}
            </span>
          </div>
          <Timeline goals={goals!} cards={cards ?? []} />
        </div>
      )}
      {hasMomentum && <MomentumBars trend={trend!} />}
      {showChips && (
        <KeyPlayerChips
          lineup={lineup!}
          nameById={nameById}
          homeNameKo={homeNameKo}
          awayNameKo={awayNameKo}
        />
      )}
      {showPredicted && (
        <div className="space-y-2.5">
          <div className="flex justify-between text-[11px] text-neutral-500">
            <span>📋 예상 선발 라인업</span>
            <span>공식 발표(킥오프 ~1시간 전) 시 자동 교체</span>
          </div>
          {predictedHome && <PredictedXiRow team={predictedHome} label={homeNameKo} />}
          {predictedAway && <PredictedXiRow team={predictedAway} label={awayNameKo} />}
        </div>
      )}
    </section>
  );
}
