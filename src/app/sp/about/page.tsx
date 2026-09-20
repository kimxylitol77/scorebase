// /about — 무료·데이터 기반·스코어베이스 운영 명시. 베팅 서비스 아님.
import type { Metadata } from "next";
import { SCOREBASE_EN, SP_NAME, spUrl } from "@/lib/sp/site";

export const metadata: Metadata = {
  title: "About",
  description: `${SP_NAME} is the English prediction front-end of Scorebase, a sports data site. Free, no account, no betting services.`,
  alternates: { canonical: spUrl("/about") },
};

export default function AboutPage() {
  return (
    <>
      <section className="py-10">
        <p className="sp-eyebrow">About</p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-5xl">Free predictions from a data site, not a tipster.</h1>
      </section>
      <div className="sp-card max-w-3xl p-6 text-sm leading-relaxed sm:p-8" style={{ color: "var(--sp-fg-muted)" }}>
        <p>{SP_NAME} publishes the match predictions produced by <a className="underline" href={SCOREBASE_EN} target="_blank" rel="noopener noreferrer">Scorebase</a>, a sports data and analysis site covering live scores, standings, player stats and AI projections for football, baseball, basketball and hockey leagues.</p>
        <p className="mt-4">This site exists so English-speaking readers can see today&apos;s probabilities and the public accuracy record without the rest of the Korean-language site. Everything here is free and requires no account.</p>
        <p className="mt-4">We do not sell picks, take bets, run affiliate bonus offers or promise returns. A probability is an estimate of how often an outcome happens in similar situations. It can be wrong on any single match.</p>
        <p className="mt-4">Questions or data issues: contact Scorebase through the links on its site.</p>
      </div>
    </>
  );
}
