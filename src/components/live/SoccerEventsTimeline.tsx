// 축구 이벤트 타임라인 — 골 / 카드 / 교체 / VAR.
// 사용자 toggle — 정렬(시간순/역시간순) + 필터(전체/카드/교체).
// 가운데 분 표시, away 왼쪽 / home 오른쪽 분할.

"use client";

import { useState } from "react";
import Image from "next/image";
import { toKoreanPlayerName } from "@/lib/player-names";

interface SoccerEvent {
  minute: number;
  extra: number;
  type: "goal" | "card" | "subst" | "var";
  detail: string;
  side: "home" | "away";
  playerName: string | null;
  assistName: string | null;
  playerId?: string | null;
  assistId?: string | null;
}

/** 한글이면 그대로, 영문이면 사전 lookup. 미등록은 영문 fallback. */
function localizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (/[가-힣]/.test(trimmed)) return trimmed;
  return toKoreanPlayerName(trimmed) || trimmed;
}

interface Props {
  events: SoccerEvent[];
  homeNameKo: string;
  awayNameKo: string;
  /** TheSports player id → photo URL (lineup cache 에서 추출). 없으면 이니셜 아바타. */
  playerLogoById?: Record<string, string>;
}

function PlayerAvatar({ id, name, logoById }: { id: string | null | undefined; name: string | null; logoById?: Record<string, string> }) {
  const url = id ? logoById?.[id] : undefined;
  if (url) {
    return (
      <Image
        src={url}
        alt={name ?? "player"}
        width={28}
        height={28}
        className="rounded-full bg-neutral-100 dark:bg-neutral-900 object-cover w-7 h-7 flex-shrink-0"
        unoptimized
      />
    );
  }
  const initial = name ? name.trim()[0]?.toUpperCase() ?? "?" : "?";
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-800 text-[10px] font-bold text-neutral-600 dark:text-neutral-300 flex-shrink-0">
      {initial}
    </span>
  );
}

function iconAndLabel(ev: SoccerEvent): { icon: string; label: string; color: string } {
  if (ev.type === "goal") {
    if (ev.detail === "Own Goal") return { icon: "⚽", label: "자책골", color: "text-rose-600" };
    if (ev.detail === "Penalty") return { icon: "⚽", label: "PK 골", color: "text-emerald-600" };
    if (ev.detail === "Missed Penalty") return { icon: "✕", label: "PK 실축", color: "text-neutral-500" };
    return { icon: "⚽", label: "골", color: "text-emerald-600" };
  }
  if (ev.type === "card") {
    if (/red/i.test(ev.detail) && !/yellow/i.test(ev.detail))
      return { icon: "🟥", label: "레드카드", color: "text-rose-600" };
    if (/second\s*yellow/i.test(ev.detail))
      return { icon: "🟨🟥", label: "경고 누적 퇴장", color: "text-rose-600" };
    return { icon: "🟨", label: "옐로카드", color: "text-amber-600" };
  }
  if (ev.type === "subst") return { icon: "🔄", label: "교체", color: "text-blue-600" };
  return { icon: "📺", label: "VAR", color: "text-purple-600" };
}

function shortName(name: string | null): string {
  if (!name) return "—";
  if (/[가-힣]/.test(name)) return name.length > 8 ? name.slice(0, 8) : name;
  const parts = name.split(/\s+/);
  if (parts.length <= 1) return name;
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

function timeLabel(ev: SoccerEvent): string {
  if (ev.extra > 0) return `${ev.minute}+${ev.extra}'`;
  return `${ev.minute}'`;
}

type FilterKind = "all" | "card" | "subst" | "var";

// 렌더 중 컴포넌트를 새로 만들면 매 렌더마다 버튼 DOM 이 재생성된다(react-hooks/static-components).
// 모듈 최상위로 올리고 필요한 값만 prop 으로 받는다.
function FilterButton({
  kind,
  label,
  count,
  active,
  onSelect,
}: {
  kind: FilterKind;
  label: string;
  count: number;
  active: boolean;
  onSelect: (kind: FilterKind) => void;
}) {
  if (count === 0 && kind !== "all") return null;
  return (
    <button
      type="button"
      onClick={() => onSelect(kind)}
      className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
        active
          ? "bg-blue-500 text-white"
          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
      }`}
    >
      {label} {count > 0 && <span className="opacity-70">{count}</span>}
    </button>
  );
}

export default function SoccerEventsTimeline({ events, homeNameKo, awayNameKo, playerLogoById }: Props) {
  // 정렬: chrono(시간 오름차순) / latest(시간 내림차순 — 기본)
  const [chrono, setChrono] = useState(false);
  const [filter, setFilter] = useState<FilterKind>("all");

  if (events.length === 0) return null;

  const filtered = events.filter((e) => filter === "all" || e.type === filter);
  const sorted = [...filtered].sort((a, b) => {
    const av = a.minute * 100 + a.extra;
    const bv = b.minute * 100 + b.extra;
    return chrono ? av - bv : bv - av;
  });

  const counts = {
    all: events.length,
    card: events.filter((e) => e.type === "card").length,
    subst: events.filter((e) => e.type === "subst").length,
    var: events.filter((e) => e.type === "var").length,
  };


  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
          이벤트 타임라인
        </div>
        {/* 정렬 toggle */}
        <button
          type="button"
          onClick={() => setChrono(!chrono)}
          className="flex items-center gap-1.5 text-[11px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          <span>{chrono ? "시간순" : "최신순"}</span>
          <span
            className={`relative inline-block w-7 h-4 rounded-full transition ${
              chrono ? "bg-blue-500" : "bg-neutral-300 dark:bg-neutral-700"
            }`}
          >
            <span
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition ${
                chrono ? "left-3.5" : "left-0.5"
              }`}
            />
          </span>
        </button>
      </div>

      {/* 필터 칩 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {([
          ["all", "전체"],
          ["card", "카드"],
          ["subst", "교체"],
          ["var", "VAR"],
        ] as const).map(([kind, label]) => (
          <FilterButton
            key={kind}
            kind={kind}
            label={label}
            count={counts[kind]}
            active={filter === kind}
            onSelect={setFilter}
          />
        ))}
      </div>

      {/* home 좌측 / away 우측 — 사이트 전반 home 좌측 통일 규칙 */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-1 items-center text-[10px] font-bold uppercase tracking-wider text-neutral-400 pb-2 border-b border-neutral-100 dark:border-neutral-800">
        <div className="text-right truncate">{homeNameKo}</div>
        <div className="px-2">분</div>
        <div className="text-left truncate">{awayNameKo}</div>
      </div>

      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {sorted.map((ev, i) => {
          const meta = iconAndLabel(ev);
          const playerKo = localizeName(ev.playerName);
          const assistKo = localizeName(ev.assistName);
          const detail = (
            <div className={`text-[11px] ${meta.color} font-medium leading-tight`}>
              {meta.label}
              {assistKo && ev.type === "goal" && (
                <span className="text-neutral-400"> · 어시 {shortName(assistKo)}</span>
              )}
            </div>
          );
          // 골/카드: 단일 아바타. 교체: in (player) + out (assist) 두 아바타.
          const homeBlock = ev.side === "home" && (
            <div className="flex items-center gap-2 justify-end">
              {ev.type === "subst" && assistKo && (
                <span className="flex items-center gap-1 text-[11px] text-neutral-400">
                  <span className="line-through">{shortName(assistKo)}</span>
                  <PlayerAvatar id={ev.assistId} name={ev.assistName} logoById={playerLogoById} />
                </span>
              )}
              <div className="flex items-center gap-1.5">
                <PlayerAvatar id={ev.playerId} name={ev.playerName} logoById={playerLogoById} />
                <div className="text-right">
                  <div className="text-sm font-bold leading-tight">
                    <span className="mr-1">{meta.icon}</span>
                    {shortName(playerKo)}
                  </div>
                  {detail}
                </div>
              </div>
            </div>
          );
          const awayBlock = ev.side === "away" && (
            <div className="flex items-center gap-2 justify-start">
              <div className="flex items-center gap-1.5">
                <PlayerAvatar id={ev.playerId} name={ev.playerName} logoById={playerLogoById} />
                <div className="text-left">
                  <div className="text-sm font-bold leading-tight">
                    <span className="mr-1">{meta.icon}</span>
                    {shortName(playerKo)}
                  </div>
                  {detail}
                </div>
              </div>
              {ev.type === "subst" && assistKo && (
                <span className="flex items-center gap-1 text-[11px] text-neutral-400">
                  <PlayerAvatar id={ev.assistId} name={ev.assistName} logoById={playerLogoById} />
                  <span className="line-through">{shortName(assistKo)}</span>
                </span>
              )}
            </div>
          );
          return (
            <li
              key={i}
              className="grid grid-cols-[1fr_auto_1fr] gap-1 items-start py-2 text-sm"
            >
              <div>{homeBlock}</div>
              <div className="px-2 text-xs tabular-nums font-bold text-neutral-500 min-w-[44px] text-center self-center">
                {timeLabel(ev)}
              </div>
              <div>{awayBlock}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
