// 개인정보처리방침 — 개인정보보호법 제30조 필수 기재사항을 담은 정적 고지 페이지.
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site-url";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description:
    "스코어베이스가 수집하는 개인정보 항목, 처리 목적, 보유 기간, 파기 절차, 이용자 권리와 행사 방법을 안내합니다.",
  alternates: { canonical: `${SITE_URL}/privacy` },
};

const H2 = "mt-10 mb-3 text-lg font-bold tracking-tight";
const P = "text-sm leading-relaxed text-neutral-600 dark:text-neutral-400";
const LI = "text-sm leading-relaxed text-neutral-600 dark:text-neutral-400";
const TABLE = "w-full border-collapse text-sm my-4";
const TH =
  "text-left px-3 py-2 border-b-2 border-neutral-200 dark:border-neutral-700 font-semibold";
const TD = "px-3 py-2 border-b border-neutral-100 dark:border-neutral-800 align-top";

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
        개인정보처리방침
      </h1>
      <p className={`${P} mt-3`}>
        스코어베이스(scorebase.kr, 이하 &ldquo;사이트&rdquo;)는 개인정보보호법 등
        관련 법령을 준수하며, 이용자의 개인정보를 아래와 같이 처리합니다.
      </p>

      <h2 className={H2}>1. 수집하는 개인정보 항목과 방법</h2>
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>구분</th>
              <th className={TH}>항목</th>
              <th className={TH}>수집 방법</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={TD}>회원가입 (이메일)</td>
              <td className={TD}>이메일 주소, 비밀번호(단방향 암호화 저장), 닉네임</td>
              <td className={TD}>가입 양식</td>
            </tr>
            <tr>
              <td className={TD}>회원가입 (구글)</td>
              <td className={TD}>구글 계정 식별자, 이메일 주소, 닉네임</td>
              <td className={TD}>구글 OAuth 동의 화면</td>
            </tr>
            <tr>
              <td className={TD}>선택 항목</td>
              <td className={TD}>아바타 이미지(직접 업로드 시)</td>
              <td className={TD}>계정 설정</td>
            </tr>
            <tr>
              <td className={TD}>서비스 이용 중 자동 생성</td>
              <td className={TD}>
                활동 기록(게시글·댓글·예측·경험치·출석 시각), 접속 기록(방문
                경로, 브라우저 정보, 유입 경로, 무작위 방문자 식별자)
              </td>
              <td className={TD}>자동 수집</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={P}>
        비밀번호는 복호화할 수 없는 해시(bcrypt)로만 저장하며, 구글 가입 계정은
        비밀번호를 수집하지 않습니다.
      </p>

      <h2 className={H2}>2. 처리 목적</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li className={LI}>회원 식별, 로그인 상태 유지, 계정 관리</li>
        <li className={LI}>
          커뮤니티 운영 — 게시글·댓글 표시, 예측 자동 채점, 등급·랭킹 산정
        </li>
        <li className={LI}>서비스 이용 통계 분석과 품질 개선</li>
        <li className={LI}>부정 이용(도배·자동화 요청 등) 방지</li>
      </ul>

      <h2 className={H2}>3. 보유 기간과 파기</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li className={LI}>
          회원 정보는 <strong>탈퇴 즉시</strong> 지체 없이 파기합니다. 탈퇴 시
          계정과 연결된 게시글·댓글·예측 기록·드림팀 데이터가 함께 삭제되며
          복구할 수 없습니다.
        </li>
        <li className={LI}>
          접속 기록(방문 통계)은 특정 개인을 식별하지 않는 형태로 서비스 개선
          통계에 활용합니다.
        </li>
        <li className={LI}>
          전자적 파일은 재생 불가능한 방법으로 삭제하는 방식으로 파기합니다.
        </li>
      </ul>

      <h2 className={H2}>4. 제3자 제공과 처리 위탁</h2>
      <p className={P}>
        수집한 개인정보를 제3자에게 판매하거나 제공하지 않습니다. 다만 서비스
        운영을 위해 아래 업체에 처리를 위탁하며, 해당 인프라는 국외(미국)에
        위치합니다.
      </p>
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>수탁 업체</th>
              <th className={TH}>위탁 업무</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={TD}>Vercel Inc.</td>
              <td className={TD}>웹 호스팅·서비스 운영 인프라</td>
            </tr>
            <tr>
              <td className={TD}>Neon Inc.</td>
              <td className={TD}>데이터베이스 보관</td>
            </tr>
            <tr>
              <td className={TD}>Google LLC</td>
              <td className={TD}>방문 통계 분석(Google Analytics), 구글 로그인</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className={H2}>5. 쿠키 등 자동 수집 장치</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li className={LI}>
          로그인 세션 쿠키 — 로그인 상태 유지에 사용하며 로그아웃 시 삭제됩니다.
        </li>
        <li className={LI}>
          Google Analytics 쿠키 — 방문 통계 목적. 브라우저 설정에서 쿠키 저장을
          거부할 수 있으며, 거부해도 사이트 이용에 제한이 없습니다.
        </li>
        <li className={LI}>
          브라우저 저장소(localStorage) — 다크모드 설정, 매치 즐겨찾기, 무작위
          방문자 식별자를 이용자 기기에만 저장합니다.
        </li>
      </ul>

      <h2 className={H2}>6. 이용자의 권리와 행사 방법</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li className={LI}>
          <Link href="/account" className="text-blue-600 dark:text-blue-400 hover:underline">
            계정 페이지
          </Link>
          에서 닉네임·아바타를 직접 수정할 수 있고, 회원 탈퇴로 개인정보 삭제를
          즉시 실행할 수 있습니다.
        </li>
        <li className={LI}>
          열람·정정·삭제·처리정지 요구는 아래 문의처로 요청할 수 있으며, 지체
          없이 처리합니다.
        </li>
      </ul>

      <h2 className={H2}>7. 안전성 확보 조치</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li className={LI}>비밀번호 단방향 암호화(bcrypt) 저장</li>
        <li className={LI}>전 구간 HTTPS 암호화 전송</li>
        <li className={LI}>서명(HMAC) 기반 세션으로 위·변조 방지</li>
        <li className={LI}>관리자 기능 접근 통제</li>
      </ul>

      <h2 className={H2}>8. 개인정보 보호책임자와 문의</h2>
      <p className={P}>
        개인정보 보호책임자: 스코어베이스 운영자
        <br />
        문의: 사이트 우하단 챗봇으로 남기시면 가장 빠르게 확인합니다. 이메일 문의는{" "}
        <a href="mailto:kimxylitol77@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline">kimxylitol77@gmail.com</a> 로도 가능합니다.
        <br />
        개인정보 침해 신고·상담은 개인정보침해신고센터(privacy.kisa.or.kr,
        국번없이 118)에서도 가능합니다.
      </p>

      <h2 className={H2}>9. 고지 의무</h2>
      <p className={P}>
        이 방침의 내용이 변경되는 경우 시행 7일 전부터 사이트 공지사항을 통해
        알립니다.
      </p>
      <p className={`${P} mt-6 text-neutral-400 dark:text-neutral-500`}>
        시행일: 2026년 7월 2일
      </p>
    </div>
  );
}
