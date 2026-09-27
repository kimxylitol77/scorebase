// 농구 블라인드 드래프트 — 역대 선수-시즌을 이름만 보고 뽑아 한 시즌을 돌리는 게임. 로그인 없이 시작.
import type { Metadata } from "next";
import DraftLobby from "@/components/draft/DraftLobby";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "농구 블라인드 드래프트 — NBA·KBL 역대 선수로 최강 5인 짜기",
  description: "이름과 시즌, 포지션만 보고 역대 선수 5명을 뽑아 한 시즌을 돌립니다. NBA 1994년부터, KBL 원년부터. 82전 전승에 도전하세요. 회원가입 없이 바로 시작합니다.",
  alternates: { canonical: "/basketball/draft" },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  return <DraftLobby sport="basketball" modeParam={(await searchParams).mode} />;
}
