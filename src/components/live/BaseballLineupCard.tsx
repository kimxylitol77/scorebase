// 야구 경기 상세 라인업 (KBO·MLB·NPB) — 네이버 라인업 탭처럼 양 팀 2열: 선발투수 → 타순 1~9 → 후보 야수 · 불펜 투수.
import Link from "next/link";
import type { GameLineup, LineupPlayer, TeamLineup } from "@/lib/sports/baseball-lineup";

function Photo({ src }: { src: string | null }) {
  if (!src) return <span className="h-9 w-9 shrink-0 rounded-full bg-zinc-200 dark:bg-white/10" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-full bg-zinc-200 object-cover object-top dark:bg-white/10" />;
}

function Name({ p }: { p: LineupPlayer }) {
  return p.href ? (
    <Link href={p.href} className="hover:underline">{p.name}</Link>
  ) : (
    <>{p.name}</>
  );
}

function Row({ badge, p, sub }: { badge: React.ReactNode; p: LineupPlayer; sub: string }) {
  return (
    <li className="flex min-w-0 items-center gap-1.5 py-1.5">
      <span className="w-6 shrink-0 text-center">{badge}</span>
      <Photo src={p.photo} />
      <span className="min-w-0">
        <span className="block break-keep text-[13px] font-semibold leading-tight text-zinc-900 dark:text-white"><Name p={p} /></span>
        <span className="block truncate whitespace-nowrap text-[11px] text-zinc-500 dark:text-white/45">{sub}</span>
      </span>
    </li>
  );
}

function TeamColumn({ team, t }: { team: string; t: TeamLineup }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 truncate text-xs font-bold text-zinc-700 dark:text-white/70">{team}</div>
      <ul className="divide-y divide-zinc-100 dark:divide-white/5">
        {t.starter && (
          <Row
            p={t.starter}
            sub={t.starter.hand ?? "선발투수"}
            badge={<span className="rounded bg-emerald-600 px-0.5 py-0.5 text-[9px] font-bold text-white">선발</span>}
          />
        )}
        {t.batters.map((b) => (
          <Row
            key={b.order}
            p={b}
            sub={[b.position, b.hand].filter(Boolean).join(", ")}
            badge={<span className="text-sm font-black tabular-nums text-emerald-600 dark:text-emerald-400">{b.order}</span>}
          />
        ))}
      </ul>
    </div>
  );
}

function NameList({ title, home, away }: { title: string; home: LineupPlayer[]; away: LineupPlayer[] }) {
  if (home.length === 0 && away.length === 0) return null;
  const col = (list: LineupPlayer[]) => (
    <ul className="min-w-0 space-y-1">
      {list.map((p, i) => (
        <li key={`${p.href ?? p.name}-${i}`} className="break-keep text-[12px] leading-snug">
          <span className="font-semibold text-zinc-800 dark:text-white/85"><Name p={p} /></span>
          <span className="ml-1 whitespace-nowrap text-[11px] text-zinc-500 dark:text-white/45">{[p.position, p.hand].filter(Boolean).join(", ")}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div>
      <div className="mb-1.5 text-center text-[11px] font-bold text-zinc-500 dark:text-white/45">{title}</div>
      <div className="grid grid-cols-2 gap-3">{col(away)}{col(home)}</div>
    </div>
  );
}

export default function BaseballLineupCard({
  lineup, homeTeam, awayTeam,
}: {
  lineup: GameLineup; homeTeam: string; awayTeam: string;
}) {
  const { home, away, confirmed, note } = lineup;
  return (
    <div className="space-y-3 rounded-[1rem] bg-zinc-50 p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-white/45">
        <span>{confirmed ? "선발 라인업" : "예상 라인업"}</span>
        <span className="text-zinc-300 dark:text-white/20">·</span>
        <span className="text-[10px] font-medium normal-case tracking-normal text-zinc-400 dark:text-white/35">
          {note}
        </span>
      </div>
      {/* 네이버와 같은 순서 — 원정 왼쪽, 홈 오른쪽 */}
      <div className="grid grid-cols-2 gap-2">
        <TeamColumn team={`${awayTeam} (원정)`} t={away} />
        <TeamColumn team={`${homeTeam} (홈)`} t={home} />
      </div>
      {(home.bench.length + away.bench.length + home.bullpen.length + away.bullpen.length) > 0 && (
        <details className="group rounded-lg bg-white/60 px-3 py-2 ring-1 ring-black/5 dark:bg-white/[0.03] dark:ring-white/10">
          <summary className="cursor-pointer select-none text-[12px] font-semibold text-zinc-600 dark:text-white/60">
            후보 야수 · 불펜 투수
          </summary>
          <div className="mt-3 space-y-4">
            <NameList title="후보 야수" home={home.bench} away={away.bench} />
            <NameList title="불펜 투수" home={home.bullpen} away={away.bullpen} />
          </div>
        </details>
      )}
    </div>
  );
}
