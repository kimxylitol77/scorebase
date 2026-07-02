// 통합 검색 — 팀·선수·리그(엔티티) + 기사. 엔티티 우선, 기사 후순위.
import { prisma } from "@/lib/db";
import Link from "next/link";
import ArticleCard from "@/components/ArticleCard";
import SearchInput from "@/components/SearchInput";
import AmbientGlow from "@/components/AmbientGlow";
import { toKoreanTeamName, searchTeamNamesByKo } from "@/lib/team-names";
import { SPORT_CATEGORIES, COMMUNITY_CATEGORY } from "@/components/nav-config";
import rawOverrides from "../../../data/player-overrides.json";
import type { Metadata } from "next";

// 선수 한글명 수동 교정본(OV) — DB nameKo 와 표기가 다른 선수("음바페" vs DB "엠바페")도
// 교정 표기로 검색되도록 역참조. transfers 상세와 동일 정본.
const OV = rawOverrides as Record<string, { nameKo?: string }>;

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return {
    title: q ? `"${q}" 검색 결과` : "검색",
    description: "Scorebase 안의 팀·선수·리그 페이지와 기사를 검색합니다.",
  };
}

// 팀 검색 대상 — 팀 페이지가 실질 콘텐츠(로스터·일정·순위)를 갖는 활성 리그만 (thin·중복 row 회피)
const TEAM_SEARCH_LEAGUES = [
  "MLB", "KBO", "NPB", "NBA", "NHL",
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "WORLD_CUP",
];

export default async function SearchPage({ searchParams }: Props) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();
  const lowerQ = q.toLowerCase();

  let articles: Awaited<ReturnType<typeof prisma.article.findMany>> = [];
  let teams: Array<{ id: number; name: string; league: string; logoUrl: string | null }> = [];
  let players: Array<{ id: string; name: string; nameKo: string | null; photoUrl: string | null }> = [];

  if (q.length >= 1) {
    const koTeamNames = searchTeamNamesByKo(q);
    const ovPlayerIds = Object.entries(OV)
      .filter(([, v]) => v.nameKo && v.nameKo.includes(q))
      .slice(0, 20)
      .map(([id]) => id);
    const [a, teamRows, playerRows] = await Promise.all([
      // Postgres contains + 대소문자 무시 — 소문자 영문 검색("arsenal")이 전멸하던 버그 수정
      prisma.article.findMany({
        where: {
          status: "PUBLISHED",
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { content: { contains: q, mode: "insensitive" } },
          ],
        },
        orderBy: { publishedAt: "desc" },
        take: 50,
      }),
      // 팀 — 영문은 직접 매칭, 한글은 team-names 사전 역매핑
      prisma.team.findMany({
        where: {
          league: { in: TEAM_SEARCH_LEAGUES },
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            ...(koTeamNames.length ? [{ name: { in: koTeamNames } }] : []),
          ],
        },
        select: { id: true, name: true, league: true, logoUrl: true },
        take: 24,
      }),
      // 선수 — TheSportsPlayer 한글/영문 이름 + OV 교정 표기 매칭
      prisma.theSportsPlayer.findMany({
        where: {
          OR: [
            { nameKo: { contains: q } },
            { name: { contains: q, mode: "insensitive" } },
            ...(ovPlayerIds.length ? [{ id: { in: ovPlayerIds } }] : []),
          ],
        },
        select: { id: true, name: true, nameKo: true, photoUrl: true },
        take: 20,
      }),
    ]);
    articles = a;
    // 같은 팀명 중복 row(소스별 중복) 방어 — 이름 기준 첫 row 만
    const seenTeam = new Set<string>();
    teams = teamRows
      .filter((t) => (seenTeam.has(t.name) ? false : (seenTeam.add(t.name), true)))
      .slice(0, 8);
    // 선수는 몸값 상세(/transfers/[id]) 페이지가 실존하는 경우만 노출 — 깨진 링크 방지
    const pmv = playerRows.length
      ? await prisma.playerMarketValue.findMany({
          where: { id: { in: playerRows.map((p) => p.id) }, currentValue: { not: null } },
          select: { id: true },
        })
      : [];
    const pmvSet = new Set(pmv.map((r) => r.id));
    players = playerRows.filter((p) => pmvSet.has(p.id)).slice(0, 8);
  }

  // 리그·허브 — 헤더 네비 정의 재사용 (라벨·설명 매칭)
  const navItems = [...SPORT_CATEGORIES, COMMUNITY_CATEGORY].flatMap((c) => c.items);
  const leagueLinks =
    q.length >= 1
      ? navItems
          .filter(
            (it) =>
              it.label.toLowerCase().includes(lowerQ) ||
              (it.desc ?? "").toLowerCase().includes(lowerQ),
          )
          .slice(0, 6)
      : [];

  const hasEntity = teams.length + players.length + leagueLinks.length > 0;
  const hasAny = hasEntity || articles.length > 0;
  const SECTION = "text-xs font-bold uppercase tracking-[0.15em] text-neutral-400 mb-3";

  return (
    <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <AmbientGlow />
      <header className="mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 통합 검색
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">검색</h1>
        <p className="mt-4 text-sm leading-relaxed text-neutral-600 break-keep dark:text-neutral-400">
          팀·선수·리그 페이지와 기사에서 검색어를 찾아 줍니다.
        </p>
      </header>

      <div className="mb-8">
        <SearchInput defaultValue={q} variant="full" autoFocus />
      </div>

      {q.length === 0 ? (
        <div className="text-center text-neutral-500 py-16 text-sm break-keep">
          검색어를 입력해주세요.
        </div>
      ) : !hasAny ? (
        <div className="text-center text-neutral-500 py-16 text-sm break-keep">
          <p className="text-base font-semibold text-neutral-700 dark:text-neutral-300">
            &ldquo;{q}&rdquo; 검색 결과가 없습니다
          </p>
          <p className="mt-2 text-xs">
            다른 키워드로 시도해보세요. (팀명·리그명·선수명 등)
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {teams.length > 0 && (
            <section>
              <div className={SECTION}>팀</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {teams.map((t) => (
                  <Link
                    key={t.id}
                    href={`/teams/${t.id}`}
                    prefetch={false}
                    className="flex items-center gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04] px-3 py-2.5 hover:bg-neutral-50 dark:hover:bg-white/[0.07] transition"
                  >
                    {t.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.logoUrl} alt="" width={28} height={28} className="h-7 w-7 object-contain" loading="lazy" />
                    ) : (
                      <span className="h-7 w-7 rounded-full bg-neutral-100 dark:bg-neutral-800" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {toKoreanTeamName(t.name, t.league)}
                      </span>
                      <span className="block text-[11px] text-neutral-400">{t.league}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {players.length > 0 && (
            <section>
              <div className={SECTION}>선수</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {players.map((p) => (
                  <Link
                    key={p.id}
                    href={`/transfers/${p.id}`}
                    prefetch={false}
                    className="flex items-center gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04] px-3 py-2.5 hover:bg-neutral-50 dark:hover:bg-white/[0.07] transition"
                  >
                    {p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photoUrl} alt="" width={28} height={28} className="h-7 w-7 rounded-full object-cover" loading="lazy" />
                    ) : (
                      <span className="h-7 w-7 rounded-full bg-neutral-100 dark:bg-neutral-800" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{OV[p.id]?.nameKo ?? p.nameKo ?? p.name}</span>
                      <span className="block text-[11px] text-neutral-400">몸값·커리어 상세</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {leagueLinks.length > 0 && (
            <section>
              <div className={SECTION}>리그·페이지</div>
              <div className="flex flex-wrap gap-2">
                {leagueLinks.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    prefetch={false}
                    className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04] px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-white/[0.07] transition"
                  >
                    {it.label}
                    <span className="text-[11px] text-neutral-400">{it.desc}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {articles.length > 0 && (
            <section>
              <div className={SECTION}>
                기사 <span className="normal-case tracking-normal">— &ldquo;{q}&rdquo; {articles.length}건</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {articles.map((a) => (
                  <ArticleCard key={a.id} article={a} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
