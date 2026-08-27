// 축구선수 인생 시뮬레이터 — 로그인 없이 즐기는 커리어 게임 (게임 진행은 전부 클라이언트)
import type { Metadata } from "next";
import AmbientGlow from "@/components/AmbientGlow";
import CareerClient from "./CareerClient";

export const metadata: Metadata = {
  title: "축구선수 인생 살아보기",
  description:
    "16세 유스부터 은퇴까지, 선택 하나로 갈리는 축구선수의 커리어를 살아보세요. 회원가입 없이 바로 시작합니다.",
};

export default function CareerPage() {
  return (
    <main className="relative mx-auto max-w-3xl px-4 py-8">
      <AmbientGlow />
      <div className="relative">
        <CareerClient />
      </div>
    </main>
  );
}
