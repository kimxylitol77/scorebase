import Link from "next/link";
import LeagueBadge from "./LeagueBadge";
import { formatRelativeKo } from "@/lib/format";

interface Props {
  article: {
    slug: string;
    title: string;
    league: string;
    type: string;
    publishedAt: Date | null;
    createdAt: Date;
  };
  /** "compact" 면 더 좁은 그리드용으로 패딩/타이포 작게 */
  variant?: "default" | "compact";
}

const TYPE_BADGE: Record<
  string,
  { label: string; cls: string; icon: string }
> = {
  PREVIEW: {
    label: "프리뷰",
    icon: "🔮",
    cls: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20",
  },
  RECAP: {
    label: "리뷰",
    icon: "📝",
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20",
  },
  ANALYSIS: {
    label: "분석",
    icon: "📊",
    cls: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20",
  },
};

export default function ArticleCard({ article, variant = "default" }: Props) {
  const date = article.publishedAt ?? article.createdAt;
  const isCompact = variant === "compact";
  const typeBadge = TYPE_BADGE[article.type];

  return (
    <Link
      href={`/articles/${article.slug}`}
      className="group flex flex-col h-full rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 hover:-translate-y-0.5 hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <LeagueBadge league={article.league} />
        {typeBadge && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold ring-1 ring-inset text-[10px] ${typeBadge.cls}`}
          >
            <span className="text-[11px]">{typeBadge.icon}</span>
            {typeBadge.label}
          </span>
        )}
        <span className="text-neutral-500">{formatRelativeKo(date)}</span>
      </div>

      <h3
        className={`mt-3 font-bold leading-snug tracking-tight group-hover:underline underline-offset-4 decoration-2 line-clamp-3 ${
          isCompact ? "text-base" : "text-lg"
        }`}
      >
        {article.title}
      </h3>

      <div className="mt-auto pt-4 text-xs font-medium text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition flex items-center gap-1">
        읽어보기
        <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}
