// /admin/links — 운영자가 자주 접속하는 외부/내부 페이지 모음.
// 검색 + 카드 grid 로 빠르게 이동.

export const dynamic = "force-dynamic";

interface LinkItem {
  name: string;
  url: string;
  desc?: string;
  ext?: boolean; // 외부 link 면 true
}

interface Category {
  title: string;
  emoji: string;
  links: LinkItem[];
}

const CATEGORIES: Category[] = [
  {
    title: "인프라",
    emoji: "☁️",
    links: [
      { name: "Vercel Dashboard", url: "https://vercel.com/dashboard", desc: "deploy · logs · env", ext: true },
      { name: "Neon DB Console", url: "https://console.neon.tech", desc: "PostgreSQL · SQL editor", ext: true },
      { name: "GitHub repo", url: "https://github.com/kimxylitol77/scorebase", desc: "commits · PR · actions", ext: true },
      { name: "GoDaddy DNS", url: "https://dcc.godaddy.com/control/dnsmanagement?domainName=scorebase.kr", desc: "도메인 · DNS 관리", ext: true },
      { name: "AWS Lightsail", url: "https://lightsail.aws.amazon.com/", desc: "worker 인스턴스 · SSH · reboot", ext: true },
    ],
  },
  {
    title: "SEO · 분석",
    emoji: "🔍",
    links: [
      { name: "Google Search Console", url: "https://search.google.com/search-console", desc: "색인 · 검색어 · CTR", ext: true },
    ],
  },
  {
    title: "데이터 API",
    emoji: "🔌",
    links: [
      { name: "API-Football Pro", url: "https://dashboard.api-football.com/profile", desc: "fixtures · standings · stats (결제됨)", ext: true },
      { name: "The Odds API", url: "https://the-odds-api.com/account", desc: "라이브 odds (무료 500/월)", ext: true },
      { name: "football-data.org", url: "https://www.football-data.org/account", desc: "EPL 무료", ext: true },
      { name: "TheSports.com", url: "https://www.thesports.com/", desc: "MQTT · detail_live (Soccer Basic + Baseball)", ext: true },
    ],
  },
  {
    title: "AI · 봇",
    emoji: "🤖",
    links: [
      { name: "Anthropic Console", url: "https://console.anthropic.com/", desc: "Claude API · usage", ext: true },
      { name: "Anthropic API Keys (발급/회전)", url: "https://console.anthropic.com/settings/keys", desc: "ANTHROPIC_API_KEY 발급 · 노출 시 재발급(회전)", ext: true },
      { name: "Google AI Studio (Gemini)", url: "https://aistudio.google.com/apikey", desc: "Gemini API key", ext: true },
      { name: "Telegram BotFather", url: "https://t.me/BotFather", desc: "scorebase_health_bot 관리 · 토큰 회전", ext: true },
    ],
  },
  {
    title: "운영 · admin",
    emoji: "🛠",
    links: [
      { name: "Admin 대시보드", url: "/admin", desc: "메인 admin" },
      { name: "글 관리", url: "/admin/articles", desc: "PREVIEW/RECAP/ANALYSIS 발행 글" },
      { name: "공지 / 패치노트", url: "/admin/notices", desc: "사이트 업데이트" },
      { name: "블로그", url: "/admin/blog", desc: "SEO 키워드 블로그" },
      { name: "검수", url: "/admin/review", desc: "발행 전 검수" },
      { name: "헬스 체크", url: "/admin/health", desc: "stale · 누락 · API 상태" },
      { name: "통계", url: "/admin/stats", desc: "발행/방문 통계" },
    ],
  },
  {
    title: "public — 자주 확인",
    emoji: "🌐",
    links: [
      { name: "라이브 스코어", url: "/scores", desc: "메인 라이브 스코어" },
      { name: "예측 대시보드", url: "/predictions", desc: "10개 리그 시즌 시뮬레이션" },
      { name: "프리뷰 목록", url: "/previews", desc: "최신 매치 프리뷰" },
      { name: "공지/블로그", url: "/notices", desc: "공지 · 블로그 tab" },
      { name: "적중률 보드", url: "/predictions/accuracy", desc: "AI Strong Pick 적중률" },
    ],
  },
];

export default function AdminLinksPage() {
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">자주 접속하는 페이지</h1>
        <p className="text-sm text-neutral-500 mt-1">
          운영 · 인프라 · SEO · API · admin 도구 모음. 카드 클릭하면 새 탭으로 열립니다 (내부 페이지는 같은 탭).
        </p>
      </header>

      <div className="space-y-8">
        {CATEGORIES.map((cat) => (
          <section key={cat.title}>
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 mb-3">
              <span className="mr-1">{cat.emoji}</span>
              {cat.title}
              <span className="ml-2 text-[10px] text-neutral-400 font-normal normal-case">
                ({cat.links.length})
              </span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cat.links.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target={l.ext ? "_blank" : undefined}
                  rel={l.ext ? "noopener noreferrer" : undefined}
                  className="group block rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                        {l.name}
                      </h3>
                      {l.desc && (
                        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                          {l.desc}
                        </p>
                      )}
                    </div>
                    <span
                      aria-hidden
                      className="flex-none text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white text-xs"
                    >
                      {l.ext ? "↗" : "→"}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
