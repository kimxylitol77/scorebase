// 이용약관 — 서비스 성격(참고용 데이터·예측 정보)과 면책, 게시물 규칙을 담은 정적 고지 페이지.
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site-url";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "이용약관",
  description:
    "스코어베이스 서비스 이용 조건, 회원 계정, 게시물 규칙, 콘텐츠 저작권과 면책 사항을 안내합니다.",
  alternates: { canonical: `${SITE_URL}/terms` },
};

const H2 = "mt-10 mb-3 text-lg font-bold tracking-tight";
const P = "text-sm leading-relaxed text-neutral-600 dark:text-neutral-400";
const LI = "text-sm leading-relaxed text-neutral-600 dark:text-neutral-400";

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-2xl sm:text-3xl font-black tracking-tight">이용약관</h1>
      <p className={`${P} mt-3`}>
        이 약관은 스코어베이스(scorebase.kr, 이하 &ldquo;사이트&rdquo;)가 제공하는
        서비스의 이용 조건을 정합니다. 회원가입 시 이 약관과{" "}
        <Link href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">
          개인정보처리방침
        </Link>
        에 동의한 것으로 봅니다.
      </p>

      <h2 className={H2}>제1조 (서비스의 성격)</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li className={LI}>
          사이트는 스포츠 경기 데이터, 통계 모델 기반 승률·시뮬레이션, AI 가
          생성한 분석 글을 제공하는 정보 서비스입니다.
        </li>
        <li className={LI}>
          사이트가 표시하는 모든 예측·확률·Value Bet 표시는{" "}
          <strong>통계적 참고 정보</strong>이며, 실제 경기 결과와 다를 수
          있습니다. 사이트는 예측의 정확성을 보증하지 않습니다.
        </li>
        <li className={LI}>
          사이트는 도박·베팅을 중개·권유하지 않으며, 예측 정보를 근거로 한
          이용자의 의사결정과 그로 인한 손해에 대해 책임지지 않습니다.
        </li>
      </ul>

      <h2 className={H2}>제2조 (회원 계정)</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li className={LI}>
          회원가입은 무료이며, 이메일 또는 구글 계정으로 가입할 수 있습니다.
        </li>
        <li className={LI}>
          계정 정보(비밀번호 등)의 관리 책임은 회원에게 있으며, 타인에게
          양도·대여할 수 없습니다.
        </li>
        <li className={LI}>
          회원은 언제든지 계정 페이지에서 탈퇴할 수 있고, 탈퇴 시 작성한
          게시물·댓글·예측 기록이 함께 삭제됩니다.
        </li>
      </ul>

      <h2 className={H2}>제3조 (게시물)</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li className={LI}>
          게시물의 저작권은 작성자에게 있으며, 작성자는 사이트가 서비스 운영·홍보
          범위에서 게시물을 노출하는 것을 허락합니다.
        </li>
        <li className={LI}>
          다음 게시물은 사전 통지 없이 삭제될 수 있고, 반복 시 이용이 제한될 수
          있습니다 — 불법 도박·사설 베팅 홍보, 광고·스팸, 타인 비방·혐오 표현,
          허위 사실 유포, 저작권 침해물, 법령 위반 콘텐츠.
        </li>
      </ul>

      <h2 className={H2}>제4조 (사이트 콘텐츠의 저작권)</h2>
      <p className={P}>
        사이트가 작성·가공한 기사, 통계 분석, 예측 데이터, 이미지 등 모든
        콘텐츠는 저작권법의 보호를 받습니다. 사전 서면 동의 없는 무단
        전재·복제·재배포·상업적 이용을 금지합니다. 출처(스코어베이스 + 링크)를
        표기한 인용은 환영합니다.
      </p>

      <h2 className={H2}>제5조 (서비스의 변경·중단)</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li className={LI}>
          사이트는 데이터 제공사 사정, 시스템 점검 등으로 서비스의 전부 또는
          일부를 예고 없이 변경·중단할 수 있습니다.
        </li>
        <li className={LI}>
          외부 데이터 소스의 오류·지연으로 인한 정보 부정확에 대해 사이트는
          고의·중과실이 없는 한 책임지지 않습니다.
        </li>
      </ul>

      <h2 className={H2}>제6조 (약관의 변경)</h2>
      <p className={P}>
        약관을 변경하는 경우 시행 7일 전부터 공지사항으로 알립니다. 변경 시행일
        이후 서비스를 계속 이용하면 변경된 약관에 동의한 것으로 봅니다.
      </p>

      <h2 className={H2}>제7조 (준거법)</h2>
      <p className={P}>
        이 약관은 대한민국 법률에 따라 해석되며, 분쟁은 민사소송법상 관할
        법원에 제기합니다.
      </p>

      <p className={`${P} mt-6 text-neutral-400 dark:text-neutral-500`}>
        시행일: 2026년 7월 2일 · 문의: 사이트 우하단 챗봇 또는{" "}
        <a href="mailto:kimxylitol77@gmail.com" className="hover:underline">
          kimxylitol77@gmail.com
        </a>
      </p>
    </div>
  );
}
