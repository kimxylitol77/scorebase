// 위젯 임베드 안내 — 외부 블로그·사이트가 무료로 붙일 수 있는 위젯 갤러리 + 복사용 임베드 코드.
// 임베드 코드에 출처 백링크(<a>)를 포함해, 붙이는 사이트마다 자연 백링크가 생기게 한다.
import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import EmbedCodeBox from "@/components/EmbedCodeBox";
import LeagueWidgetCard, { type LeagueWidgetConfig } from "@/components/LeagueWidgetCard";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { Code2, Check } from "lucide-react";

export const revalidate = 3600;

const SITE_URL = process.env.SITE_URL ?? "https://www.scorebase.kr";

export const metadata: Metadata = {
  title: "무료 스포츠 위젯 임베드 — 리그 순위표·경기 일정·AI 승률·라이브 스코어보드",
  description:
    "EPL·K리그·KBO 등 리그 순위표, 경기 일정과 AI 승률, 라이브 스코어보드 위젯을 블로그·카페·홈페이지에 무료로 임베드하세요. 복사·붙여넣기 한 번으로 자동 갱신되는 위젯이 들어갑니다.",
  keywords: ["리그 순위표 위젯", "EPL 순위 위젯", "경기 일정 위젯", "스포츠 위젯", "축구 위젯 임베드", "무료 위젯", "스코어베이스 위젯"],
  alternates: { canonical: `${SITE_URL}/widgets` },
};

// 리그 선택형 위젯 — 2026-09-04 추가. 순위표는 공개 순위 API 와 같은 종목 통합 빌더(축구·야구·농구·배구·NHL), 경기·승률은 전 종목.
const opts = (codes: string[]) => codes.map((code) => ({ code, label: LEAGUE_DISPLAY[code] ?? code }));
const SOCCER_PICK = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "MLS", "EREDIVISIE", "PRIMEIRA_LIGA", "CHAMPIONSHIP", "SAUDI_PL"];
const LEAGUE_WIDGETS: LeagueWidgetConfig[] = [
  {
    key: "standings",
    title: "리그 순위표",
    desc: "리그 순위·승점·득실(야구·농구는 승률·게임차)을 표로. 경기가 끝나면 자동으로 갱신됩니다. URL 의 rows=10 으로 표시 팀 수, theme=dark 로 어두운 배경을 고를 수 있습니다.",
    embedPathBase: "/embed/standings?league=",
    height: 420,
    linkUrlTemplate: "/leagues/{league}",
    linkTextTemplate: "{label} 순위 - 스코어베이스",
    leagues: opts(["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "K_LEAGUE_1", "K_LEAGUE_2", "MLS", "EREDIVISIE", "UCL", "KBO", "NPB", "MLB", "NBA", "WNBA", "KBL", "WKBL", "NHL", "V_LEAGUE", "V_LEAGUE_W"]),
    siteUrl: SITE_URL,
  },
  {
    key: "fixtures",
    title: "경기 일정 · AI 승률",
    desc: "다가오는 경기와 스코어베이스 AI 의 홈·무·원정 승률을 막대로. 라이브 중이면 점수도 함께. URL 의 days=7·limit=10 으로 기간과 경기 수를 조절합니다.",
    embedPathBase: "/embed/fixtures?league=",
    height: 560,
    linkUrlTemplate: "/leagues/{league}",
    linkTextTemplate: "{label} 경기 일정·AI 승률 - 스코어베이스",
    leagues: opts([...SOCCER_PICK, "UCL", "KBO", "MLB", "NPB", "NBA", "NHL", "KBL", "V_LEAGUE"]),
    siteUrl: SITE_URL,
  },
];

interface Widget {
  key: string;
  title: string;
  desc: string;
  embedPath: string;
  height: number;
  linkUrl: string;
  linkText: string;
}

const WIDGETS: Widget[] = [
  {
    key: "accuracy",
    title: "AI 승부 예측 적중률 성적표",
    desc: "리그별로 스코어베이스 AI 의 경기 전 승·무·패 예측이 얼마나 맞았는지. URL 의 period=d30 을 d7·d14·all 로 바꿔 기간을 고를 수 있습니다. 매시간 갱신.",
    embedPath: "/embed/accuracy?period=d30",
    height: 520,
    linkUrl: "/predictions/accuracy",
    linkText: "AI 예측 적중률 - 스코어베이스",
  },
  {
    key: "odds-movers",
    title: "배당 급변 (돈이 몰리는 경기)",
    desc: "향후 3일 경기 중 오픈 배당 대비 시장 승률이 가장 크게 움직인 경기. URL 의 sport=soccer 를 baseball·basketball·hockey 로 바꿀 수 있습니다.",
    embedPath: "/embed/odds-movers?sport=soccer",
    height: 460,
    linkUrl: "/odds",
    linkText: "배당 흐름 - 스코어베이스",
  },
  {
    key: "scoreboard",
    title: "라이브 스코어보드",
    desc: "한 경기의 점수·경기 시간을 투명 배경 위에 5초마다 갱신. OBS 브라우저 소스나 iframe 으로 어디든 붙일 수 있습니다. URL 의 league·id 를 원하는 경기로 바꿔 쓰세요.",
    embedPath: "/embed/scoreboard?league=EPL&id=560547&bg=dark",
    height: 140,
    linkUrl: "/scores",
    linkText: "라이브 스코어 - 스코어베이스",
  },
  {
    key: "wc-bracket",
    title: "2026 월드컵 대진표",
    desc: "32강부터 결승까지 토너먼트 대진을 한눈에. 조별리그 결과가 반영되면 자동으로 갱신됩니다.",
    embedPath: "/embed/wc-bracket",
    height: 640,
    linkUrl: "/world-cup",
    linkText: "2026 월드컵 대진표 - 스코어베이스",
  },
];

function embedCode(w: Widget): string {
  const src = SITE_URL + w.embedPath;
  const link = SITE_URL + w.linkUrl;
  return (
    `<iframe src="${src}" width="100%" height="${w.height}" loading="lazy" ` +
    `title="${w.linkText}" style="border:1px solid #e5e5e5;border-radius:12px;max-width:760px;width:100%"></iframe>\n` +
    `<p style="font-size:12px;color:#737373;margin-top:6px">출처: ` +
    `<a href="${link}" target="_blank" rel="noopener">${w.linkText}</a></p>`
  );
}

export default function WidgetsPage() {
  return (
    <main className="relative max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <AmbientGlow />
      <header className="mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <Code2 className="w-3.5 h-3.5" aria-hidden /> 위젯
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight break-keep">
          스포츠 위젯, 무료로 내 사이트에
        </h1>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400 break-keep leading-relaxed">
          스코어베이스 데이터 위젯을 블로그·홈페이지에 무료로 임베드하세요. 아래 코드를 복사해 붙여넣기만 하면, 실시간으로 갱신되는 위젯이 들어갑니다.
          출처 표기(스코어베이스 링크)만 그대로 두시면 됩니다.
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-neutral-600 dark:text-neutral-300">
          {["무료 · 별도 가입 없음", "실시간 자동 갱신", "모바일 자동 대응"].map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-500" aria-hidden /> {t}
            </li>
          ))}
        </ul>
      </header>

      <div className="space-y-10">
        {LEAGUE_WIDGETS.map((w) => (
          <LeagueWidgetCard key={w.key} w={w} />
        ))}
        {WIDGETS.map((w) => {
          const code = embedCode(w);
          const src = SITE_URL + w.embedPath;
          return (
            <section key={w.key} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04] p-5 sm:p-6 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:shadow-none">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                <h2 className="text-xl font-bold tracking-tight">{w.title}</h2>
                <Link href={w.linkUrl} className="text-xs text-rose-600 dark:text-rose-400 hover:underline" prefetch={false}>
                  원본 페이지 →
                </Link>
              </div>
              <p className="text-sm text-neutral-500 mb-4 break-keep">{w.desc}</p>

              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">미리보기</div>
                <iframe
                  src={src}
                  className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800"
                  style={{ height: w.height, maxWidth: 760 }}
                  loading="lazy"
                  title={w.linkText}
                />
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">임베드 코드 (복사 → 붙여넣기)</div>
                <EmbedCodeBox code={code} />
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-10 text-xs text-neutral-400 leading-relaxed break-keep">
        위젯은 자유롭게 사용할 수 있으며, 출처 표기(스코어베이스 링크)를 그대로 유지해 주세요. 원하는 위젯이 없으면 문의해 주세요.
        문의는 사이트 하단 채널로 보내주시면 됩니다.
      </p>
    </main>
  );
}
