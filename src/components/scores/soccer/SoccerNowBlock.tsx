// 축구 "지금" 블록 — 예정 경기 전용 (예상 라인업 / 확정 키 플레이어).
// 골·모멘텀은 스코어보드 밑 골 카드(SoccerGoalsCard) + 팀통계 모멘텀 차트로 일원화 —
// 중복 제거(2026-06-21). LIVE/FINISHED 는 이 블록을 렌더하지 않는다.
//   SCHEDULED + 라인업 확정 → 키 플레이어 칩 (평점 상위)
//   SCHEDULED + 예상 라인업 → 예상 XI 카드
// 데이터 없으면 null — 빈 카드는 렌더하지 않는다.

import SoccerLineupSvg from "./SoccerLineupSvg";
import { predictedToLineupData } from "@/lib/predict/formation-layout";
import type { Severity } from "@/lib/sports/injury-format";

/** 부상·결장 명단 한 줄 (팀별). */
export interface InjuryLine {
  name: string;
  reason: string;
  /** 심각도 — 색 구분용(injury-format Severity). */
  sev: Severity;
  /** 예상 XI 에 포함된 선수인지 — 명단에서 강조 */
  inXi?: boolean;
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
  xi: Array<{
    /** TheSports player id — 피치 좌표 key + 부상 매칭 */
    id?: string;
    name: string;
    nameKo?: string;
    position: string;
    shirtNumber?: number;
    confidence: number;
    photo?: string;
    avgRating?: number;
    lastRating?: number;
    /** api-football player id — 있으면 선수 상세 링크 */
    afId?: number;
  }>;
}

interface Props {
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
  homeNameKo: string;
  awayNameKo: string;
  /** TheSports cache.lineup (confirmed=1 일 때만 전달) */
  lineup: { home?: LineupPlayer[]; away?: LineupPlayer[] } | null;
  /** 선수 한글명 매핑 (TheSportsPlayer.nameKo) */
  nameById?: Record<string, string>;
  /** 예상 라인업 (월드컵 — 최근 국제경기 XI 가중투표). 확정 라인업 없을 때만 표시. */
  predictedHome?: PredictedXiTeam | null;
  predictedAway?: PredictedXiTeam | null;
  /** 예상 XI 중 현재 부상·결장인 선수 ts id — 피치 OUT 배지. */
  injuredXiIds?: string[];
  /** 홈/원정 팀의 현재 부상·결장 명단 (예상 라인업 아래 표시). */
  injuriesHome?: InjuryLine[];
  injuriesAway?: InjuryLine[];
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

const SEV_DOT: Record<InjuryLine["sev"], string> = {
  long: "bg-red-500",
  short: "bg-amber-500",
  returning: "bg-emerald-500",
  non_injury: "bg-neutral-400",
  unknown: "bg-neutral-400",
};

/** 부상·결장 명단 — 한 팀. 예상 XI 포함 선수는 강조. 없으면 null. */
function InjuryList({ label, tone, items }: { label: string; tone: "home" | "away"; items: InjuryLine[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className={`text-[11px] font-semibold mb-1 ${tone === "home" ? "text-rose-600 dark:text-rose-400" : "text-blue-600 dark:text-blue-400"}`}>
        {label} · 부상·결장 {items.length}명
      </div>
      <ul className="space-y-0.5">
        {items.map((it, i) => (
          <li key={`${it.name}-${i}`} className="flex items-center gap-1.5 text-[12px] text-neutral-700 dark:text-neutral-300">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEV_DOT[it.sev]}`} />
            <span className={it.inXi ? "font-semibold" : ""}>{it.name}</span>
            <span className="text-neutral-400 dark:text-neutral-500">· {it.reason}</span>
            {it.inXi && (
              <span className="text-[9px] px-1 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 font-bold">예상 XI</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SoccerNowBlock({
  status,
  homeNameKo,
  awayNameKo,
  lineup,
  nameById = {},
  predictedHome,
  predictedAway,
  injuredXiIds,
  injuriesHome,
  injuriesAway,
}: Props) {
  const showChips = status === "SCHEDULED" && lineup;
  // 예상 라인업 — 확정 라인업이 아직 없는 예정 매치에서만 (확정 도착 시 자동 교체)
  const showPredicted =
    status === "SCHEDULED" && !lineup && (predictedHome || predictedAway);

  if (!showChips && !showPredicted) return null;

  // 예상 라인업 — 피치 뷰(확정 라인업과 동일한 SoccerLineupSvg 재사용) + 부상·결장 명단.
  if (showPredicted) {
    const data = predictedToLineupData(predictedHome, predictedAway);
    if (!data) return null;
    // 예상 XI 자체 nameKo → SoccerLineupSvg nameById 로 전달
    const nameByIdKo: Record<string, string> = {};
    for (const t of [predictedHome, predictedAway]) {
      if (!t) continue;
      for (const p of t.xi) if (p.id && p.nameKo) nameByIdKo[p.id] = p.nameKo;
    }
    const injured = new Set(injuredXiIds ?? []);
    const basedOn = predictedHome?.basedOnGames ?? predictedAway?.basedOnGames;
    const hasInjuries = (injuriesHome?.length ?? 0) + (injuriesAway?.length ?? 0) > 0;
    return (
      <div className="space-y-3">
        <SoccerLineupSvg
          data={data as Parameters<typeof SoccerLineupSvg>[0]["data"]}
          homeNameKo={homeNameKo}
          awayNameKo={awayNameKo}
          nameById={nameByIdKo}
          injuredIds={injured}
          subtitle={`최근 경기 선발 가중 예상${basedOn ? ` · 최근 ${basedOn}경기 기반` : ""} · 공식 발표(킥오프 ~1시간 전) 시 확정 라인업으로 자동 교체`}
        />
        {hasInjuries && (
          <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold tracking-tight">부상·결장 명단</h3>
              <span className="text-[10px] text-neutral-500">데이터 기반</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
              <InjuryList label={homeNameKo} tone="home" items={injuriesHome ?? []} />
              <InjuryList label={awayNameKo} tone="away" items={injuriesAway ?? []} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-neutral-500 pt-1 border-t border-neutral-100 dark:border-white/5">
              <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1 align-middle" />장기</span>
              <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1 align-middle" />단기</span>
              <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 align-middle" />복귀 임박</span>
              <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-400 mr-1 align-middle" />출전정지·기타</span>
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3">
      <KeyPlayerChips
        lineup={lineup!}
        nameById={nameById}
        homeNameKo={homeNameKo}
        awayNameKo={awayNameKo}
      />
    </section>
  );
}
