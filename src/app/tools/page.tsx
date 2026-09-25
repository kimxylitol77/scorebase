// 도구 모음 — 승리확률 계산기(야구 3종)·프로토 조합·토토 복식 조합·공정 배당. 계산만 하는 페이지들의 입구.
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "스포츠 계산기 모음 — 승리확률·프로토 조합·토토 복식·공정 배당",
  description:
    "KBO·MLB·NPB 상황별 승리확률 계산기, 프로토 승부식 합성 배당·예상 적중금 계산기, 축구 승무패·야구 승1패·농구 승5패 복식 조합 수 계산기, 마진 제거 공정 배당 계산기.",
  alternates: { canonical: "/tools" },
};

const TOOLS: Array<{ href: string; title: string; desc: string; tag: string }> = [
  { href: "/tools/proto-calculator", title: "프로토 승부식 조합 계산기", desc: "경기별 배당을 넣으면 합성 배당·예상 적중금·배당이 말하는 확률을 계산합니다.", tag: "프로토" },
  { href: "/tools/toto-combination", title: "토토 복식 조합 계산기", desc: "축구 승무패·야구 승1패·농구 승5패 14경기에서 복식 조합 수와 구매금액을 계산합니다.", tag: "토토" },
  { href: "/odds?sport=soccer", title: "공정 배당(No-Vig) 계산기", desc: "배당에서 발매사 마진을 걷어내 공정 확률과 공정 배당을 봅니다. 배당 흐름 페이지 하단.", tag: "배당" },
  { href: "/tools/kbo-win-probability", title: "KBO 승리확률 계산기", desc: "이닝·아웃·주자·점수차 상황별 승리확률과 번트·도루 손익.", tag: "야구" },
  { href: "/tools/mlb-win-probability", title: "MLB 승리확률 계산기", desc: "MLB 상황별 승리확률표.", tag: "야구" },
  { href: "/tools/npb-win-probability", title: "NPB 승리확률 계산기", desc: "NPB 상황별 승리확률표.", tag: "야구" },
];

export default function ToolsIndexPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight">스포츠 계산기</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-neutral-500 break-keep">
        숫자만 계산하는 도구들입니다. 배당·조합·승리확률을 직접 넣어 보고, 근거는 경기 상세와 적중률 페이지에서 확인하세요. 베팅을 권유하지 않습니다.
      </p>
      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="block h-full rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700">
              <span className="rounded bg-neutral-100 px-1.5 py-px text-[10px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{t.tag}</span>
              <div className="mt-1.5 text-[15px] font-bold">{t.title}</div>
              <p className="mt-1 text-[12px] leading-relaxed text-neutral-500 break-keep">{t.desc}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
