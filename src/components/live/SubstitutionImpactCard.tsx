// 교체 영향 분석 카드 — 교체 이후 ±10분 안에 같은 팀이 골을 넣은 경우
// 들어간 선수 (in_player) 의 기여 가능성을 시각화.
// 데이터: incidents 의 type=9 (교체) + type=1/17/8/29 (골). VAR 무효골 제외.

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

interface Props {
  events: SoccerEvent[];
  homeNameKo: string;
  awayNameKo: string;
  playerLogoById?: Record<string, string>;
}

function localize(name: string | null | undefined): string {
  if (!name) return "—";
  if (/[가-힣]/.test(name)) return name;
  return toKoreanPlayerName(name) || name;
}

function avatarFor(id: string | null | undefined, logoById?: Record<string, string>) {
  if (id && logoById?.[id]) {
    return (
      <Image
        src={logoById[id]}
        alt=""
        width={24}
        height={24}
        className="rounded-full object-cover w-6 h-6"
        unoptimized
      />
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-800 text-[10px]">
      ?
    </span>
  );
}

export default function SubstitutionImpactCard({ events, homeNameKo, awayNameKo, playerLogoById }: Props) {
  // 교체 + ±10분 안의 같은 side 골 매칭
  const subs = events.filter((e) => e.type === "subst");
  if (subs.length === 0) return null;

  const goals = events.filter((e) => e.type === "goal");

  interface Impact {
    sub: SoccerEvent;
    relatedGoals: SoccerEvent[]; // 교체 시각 이후 10분 안의 골
  }
  const impacts: Impact[] = [];
  for (const sub of subs) {
    const subMin = sub.minute * 100 + sub.extra;
    const related = goals.filter((g) => {
      if (g.side !== sub.side) return false;
      const gMin = g.minute * 100 + g.extra;
      return gMin >= subMin && gMin <= subMin + 10 * 100;
    });
    if (related.length > 0) impacts.push({ sub, relatedGoals: related });
  }
  if (impacts.length === 0) return null;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3 sm:p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">교체 영향 분석</h2>
        <span className="text-[10px] text-neutral-400">±10분 골 매칭</span>
      </header>
      <ul className="space-y-2.5">
        {impacts.map((imp, i) => (
          <li
            key={i}
            className={`rounded-lg border p-2.5 ${
              imp.sub.side === "home"
                ? "border-blue-200/60 dark:border-blue-800/40 bg-blue-50/30 dark:bg-blue-950/20"
                : "border-rose-200/60 dark:border-rose-800/40 bg-rose-50/30 dark:bg-rose-950/20"
            }`}
          >
            <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-1.5">
              <span>{imp.sub.side === "home" ? homeNameKo : awayNameKo}</span>
              <span className="tabular-nums">{imp.sub.minute}{imp.sub.extra > 0 ? `+${imp.sub.extra}` : ""}'</span>
            </div>
            {/* 교체 라인 */}
            <div className="flex items-center gap-2 text-sm">
              {avatarFor(imp.sub.playerId, playerLogoById)}
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">IN {localize(imp.sub.playerName)}</span>
              <span className="text-neutral-400">↔</span>
              {avatarFor(imp.sub.assistId, playerLogoById)}
              <span className="text-neutral-500 line-through">{localize(imp.sub.assistName)}</span>
            </div>
            {/* 후속 골 */}
            <ul className="mt-2 pl-1 space-y-1">
              {imp.relatedGoals.map((g, j) => (
                <li key={j} className="text-xs text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
                  <span className="text-emerald-600">⚽</span>
                  <span className="tabular-nums text-neutral-500">{g.minute}{g.extra > 0 ? `+${g.extra}` : ""}'</span>
                  <span className="font-medium">{localize(g.playerName)}</span>
                  {g.assistName && (
                    <span className="text-neutral-400">· 어시 {localize(g.assistName)}</span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
