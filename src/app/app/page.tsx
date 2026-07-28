// 앱 설치 안내 페이지 — PWA(홈 화면에 추가) 설치 방법을 기기별로 안내. 푸터 "앱 설치" 진입점.
import type { Metadata } from "next";
import Image from "next/image";
import InstallButton from "./InstallButton";

export const metadata: Metadata = {
  title: "앱 설치 — 스코어베이스를 홈 화면에",
  description:
    "스코어베이스를 앱처럼 설치하세요. 별도 다운로드 없이 홈 화면에 추가하면 전체 화면으로 더 빠르게 라이브 스코어를 볼 수 있습니다. iPhone·Android·PC 설치 방법 안내.",
  alternates: { canonical: "/app" },
};

const STEP =
  "rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900";
const STEP_TITLE = "text-sm font-bold text-neutral-900 dark:text-white";
const STEP_BODY = "mt-2 space-y-1.5 text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-400";

export default function AppInstallPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-4">
        <Image
          src="/icon-192.png"
          alt="스코어베이스 앱 아이콘"
          width={64}
          height={64}
          className="rounded-2xl"
          priority
        />
        <div>
          <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white">
            앱으로 설치하기
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            스토어 다운로드 없이, 지금 보는 사이트를 그대로 앱처럼.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-blue-500/5 border border-blue-500/15 p-5 text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">
        스코어베이스 앱은 <b>웹앱(PWA)</b> 방식입니다. 앱스토어·플레이스토어에서 내려받는
        프로그램이 아니라, 브라우저가 이 사이트를 홈 화면에 앱 형태로 얹어 주는 기능이라
        용량을 거의 차지하지 않고 설치가 1~2초면 끝납니다. 주소창 없는 전체 화면으로 열리고
        홈 화면 아이콘에서 바로 실행돼 웹으로 여는 것보다 빠르게 느껴집니다. 내용은 웹과
        실시간으로 동일합니다.
      </div>

      <div className="mt-5">
        <InstallButton />
      </div>

      <div className="mt-8 grid gap-4">
        <section className={STEP}>
          <h2 className={STEP_TITLE}>iPhone · iPad (Safari)</h2>
          <div className={STEP_BODY}>
            <p>1. Safari 로 scorebase.kr 을 엽니다.</p>
            <p>2. 하단 가운데 공유 버튼(네모에 화살표)을 누릅니다.</p>
            <p>3. 목록에서 <b>홈 화면에 추가</b>를 선택하고 추가를 누릅니다.</p>
          </div>
        </section>

        <section className={STEP}>
          <h2 className={STEP_TITLE}>Android (Chrome)</h2>
          <div className={STEP_BODY}>
            <p>1. Chrome 으로 scorebase.kr 을 엽니다.</p>
            <p>2. 오른쪽 위 점 3개 메뉴를 누릅니다.</p>
            <p>3. <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 선택합니다.</p>
            <p className="text-neutral-400">위의 "지금 바로 설치하기" 버튼이 보이면 그걸 눌러도 됩니다.</p>
          </div>
        </section>

        <section className={STEP}>
          <h2 className={STEP_TITLE}>PC (Chrome · Edge)</h2>
          <div className={STEP_BODY}>
            <p>1. 주소창 오른쪽 끝의 설치 아이콘(모니터에 화살표)을 누릅니다.</p>
            <p>2. 설치를 확인하면 독·작업표시줄에서 앱처럼 실행됩니다.</p>
          </div>
        </section>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-neutral-400">
        이미 설치한 아이콘의 모양이 예전 것이라면, 홈 화면에서 삭제 후 다시 추가하면 새
        아이콘으로 바뀝니다. 앱을 지워도 계정·즐겨찾기는 사라지지 않습니다.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-neutral-400">
        크롬으로 볼 때 자꾸 앱이 대신 열린다면 크롬의 링크 넘기기 설정이 켜진 것입니다.
        PC 크롬은 주소창에 chrome://app-settings 입력 → 스코어베이스 → &ldquo;지원되는 링크
        열기&rdquo;를 끄고, Android 는 앱 아이콘 길게 눌러 앱 정보 → &ldquo;기본으로
        열기&rdquo;에서 해제하면 브라우저는 브라우저대로, 앱은 앱대로 열립니다.
      </p>
    </main>
  );
}
