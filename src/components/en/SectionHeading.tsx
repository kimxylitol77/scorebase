// SectionHeading (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import Link from "next/link";

interface Props {
  title: string;
  subtitle?: string;
  href?: string;
  hrefLabel?: string;
}

export default function SectionHeading({
  title,
  subtitle,
  href,
  hrefLabel = "More",
}: Props) {
  return (
    <div className="flex items-end justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3 mb-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h2>
        {subtitle && (
          <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>
        )}
      </div>
      {href && (
        <Link
          href={href}
          className="text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"
        >
          {hrefLabel} →
        </Link>
      )}
    </div>
  );
}
