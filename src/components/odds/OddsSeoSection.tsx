// /odds 하단 설명 절 + FAQ — 표만 있던 페이지의 thin 탈출. 문장은 odds-seo.ts 가 만들고 FAQPage 스키마도 같은 문장을 쓴다.
import Link from "next/link";
import type { FaqItem } from "@/lib/odds/odds-seo";

export default function OddsSeoSection({ heading, intro, faq, links }: { heading: string; intro: string[]; faq: FaqItem[]; links: { href: string; label: string }[] }) {
  return (
    <section className="mt-10 border-t border-black/5 pt-8 dark:border-white/10">
      <h2 className="text-base sm:text-lg font-bold tracking-tight">{heading}</h2>
      {intro.map((p, i) => (
        <p key={i} className="mt-2 text-sm leading-relaxed text-neutral-600 break-keep dark:text-neutral-400">{p}</p>
      ))}
      <h2 className="mt-6 text-base font-bold tracking-tight">자주 묻는 질문</h2>
      <div className="mt-2 space-y-2">
        {faq.map((f) => (
          <details key={f.q} className="group rounded-xl bg-white p-3.5 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <span>{f.q}</span>
              <span aria-hidden className="text-neutral-400 transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600 break-keep dark:text-neutral-400">{f.a}</p>
          </details>
        ))}
      </div>
      <p className="mt-4 text-xs text-neutral-500">
        {links.map((l, i) => (
          <span key={l.href}>
            {i > 0 && " · "}
            <Link href={l.href} className="font-medium text-blue-600 hover:underline dark:text-blue-400">{l.label}</Link>
          </span>
        ))}
      </p>
    </section>
  );
}
