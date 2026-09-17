"use client";
// 베트맨 카드 팀명 링크 — summary 안에 놓이므로 클릭이 펼침으로 새지 않게 막는다(클릭 핸들러라 client 컴포넌트).
import Link from "next/link";

export default function BetmanTeamName({ href, className, children }: { href: string | null; className: string; children: string }) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <Link href={href} onClick={(e) => e.stopPropagation()} className={`${className} hover:underline`}>
      {children}
    </Link>
  );
}
