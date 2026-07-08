// /k-league-cards — 2026 K리그 공식 트레이딩 카드(파니니·세븐일레븐) 연계 SEO 랜딩.
//  카드 수집 검색 수요("K리그 카드"·"○○○ 카드")를 잡아 각 선수의 실제 시즌 데이터 페이지(/transfers/{id})로
//  유입시키는 훅. 데이터는 player-season-stats.json(TheSports 시즌 스탯 백필) + TheSportsPlayer 한글명·사진.
import type { Metadata } from "next";
import Link from "next/link";
import { IdCard, TrendingUp, BarChart3, Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { SITE_URL } from "@/lib/site-url";
import AmbientGlow from "@/components/AmbientGlow";
import TeamBadge from "@/components/TeamBadge";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo/jsonld";
import { ogPageImage } from "@/lib/seo/og";
import rawSeason from "../../../data/player-season-stats.json";
import rawPhotos from "../../../data/player-photos.json";

const PAGE_URL = `${SITE_URL}/k-league-cards`;
const SEASON = rawSeason as Record<string, { lg: string; team: string | null; pos: string | null; matches: number | null; starts: number | null; goals: number | null; assists: number | null; minutes: number | null; saves: number | null }>;
const PHOTOS = rawPhotos as Record<string, string>;

// 데이터는 주기적 백필(TheSports)로 갱신 — 실시간 아님. 6시간 ISR.
export const revalidate = 21600;

export const metadata: Metadata = {
  title: "2026 K리그 트레이딩 카드 선수 데이터 — 카드 속 선수 실제 성적 | 스코어베이스",
  description:
    "2026 K리그 공식 트레이딩 카드(파니니·세븐일레븐)에 담긴 K리그1 선수들의 실제 2026 시즌 성적을 한눈에. 팀별 전 선수의 경기·득점·도움·출전 데이터와 개인 상세 페이지를 연결합니다. 카드 속 그 선수, 실제로 얼마나 잘하고 있을까?",
  keywords: [
    "K리그 트레이딩 카드", "K리그 카드", "2026 K리그 카드", "K리그 공식 카드",
    "파니니 K리그", "K리그 선수 카드", "K리그 카드 선수", "세븐일레븐 K리그 카드",
    "K리그 선수 스탯", "K리그1 선수 기록", "K리그 선수 데이터", "K리그 득점 순위",
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: PAGE_URL,
    siteName: "스코어베이스",
    title: "2026 K리그 트레이딩 카드 선수 데이터 — 카드 속 선수 실제 성적",
    description: "K리그 공식 트레이딩 카드 속 선수들의 실제 2026 시즌 성적을 팀별로. 카드 수집과 함께 보는 데이터.",
    images: ogPageImage({ title: "K리그 트레이딩 카드 선수 데이터", subtitle: "카드 속 선수의 실제 시즌 성적", tag: "K리그 2026" }),
  },
};

type Row = {
  id: string; name: string; team: string; pos: string | null; photo: string | null;
  matches: number; goals: number; assists: number; minutes: number; saves: number; gk: boolean;
};

async function loadRows(): Promise<Row[]> {
  const entries = Object.entries(SEASON).filter(([, v]) => v.lg === "K_LEAGUE_1");
  const ids = entries.map(([id]) => id);
  const players = await prisma.theSportsPlayer.findMany({
    where: { id: { in: ids } },
    select: { id: true, nameKo: true, name: true, photoUrl: true, position: true },
  });
  const pmap = new Map(players.map((p) => [p.id, p]));
  return entries.map(([id, v]) => {
    const p = pmap.get(id);
    const pos = v.pos ?? p?.position ?? null;
    return {
      id,
      name: p?.nameKo || p?.name || "선수",
      team: toKoreanTeamName(v.team || "", "K_LEAGUE_1") || (v.team ?? ""),
      pos,
      photo: PHOTOS[id] || p?.photoUrl || null,
      matches: v.matches ?? 0,
      goals: v.goals ?? 0,
      assists: v.assists ?? 0,
      minutes: v.minutes ?? 0,
      saves: v.saves ?? 0,
      gk: (pos ?? "").toUpperCase().startsWith("G"),
    };
  });
}

const POS_KO: Record<string, string> = { F: "공격수", M: "미드필더", D: "수비수", G: "골키퍼" };
const posLabel = (p: string | null) => (p ? POS_KO[p.toUpperCase()[0]] ?? p : "");

export default async function KLeagueCardsPage() {
  const rows = await loadRows();

  // 팀 로고 — K리그1 Team.logoUrl 을 한글명으로 매핑(그룹 키가 한글명이라).
  const teamRows = await prisma.team.findMany({ where: { league: "K_LEAGUE_1" }, select: { name: true, logoUrl: true } });
  const logoByTeam = new Map<string, string>();
  for (const t of teamRows) if (t.logoUrl) logoByTeam.set(toKoreanTeamName(t.name, "K_LEAGUE_1"), t.logoUrl);

  // 팀별 그룹 — 팀은 총 득점 desc, 선수는 (골+도움) desc → 출전시간 desc.
  const byTeam = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byTeam.has(r.team)) byTeam.set(r.team, []);
    byTeam.get(r.team)!.push(r);
  }
  const teams = [...byTeam.entries()]
    .map(([team, list]) => ({
      team,
      logo: logoByTeam.get(team) ?? null,
      list: list.sort((a, b) => b.goals + b.assists - (a.goals + a.assists) || b.minutes - a.minutes),
      teamGoals: list.reduce((s, r) => s + r.goals, 0),
    }))
    .sort((a, b) => b.teamGoals - a.teamGoals);

  // 카드 주목 선수 — 공격 포인트(골+도움) 상위 10.
  const stars = [...rows].sort((a, b) => b.goals + b.assists - (a.goals + a.assists) || b.goals - a.goals).slice(0, 10);

  const JSONLD = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbLd([
        { name: "홈", path: "/" },
        { name: "K리그 트레이딩 카드 선수 데이터", path: "/k-league-cards" },
      ]),
    ],
  };

  const btnGhost =
    "inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-sm ring-1 ring-black/5 transition hover:bg-zinc-50 dark:bg-white/[0.06] dark:text-white dark:ring-white/10 dark:hover:bg-white/[0.1]";

  return (
    <main className="relative min-h-screen bg-[#f5f5f7] dark:bg-transparent">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(JSONLD) }} />

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-16 sm:pt-24 pb-10 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-1.5 text-xs sm:text-sm text-zinc-700 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70">
          <IdCard className="h-3.5 w-3.5 text-rose-500" strokeWidth={2.2} aria-hidden /> 2026 K리그 공식 트레이딩 카드
        </div>
        <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-bold tracking-[-0.03em] leading-[1.1] text-zinc-950 dark:text-white">
          카드 속 선수, 실제 성적은?
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg leading-7 text-zinc-600 dark:text-white/60">
          한국프로축구연맹과 <strong className="font-semibold text-zinc-800 dark:text-white/80">파니니(PANINI)</strong>가 만든
          2026 K리그 공식 트레이딩 카드(베이스·인서트·국가대표 등 242종)가 <strong className="font-semibold text-zinc-800 dark:text-white/80">7월부터 세븐일레븐</strong>에서 판매됩니다.
          카드에서 만난 선수를 <strong className="font-semibold text-zinc-800 dark:text-white/80">K리그1 {rows.length}명 전 선수</strong>의
          실제 2026 시즌 성적으로 이어드립니다. 카드를 모으며, 그 선수가 지금 얼마나 뛰고 있는지 데이터로 확인하세요.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/standings/K_LEAGUE_1"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-black/10 transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-white/90"
          >
            K리그1 순위 보기 →
          </Link>
          <Link href="/predictions/K_LEAGUE_1" className={btnGhost}>AI 우승 예측</Link>
          <Link href="/leagues/K_LEAGUE_1" className={btnGhost}>리그 허브</Link>
        </div>
      </section>

      {/* 카드 주목 선수 */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-14" aria-label="카드 주목 선수">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-rose-500 dark:text-rose-400" strokeWidth={2} aria-hidden />
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">카드 주목 선수</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-500 dark:text-white/45">2026 시즌 공격 포인트(골+도움) 상위 — 카드로 가장 찾을 만한 선수들.</p>
        <div className="mt-6 grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {stars.map((r) => (
            <Link
              key={r.id}
              href={`/transfers/${r.id}`}
              className="group relative block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none"
            >
              <div className="flex items-center justify-center">
                {r.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.photo} alt="" width={64} height={64} loading="lazy" className="h-16 w-16 rounded-full object-cover bg-neutral-100 dark:bg-white/10" />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-neutral-100 dark:bg-white/10" />
                )}
              </div>
              <div className="mt-3 text-center">
                <div className="font-bold text-sm text-zinc-950 group-hover:underline underline-offset-4 dark:text-white truncate">{r.name}</div>
                <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-white/45 truncate">{r.team}</div>
              </div>
              <div className="mt-3 flex items-center justify-center gap-3 text-center">
                <div><div className="text-base font-black tabular-nums text-rose-600 dark:text-rose-400">{r.goals}</div><div className="text-[10px] text-zinc-400">골</div></div>
                <div><div className="text-base font-black tabular-nums text-zinc-800 dark:text-white/80">{r.assists}</div><div className="text-[10px] text-zinc-400">도움</div></div>
                <div><div className="text-base font-black tabular-nums text-zinc-800 dark:text-white/80">{r.matches}</div><div className="text-[10px] text-zinc-400">경기</div></div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 팀별 선수 데이터 */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-20" aria-label="팀별 선수 데이터">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-rose-500 dark:text-rose-400" strokeWidth={2} aria-hidden />
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">팀별 선수 데이터</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-500 dark:text-white/45">각 선수를 누르면 상세 시즌 기록·커리어·몸값 페이지로 이동합니다.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {teams.map(({ team, list, logo }) => (
            <div key={team} className="rounded-2xl bg-white p-4 sm:p-5 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
              <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-zinc-950 dark:text-white">
                <TeamBadge logoUrl={logo} size={22} className="bg-white rounded-sm" />
                {team}
                <span className="ml-auto text-xs font-normal text-zinc-400">{list.length}명</span>
              </h3>
              <div className="divide-y divide-black/5 dark:divide-white/10">
                {list.map((r) => (
                  <Link
                    key={r.id}
                    href={`/transfers/${r.id}`}
                    className="flex items-center gap-2.5 py-1.5 -mx-1 px-1 rounded-lg transition hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                  >
                    {r.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photo} alt="" width={26} height={26} loading="lazy" className="h-6.5 w-6.5 rounded-full object-cover bg-neutral-100 dark:bg-white/10 shrink-0" />
                    ) : (
                      <div className="h-6.5 w-6.5 rounded-full bg-neutral-100 dark:bg-white/10 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-white/85">{r.name}</span>
                    <span className="shrink-0 text-[11px] text-zinc-400 w-12 text-right">{posLabel(r.pos)}</span>
                    <span className="shrink-0 tabular-nums text-xs text-zinc-500 dark:text-white/50 w-24 text-right">
                      {r.gk ? `${r.matches}경기 ${r.saves}세이브` : `${r.goals}골 ${r.assists}도움`}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 pb-24 text-center">
        <div className="rounded-[2rem] bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <Trophy className="mx-auto h-8 w-8 text-rose-500 dark:text-rose-400" strokeWidth={1.75} aria-hidden />
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">이번 시즌 K리그, 누가 우승할까?</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-600 dark:text-white/55">
            카드 속 선수들의 팀이 이번 시즌 어디까지 갈지, Elo 레이팅 기반 AI 시뮬레이션으로 우승·강등 확률을 확인하세요.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link href="/predictions/K_LEAGUE_1" className={btnGhost}>K리그1 AI 예측</Link>
            <Link href="/standings/K_LEAGUE_1" className={btnGhost}>실시간 순위표</Link>
          </div>
        </div>
        <p className="mt-6 text-[11px] text-zinc-400">
          선수 성적 데이터 출처: TheSports · 2026 시즌 기준, 주기적으로 갱신됩니다. 카드 구성·판매 정보는 한국프로축구연맹·파니니 공식 발표를 따릅니다.
        </p>
      </section>
    </main>
  );
}
