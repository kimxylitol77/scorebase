// 빅매치 허브 상단 — 가운데 스포트라이트 카드 + 양옆 사이드 레일 + 라운드 진행 트랙.
// 데이터는 대회별 허브가 만들어 넘긴다. 초점(글로우)은 이 카드 한 곳에만.
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import TeamLogoImg from "@/components/TeamLogoImg";
import { kstKickoff } from "@/lib/sports/tournament-hub";
import type { HubMatch, HubTeam } from "./types";

export default function SpotlightSection({
  featured,
  eyebrow,
  note,
  matchdays,
  trackLabels,
  left,
  right,
}: {
  featured: HubMatch;
  /** 카드 위 로즈 글씨 — "빅매치 · 리그 A · 3조" */
  eyebrow: string;
  /** 카드 아래 한 줄 — 왜 이 경기인지 */
  note: string;
  /** 라운드 진행 트랙 칸 수 */
  matchdays: number;
  /** 트랙 칸 이름(조별 1R … 결승) — 있으면 "N/총" 대신 현재 칸 이름을 쓴다 */
  trackLabels?: readonly string[];
  left: { title: string; items: HubMatch[] };
  right: { title: string; items: HubMatch[] };
}) {
  return (
    <section aria-labelledby="hub-featured" className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[min(720px,100%)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-300/30 blur-3xl dark:bg-rose-500/[0.14]"
      />
      {/* items-start — 레일 경기 수가 양쪽 다를 수 있어 가운데 정렬하면 머리글이 어긋난다.
          위로 붙여 세 머리글(레일 둘 + 빅매치)을 한 줄에 둔다. */}
      <div className="relative grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
        <FeaturedCard m={featured} eyebrow={eyebrow} note={note} matchdays={matchdays} trackLabels={trackLabels} />
        <Rail title={left.title} items={left.items} className="lg:order-1" />
        <Rail title={right.title} items={right.items} className="lg:order-3" />
      </div>
    </section>
  );
}

function FeaturedCard({ m, eyebrow, note, matchdays, trackLabels }: { m: HubMatch; eyebrow: string; note: string; matchdays: number; trackLabels?: readonly string[] }) {
  const scored = (m.status === "LIVE" || m.status === "FINISHED") && m.homeScore != null && m.awayScore != null;
  return (
    <div className="lg:order-2">
      <h2 id="hub-featured" className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400">
        {eyebrow}
      </h2>
      <Link
        href={m.href}
        prefetch={false}
        className="group block overflow-hidden rounded-[2rem] bg-white shadow-[0_28px_70px_-34px_rgba(15,23,30,0.35)] ring-1 ring-black/5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:bg-white/[0.05] dark:shadow-none dark:ring-white/10 dark:hover:bg-white/[0.07] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-5 pb-6 pt-7 sm:px-8">
          <Side t={m.home} />
          <div className="flex flex-col items-center">
            {scored ? (
              <span className="text-4xl font-black tabular-nums tracking-tight text-zinc-950 dark:text-white sm:text-5xl">
                {m.homeScore}
                <span className="mx-1.5 text-zinc-300 dark:text-white/25">:</span>
                {m.awayScore}
              </span>
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-bold tracking-[0.12em] text-zinc-500 dark:bg-white/[0.06] dark:text-white/55">
                VS
              </span>
            )}
            {m.status === "LIVE" && (
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500 motion-reduce:animate-none" aria-hidden />
                LIVE
              </span>
            )}
          </div>
          <Side t={m.away} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-black/5 bg-zinc-50/70 px-5 py-3.5 dark:border-white/10 dark:bg-white/[0.03] sm:px-8">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-700 dark:text-white/75">
            <CalendarClock className="h-4 w-4 text-zinc-400 dark:text-white/40" aria-hidden />
            {m.status === "FINISHED" ? "종료" : kstKickoff(m.startTime)}
            <span className="font-normal text-zinc-400 dark:text-white/40">KST</span>
          </span>
          <MatchdayTrack current={m.matchday} total={matchdays} labels={trackLabels} />
        </div>
      </Link>
      <p className="mt-3 text-center text-[12px] text-zinc-500 break-keep dark:text-white/45">{note}</p>
    </div>
  );
}

function Side({ t }: { t: HubTeam }) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-zinc-50 ring-1 ring-black/5 dark:bg-white/[0.06] dark:ring-white/10 sm:h-20 sm:w-20">
        <TeamLogoImg
          url={t.logoUrl}
          name={t.name}
          size={48}
          className="h-11 w-11 object-contain sm:h-12 sm:w-12"
          fallbackClassName="text-xl font-black text-zinc-400"
        />
      </span>
      <span className="mt-3 w-full truncate text-2xl font-black tracking-[-0.03em] text-zinc-950 dark:text-white sm:text-4xl">{t.name}</span>
      {t.rank != null && (
        <span className="mt-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-600 dark:bg-white/[0.06] dark:text-white/60">
          FIFA {t.rank}위
        </span>
      )}
    </div>
  );
}

/** 라운드 진행 — 지난 라운드는 채움, 현재는 로즈, 남은 라운드는 빈 칸. */
function MatchdayTrack({ current, total, labels }: { current: number; total: number; labels?: readonly string[] }) {
  const name = labels?.[current - 1];
  return (
    <span className="inline-flex items-center gap-2" aria-label={name ? `진행 단계 ${name}` : `${total}라운드 중 ${current}라운드`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-white/40">{name ? "단계" : "라운드"}</span>
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <span
            key={n}
            className={`h-1.5 w-5 rounded-full ${
              n === current ? "bg-rose-500" : n < current ? "bg-zinc-400 dark:bg-white/40" : "bg-zinc-200 dark:bg-white/10"
            }`}
          />
        ))}
      </span>
      <span className="text-[12px] font-bold tabular-nums text-zinc-700 dark:text-white/75">
        {name ?? `${current}/${total}`}
      </span>
    </span>
  );
}

function Rail({ title, items, className }: { title: string; items: HubMatch[]; className?: string }) {
  if (items.length === 0) return <div className={className} aria-hidden />;
  return (
    <div className={className}>
      <h3 className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400 dark:text-white/40">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((m) => {
          const scored = (m.status === "LIVE" || m.status === "FINISHED") && m.homeScore != null && m.awayScore != null;
          return (
            <li key={m.id}>
              <Link
                href={m.href}
                prefetch={false}
                className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-2xl bg-white/80 px-3 py-2.5 ring-1 ring-black/5 transition-colors duration-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:bg-white/[0.03] dark:ring-white/[0.08] dark:hover:bg-white/[0.06]"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Flag flag={m.home.flag} />
                  <span className="truncate text-[13px] font-semibold text-zinc-800 dark:text-white/85">{m.home.name}</span>
                </span>
                <span className="text-center text-[12px] tabular-nums text-zinc-500 dark:text-white/50">
                  {scored ? (
                    <span className={`font-bold ${m.status === "LIVE" ? "text-rose-600 dark:text-rose-400" : "text-zinc-800 dark:text-white/85"}`}>
                      {m.homeScore}-{m.awayScore}
                    </span>
                  ) : (
                    // 한 라운드가 여러 날에 걸친다 — 요일은 빼도 날짜는 남긴다("9/26 03:45").
                    kstKickoff(m.startTime).replace(/ \(.\)/, "")
                  )}
                </span>
                <span className="flex min-w-0 items-center justify-end gap-1.5">
                  <span className="truncate text-right text-[13px] font-semibold text-zinc-800 dark:text-white/85">{m.away.name}</span>
                  <Flag flag={m.away.flag} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Flag({ flag }: { flag: string }) {
  // 국기 이모지가 없는 팀(북아일랜드 — 영국 구성국 중 공식 이모지 없음)은 빈 자리로 정렬만 맞춘다.
  return flag ? (
    <span className="shrink-0 text-[15px] leading-none" aria-hidden>
      {flag}
    </span>
  ) : (
    <span className="h-3.5 w-[18px] shrink-0 rounded-[3px] bg-zinc-200 dark:bg-white/10" aria-hidden />
  );
}
