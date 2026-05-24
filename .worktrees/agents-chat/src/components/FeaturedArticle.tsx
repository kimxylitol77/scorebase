// 메인 페이지 상단에 큼직하게 노출되는 대표 글.

import Link from "next/link";
import LeagueBadge from "./LeagueBadge";
import { formatRelativeKo } from "@/lib/format";

interface Props {
  article: {
    slug: string;
    title: string;
    league: string;
    type: string;
    content: string;
    publishedAt: Date | null;
    createdAt: Date;
  };
}

const TYPE_LABEL: Record<string, string> = {
  PREVIEW: "프리뷰",
  RECAP: "리뷰",
  ANALYSIS: "분석",
};

const LEAGUE_GRADIENT: Record<string, string> = {
  EPL: "from-purple-600 via-fuchsia-500 to-pink-500",
  NBA: "from-orange-500 via-amber-500 to-yellow-500",
  NHL: "from-cyan-500 via-blue-600 to-indigo-700",
  MLB: "from-emerald-500 via-green-600 to-teal-700",
  LALIGA: "from-amber-500 via-red-600 to-yellow-500",
  BUNDESLIGA: "from-yellow-400 via-red-600 to-slate-900",
  SERIE_A: "from-sky-500 via-blue-700 to-emerald-600",
  LIGUE_1: "from-blue-700 via-rose-600 to-indigo-600",
  MLS: "from-red-600 via-slate-900 to-blue-700",
  UCL: "from-indigo-700 via-blue-600 to-cyan-500",
  KBO: "from-blue-600 via-cyan-500 to-teal-500",
  NPB: "from-red-600 via-rose-500 to-pink-500",
};

function getLeadParagraph(markdown: string): string {
  // H1 다음 줄부터 첫 빈 줄 전까지를 lead 로 추출.
  const lines = markdown.split("\n");
  const out: string[] = [];
  let pastTitle = false;
  for (const line of lines) {
    if (!pastTitle) {
      if (line.startsWith("# ")) pastTitle = true;
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      if (out.length) break;
      continue;
    }
    if (trimmed.startsWith("##") || trimmed.startsWith("---")) break;
    out.push(trimmed);
  }
  return out.join(" ").replace(/^\*\*|\*\*$/g, "");
}

export default function FeaturedArticle({ article }: Props) {
  const lead = getLeadParagraph(article.content);
  const date = article.publishedAt ?? article.createdAt;
  const gradient =
    LEAGUE_GRADIENT[article.league] ?? "from-neutral-700 to-neutral-900";

  return (
    <Link
      href={`/articles/${article.slug}`}
      className="group block relative overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 transition"
    >
      <div className="grid sm:grid-cols-5">
        {/* 컬러 영역 (좌) */}
        <div
          className={`relative h-44 sm:h-auto sm:col-span-2 bg-gradient-to-br ${gradient} flex items-end p-6`}
        >
          <div className="text-white/90 font-black text-3xl sm:text-4xl tracking-tight leading-none mix-blend-overlay">
            {article.league}
          </div>
          <div
            className="absolute inset-0 opacity-30 mix-blend-overlay pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), transparent 50%), radial-gradient(circle at 80% 80%, rgba(0,0,0,0.3), transparent 50%)",
            }}
          />
        </div>

        {/* 텍스트 (우) */}
        <div className="sm:col-span-3 p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs">
              <LeagueBadge league={article.league} size="md" />
              <span className="text-neutral-500 font-medium">
                {TYPE_LABEL[article.type] ?? article.type}
              </span>
              <span className="text-neutral-300 dark:text-neutral-700">·</span>
              <span className="text-neutral-500">{formatRelativeKo(date)}</span>
            </div>
            <h2 className="mt-4 text-2xl sm:text-3xl font-bold leading-tight tracking-tight group-hover:underline underline-offset-4 decoration-2">
              {article.title}
            </h2>
            {lead && (
              <p className="mt-3 text-neutral-600 dark:text-neutral-400 line-clamp-3 leading-relaxed">
                {lead}
              </p>
            )}
          </div>
          <div className="mt-6 inline-flex items-center text-sm font-semibold text-neutral-700 dark:text-neutral-300 group-hover:translate-x-0.5 transition">
            기사 읽기
            <svg
              className="ml-1 w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>
    </Link>
  );
}
