// /scores/[league] — 리그별 라이브스코어 고정 URL ("{리그} 라이브스코어" 롱테일 색인용).
// 기존 /scores 페이지 컴포넌트를 sport·league 고정으로 재사용하고, 메타데이터·소개 문단·FAQ 만 이 라우트가 덧붙인다.
// 설계·결정 = docs/scores-league-pages/.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ScoresPage from "../page";
import { LEAGUE_DISPLAY, leaguesForSport, sportCodeForLeague } from "@/lib/sports/sport-leagues";
import { SITE_URL } from "@/lib/site-url";
import { jsonLdScript } from "@/lib/seo/jsonld";

export const dynamic = "force-dynamic";

type Params = { league: string };

// sitemap-entries.ts SITEMAP_LEAGUES 와 동일 집합 — 색인 허용 리그. 나머지는 열리되 noindex.
const INDEX_LEAGUES = new Set([
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "UCL", "UEL", "UECL",
  "MLS", "CHAMPIONSHIP", "EREDIVISIE", "PRIMEIRA_LIGA", "WORLD_CUP", "CLUB_WORLD_CUP",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "AFC_CL", "SAUDI_PL",
  "NBA", "WNBA", "NHL", "MLB", "KBO", "NPB", "LOL", "LCK_CL",
]);

const SPORT_KO: Record<string, string> = { soccer: "축구", baseball: "야구", basketball: "농구", volleyball: "배구", hockey: "하키", esports: "e스포츠", mma: "격투기", tennis: "테니스", golf: "골프", f1: "F1" };

const SPORT_NOTE: Record<string, string> = {
  soccer: "경기 중에는 전반·후반 진행 분과 득점·카드가 2~3초 간격으로 갱신되고, 종료 후에는 최종 점수와 하프타임 점수가 남습니다.",
  baseball: "경기 중에는 이닝·초말·주자 상황이 갱신되고, 종료 후에는 이닝별 점수표(라인스코어)가 남습니다.",
  basketball: "경기 중에는 쿼터별 점수가 갱신되고, 종료 후에는 쿼터별 점수표가 남습니다.",
  hockey: "경기 중에는 피리어드별 점수가 갱신되고, 연장·슛아웃 결과까지 반영됩니다.",
  volleyball: "세트 스코어와 세트별 점수가 갱신됩니다.",
  esports: "세트 스코어가 갱신되고, 종료 후 세트별 결과가 남습니다.",
};

function resolve(league: string): { code: string; sport: string; name: string } | null {
  const code = league.toUpperCase();
  const sport = sportCodeForLeague(code);
  if (!sport || !leaguesForSport(sport).includes(code)) return null;
  return { code, sport, name: LEAGUE_DISPLAY[code] ?? code };
}

function todayKo(): string {
  return new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Seoul" });
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { league } = await params;
  const r = resolve(league);
  if (!r) return {};
  const dateKo = todayKo();
  const sportKo = SPORT_KO[r.sport] ?? "스포츠";
  const title = `${r.name} 라이브스코어 — 오늘 경기 실시간 점수·결과 · ${dateKo}`;
  const description = `${r.name} 라이브스코어 — ${dateKo} ${r.name} 경기 일정·실시간 점수·경기 결과. 진행 중 경기는 2~3초 간격 갱신, 종료 경기는 결과와 모델 승률 적중 여부까지. 스코어베이스.`;
  return {
    title: { absolute: title },
    description,
    keywords: [`${r.name} 라이브스코어`, `${r.name} 라이브 스코어`, `${r.name} 실시간 점수`, `${r.name} 경기 결과`, `오늘 ${r.name} 경기`, `${r.name} 일정`, `${sportKo} 라이브스코어`, "스코어베이스"],
    alternates: { canonical: `/scores/${r.code}` },
    ...(INDEX_LEAGUES.has(r.code) ? {} : { robots: { index: false, follow: true } }),
    openGraph: { title, description, url: `${SITE_URL}/scores/${r.code}`, siteName: "스코어베이스", locale: "ko_KR", type: "website", images: [{ url: "/og-image.png", width: 1200, height: 630, alt: `${r.name} 라이브스코어 — 스코어베이스` }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
  };
}

export default async function LeagueScoresPage({ params }: { params: Promise<Params> }) {
  const { league } = await params;
  const r = resolve(league);
  if (!r) notFound();
  const sportKo = SPORT_KO[r.sport] ?? "스포츠";
  const faq: [string, string][] = [
    [`${r.name} 라이브스코어는 얼마나 자주 갱신되나요?`, `진행 중인 경기는 평균 2~3초 간격으로 점수가 바뀝니다. ${SPORT_NOTE[r.sport] ?? "종료 후에는 최종 결과가 남습니다."}`],
    [`${r.name} 오늘 경기 일정은 어디서 보나요?`, `이 페이지 상단에 오늘 ${r.name} 경기가 시간순으로 있고, 날짜 슬라이더로 어제·내일 경기도 볼 수 있습니다. 경기를 누르면 상세 중계·라인업·승률 페이지로 이동합니다.`],
    [`${r.name} 경기 결과 옆 승률은 무엇인가요?`, `경기 전 스코어베이스 모델(Elo·시장 배당 결합)이 추정한 승률입니다. 종료 후에는 그 추정이 맞았는지 바로 표시되어 매 경기 검증됩니다.`],
  ];
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  const sp = Promise.resolve({ sport: r.sport, league: r.code }) as unknown as Parameters<typeof ScoresPage>[0]["searchParams"];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
      <ScoresPage searchParams={sp} />
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-6">
        <h2 className="text-xl font-bold">{r.name} 라이브스코어 안내</h2>
        <p className="mt-2 text-sm leading-7 text-neutral-600 dark:text-neutral-300">
          {r.name} {sportKo} 경기의 실시간 점수와 오늘 경기 결과를 한 화면에서 봅니다. {SPORT_NOTE[r.sport] ?? ""} 시즌 순위와 주간 일정은{" "}
          <Link href={`/leagues/${r.code}`} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">{r.name} 리그 허브</Link>, 경기별 승률과 AI 픽은{" "}
          <Link href={`/predictions/${r.code}`} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">{r.name} 예측</Link>에 있습니다. 다른 종목은{" "}
          <Link href="/scores" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">전체 라이브스코어</Link>에서 고릅니다.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {faq.map(([q, a]) => (
            <div key={q} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <h3 className="text-sm font-bold">{q}</h3>
              <p className="mt-1.5 text-xs leading-6 text-neutral-600 dark:text-neutral-400">{a}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
