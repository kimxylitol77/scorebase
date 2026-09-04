"use client";
// 리그 선택형 위젯 카드 — /widgets 갤러리에서 리그를 고르면 미리보기 iframe 과 복사 코드가 즉시 바뀐다.
// 붙여 가는 사람이 자기 리그 코드를 직접 만들 수 있어야 붙인다. 복사 코드의 출처 <a> 가 백링크 본체.
import { useState } from "react";
import Link from "next/link";
import EmbedCodeBox from "@/components/EmbedCodeBox";

export interface LeagueWidgetConfig {
  key: string;
  title: string;
  desc: string;
  /** `/embed/standings?league=` 처럼 리그 코드가 뒤에 붙는 경로 */
  embedPathBase: string;
  height: number;
  /** 출처 링크 — `{league}` 자리에 코드가 들어간다 */
  linkUrlTemplate: string;
  /** 출처 앵커 텍스트 — `{label}` 자리에 리그 표시명이 들어간다 */
  linkTextTemplate: string;
  leagues: { code: string; label: string }[];
  siteUrl: string;
}

export default function LeagueWidgetCard({ w }: { w: LeagueWidgetConfig }) {
  const [league, setLeague] = useState(w.leagues[0]?.code ?? "EPL");
  const label = w.leagues.find((l) => l.code === league)?.label ?? league;
  const src = w.siteUrl + w.embedPathBase + league;
  const link = w.siteUrl + w.linkUrlTemplate.replace("{league}", league);
  const linkText = w.linkTextTemplate.replace("{label}", label);
  const code =
    `<iframe src="${src}" width="100%" height="${w.height}" loading="lazy" ` +
    `title="${linkText}" style="border:1px solid #e5e5e5;border-radius:12px;max-width:760px;width:100%"></iframe>\n` +
    `<p style="font-size:12px;color:#737373;margin-top:6px">출처: ` +
    `<a href="${link}" target="_blank" rel="noopener">${linkText}</a></p>`;

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04] p-5 sm:p-6 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:shadow-none">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-xl font-bold tracking-tight">{w.title}</h2>
        <Link href={w.linkUrlTemplate.replace("{league}", league)} className="text-xs text-rose-600 dark:text-rose-400 hover:underline" prefetch={false}>
          원본 페이지 →
        </Link>
      </div>
      <p className="text-sm text-neutral-500 mb-4 break-keep">{w.desc}</p>

      <label className="mb-4 flex items-center gap-2 text-sm">
        <span className="text-neutral-500">리그</span>
        <select
          value={league}
          onChange={(e) => setLeague(e.target.value)}
          className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {w.leagues.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </label>

      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">미리보기</div>
        <iframe
          key={src}
          src={src}
          className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800"
          style={{ height: w.height, maxWidth: 760 }}
          loading="lazy"
          title={linkText}
        />
      </div>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">임베드 코드 (복사 → 붙여넣기)</div>
        <EmbedCodeBox code={code} />
      </div>
    </section>
  );
}
