// 2026 아시안게임 허브 — 수집 중인 7개 대회(축구·농구·배구 남녀, 야구)를 한 페이지 ?view= 탭으로 묶는다.
// 기본 탭=한국 대표팀 성적. 메달 집계는 원천 데이터가 없어 하지 않는다. 5분 ISR.
import Link from "next/link";
import type { Metadata } from "next";
import { Flag, CalendarDays, LayoutGrid, ChevronRight, type LucideIcon } from "lucide-react";
import TeamLogoImg from "@/components/TeamLogoImg";
import { getAgMatches, summarizeAg, AG_EVENTS, type AgMatch, type AgEventSummary } from "@/lib/sports/asian-games-hub";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { matchLiveHref } from "@/lib/links/match-live-link";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site-url";
import { ogPageImage } from "@/lib/seo/og";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "2026 아시안게임 — 한국 대표팀 경기 일정·결과 (축구·농구·배구·야구)",
  description:
    "2026 아이치·나고야 아시안게임(9/19~10/4) 한국 대표팀 경기 일정과 결과. 남녀 축구·농구·배구와 야구 7개 대회 전 경기 스코어를 한 페이지에서.",
  keywords: ["아시안게임", "2026 아시안게임", "아시안게임 일정", "아시안게임 축구", "아시안게임 야구", "아시안게임 배구", "아시안게임 농구", "스코어베이스"],
  alternates: { canonical: "/asian-games" },
  openGraph: {
    title: "2026 아시안게임 — 한국 대표팀 경기 일정·결과",
    description: "축구·농구·배구·야구 7개 대회 전 경기 스코어를 한 페이지에서.",
    url: `${SITE_URL}/asian-games`,
    images: ogPageImage({ title: "2026 아시안게임", subtitle: "한국 대표팀 경기 일정·결과", tag: "ASIAN GAMES" }),
  },
};

const VIEWS = ["korea", "schedule", "events"] as const;
const TABS: { key: (typeof VIEWS)[number]; label: string; icon: LucideIcon }[] = [
  { key: "korea", label: "한국", icon: Flag },
  { key: "schedule", label: "일정·결과", icon: CalendarDays },
  { key: "events", label: "종목별", icon: LayoutGrid },
];

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
function kst(d: Date) { return new Date(d.getTime() + 9 * 3600_000); }
function kstDateKey(d: Date) { const k = kst(d); return `${k.getUTCMonth() + 1}/${k.getUTCDate()} (${DAYS[k.getUTCDay()]})`; }
function kstClock(d: Date) { const k = kst(d); return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`; }
function kstShort(d: Date) { const k = kst(d); return `${k.getUTCMonth() + 1}.${k.getUTCDate()}`; }

const UNIT = new Map<string, string>(AG_EVENTS.map((e) => [e.league, e.scoreUnit]));

function MatchRow({ m, showLeague = true }: { m: AgMatch; showLeague?: boolean }) {
  const hasScore = m.homeScore != null && m.awayScore != null && m.status !== "SCHEDULED";
  const unit = UNIT.get(m.league);
  const side = (t: AgMatch["home"], right: boolean) => (
    <span className={`flex items-center gap-1.5 min-w-0 ${right ? "flex-row-reverse text-right" : ""}`}>
      <TeamLogoImg url={t.logoUrl} name={t.nameKo} size={18} className="w-[18px] h-[18px] shrink-0 object-contain" fallbackClassName="w-[18px] h-[18px] shrink-0" />
      <span className={`truncate ${t.isKorea ? "font-bold text-neutral-900 dark:text-white" : ""}`}>{t.nameKo}</span>
    </span>
  );
  return (
    <Link
      href={matchLiveHref(m.league, m.externalId, m.id)}
      prefetch={false}
      className="grid grid-cols-[3rem_1fr_auto_1fr] items-center gap-2 px-3 py-2.5 text-[13px] hover:bg-neutral-50 dark:hover:bg-white/[0.04]"
    >
      <span className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
        {m.status === "LIVE" ? <span className="font-semibold text-red-600 dark:text-red-400">LIVE</span> : kstClock(m.startTime)}
      </span>
      {side(m.home, false)}
      <span className="text-center tabular-nums font-semibold min-w-[3.5rem]">
        {hasScore ? `${m.homeScore} - ${m.awayScore}` : "vs"}
        {hasScore && unit ? <span className="block text-[10px] font-normal text-neutral-400">{unit}</span> : null}
        {showLeague ? <span className="block text-[10px] font-normal text-neutral-400 whitespace-nowrap">{LEAGUE_DISPLAY[m.league]?.replace("아시안게임 ", "")}</span> : null}
      </span>
      {side(m.away, true)}
    </Link>
  );
}

function DayGroups({ matches, desc = false }: { matches: AgMatch[]; desc?: boolean }) {
  const groups = new Map<string, AgMatch[]>();
  for (const m of desc ? [...matches].reverse() : matches) {
    const k = kstDateKey(m.startTime);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(m);
  }
  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([day, ms]) => (
        <section key={day}>
          <h3 className="mb-1.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400">{day}</h3>
          <div className="divide-y divide-neutral-100 dark:divide-white/10 rounded-2xl ring-1 ring-black/5 dark:ring-white/10 bg-white dark:bg-neutral-900 overflow-hidden">
            {ms.map((m) => <MatchRow key={m.id} m={m} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function KoreaRecord({ k }: { k: NonNullable<AgEventSummary["korea"]> }) {
  if (k.played === 0) return <span className="text-neutral-400">경기 전</span>;
  return (
    <span className="tabular-nums">
      {k.w}승{k.d > 0 ? ` ${k.d}무` : ""} {k.l}패
    </span>
  );
}

export default async function AsianGamesHub({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: raw } = await searchParams;
  const view = (VIEWS as readonly string[]).includes(raw ?? "") ? (raw as (typeof VIEWS)[number]) : "korea";

  const matches = await getAgMatches();
  const summary = summarizeAg(matches);
  const korea = matches.filter((m) => m.isKorea);
  const upcoming = matches.filter((m) => m.status !== "FINISHED");
  const finished = matches.filter((m) => m.status === "FINISHED");
  const koreaUpcoming = korea.filter((m) => m.status !== "FINISHED");
  const koreaFinished = korea.filter((m) => m.status === "FINISHED");

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd([{ name: "홈", path: "/" }, { name: "2026 아시안게임", path: "/asian-games" }])) }}
      />
      <header className="mb-5">
        <p className="text-xs font-semibold tracking-wide text-red-600 dark:text-red-400">ASIAN GAMES 2026</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight break-keep">2026 아이치·나고야 아시안게임</h1>
        <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          9.19 ~ 10.4(일부 종목은 개막 전 시작) · 축구·농구·배구(남녀)와 야구 7개 대회 · 경기 {matches.length}개 중 {finished.length}개 종료
        </p>
      </header>

      <nav className="mb-6 flex gap-1 p-1 rounded-2xl bg-neutral-100 dark:bg-neutral-900 overflow-x-auto">
        {TABS.map((t) => {
          const on = t.key === view;
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              href={t.key === "korea" ? "/asian-games" : `/asian-games?view=${t.key}`}
              prefetch={false}
              scroll={false}
              className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium whitespace-nowrap transition ${
                on ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              }`}
            >
              <Icon className="w-[15px] h-[15px] shrink-0" aria-hidden />
              <span className="truncate">{t.label}</span>
            </Link>
          );
        })}
      </nav>

      {view === "korea" && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-base font-bold">대회별 한국 성적</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {summary.filter((s) => s.korea).map((s) => (
                <li key={s.league}>
                  <Link href={`/leagues/${s.league}`} prefetch={false} className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 dark:bg-white/[0.04] ring-1 ring-black/5 dark:ring-white/10 px-4 py-3 hover:ring-black/10">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold truncate">{s.label.replace("아시안게임 ", "")}</span>
                      <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                        {s.korea!.next ? `다음 ${kstShort(s.korea!.next.startTime)} ${s.korea!.next.home.isKorea ? s.korea!.next.away.nameKo : s.korea!.next.home.nameKo}전` : "일정 종료 또는 대진 대기"}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold"><KoreaRecord k={s.korea!} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          {koreaUpcoming.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-bold">한국 다음 경기</h2>
              <DayGroups matches={koreaUpcoming} />
            </section>
          )}
          <section>
            <h2 className="mb-3 text-base font-bold">한국 경기 결과</h2>
            {koreaFinished.length ? <DayGroups matches={koreaFinished} desc /> : <p className="text-sm text-neutral-500">아직 종료된 경기가 없습니다.</p>}
          </section>
        </div>
      )}

      {view === "schedule" && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-base font-bold">예정·진행 경기</h2>
            {upcoming.length ? <DayGroups matches={upcoming} /> : <p className="text-sm text-neutral-500">남은 경기가 없습니다.</p>}
            <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400 break-keep">
              결승·3위전처럼 대진이 아직 정해지지 않은 경기는 준결승이 끝나면 추가됩니다.
            </p>
          </section>
          <section>
            <h2 className="mb-3 text-base font-bold">종료 경기</h2>
            <DayGroups matches={finished} desc />
          </section>
        </div>
      )}

      {view === "events" && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {summary.map((s) => (
            <li key={s.league} className="rounded-2xl ring-1 ring-black/5 dark:ring-white/10 bg-white dark:bg-neutral-900 p-4">
              <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{s.sport}</p>
              <h2 className="mt-0.5 text-[15px] font-bold break-keep">{s.label.replace("아시안게임 ", "")}</h2>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div><dt className="text-[10px] text-neutral-500">경기</dt><dd className="text-sm font-semibold tabular-nums">{s.total}</dd></div>
                <div><dt className="text-[10px] text-neutral-500">종료</dt><dd className="text-sm font-semibold tabular-nums">{s.finished}</dd></div>
                <div><dt className="text-[10px] text-neutral-500">한국</dt><dd className="text-sm font-semibold">{s.korea ? <KoreaRecord k={s.korea} /> : "불참"}</dd></div>
              </dl>
              <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                {s.first && s.last ? `${kstShort(s.first)} ~ ${kstShort(s.last)}` : "일정 없음"}
                {s.live > 0 ? <span className="ml-1.5 font-semibold text-red-600 dark:text-red-400">LIVE {s.live}</span> : null}
              </p>
              <Link href={`/leagues/${s.league}`} prefetch={false} className="mt-3 inline-flex items-center gap-0.5 text-[13px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
                순위·전체 일정 <ChevronRight className="w-3.5 h-3.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-[11px] text-neutral-500 dark:text-neutral-400 break-keep">
        스코어베이스가 경기 데이터를 받는 종목만 담았습니다. 메달 집계와 다른 종목은 제공하지 않습니다.
      </p>
    </main>
  );
}
