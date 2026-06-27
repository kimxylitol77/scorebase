// 위젯 임베드 안내 — 외부 블로그·사이트가 무료로 붙일 수 있는 위젯 갤러리 + 복사용 임베드 코드.
// 임베드 코드에 출처 백링크(<a>)를 포함해, 붙이는 사이트마다 자연 백링크가 생기게 한다.
import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import EmbedCodeBox from "@/components/EmbedCodeBox";
import { Code2, Check } from "lucide-react";

export const revalidate = 3600;

const SITE_URL = process.env.SITE_URL ?? "https://www.scorebase.kr";

export const metadata: Metadata = {
  title: "무료 스포츠 위젯 임베드 — 2026 월드컵 대진표 위젯 | 스코어베이스",
  description:
    "2026 월드컵 대진표 등 스코어베이스 위젯을 블로그·홈페이지에 무료로 임베드하세요. 복사·붙여넣기 한 번으로 실시간 데이터 위젯을 넣을 수 있습니다.",
  keywords: ["월드컵 대진표 위젯", "스포츠 위젯", "축구 위젯 임베드", "무료 위젯", "스코어베이스 위젯"],
  alternates: { canonical: `${SITE_URL}/widgets` },
};

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
        위젯은 자유롭게 사용할 수 있으며, 출처 표기(스코어베이스 링크)를 그대로 유지해 주세요. 더 많은 위젯(리그 순위·적중률 등)을 준비 중입니다.
        문의는 사이트 하단 채널로 보내주시면 됩니다.
      </p>
    </main>
  );
}
