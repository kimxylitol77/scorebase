import Link from "next/link";
import { Mark } from "./Logo";

const LEAGUES_LEFT: Array<{ code: string; label: string }> = [
  { code: "WORLD_CUP", label: "FIFA 월드컵 2026" },
  { code: "EPL", label: "프리미어리그 (EPL)" },
  { code: "LALIGA", label: "라리가" },
  { code: "BUNDESLIGA", label: "분데스리가" },
  { code: "SERIE_A", label: "세리에 A" },
  { code: "LIGUE_1", label: "리그 1" },
];

const LEAGUES_RIGHT: Array<{ code: string; label: string }> = [
  { code: "UCL", label: "챔피언스리그" },
  { code: "MLS", label: "MLS" },
  { code: "NBA", label: "NBA" },
  { code: "KBO", label: "KBO 리그" },
  { code: "NPB", label: "NPB 리그" },
  { code: "MLB", label: "MLB" },
  { code: "NHL", label: "NHL" },
  { code: "LOL", label: "LCK" },
];

const SHORTCUTS: Array<{ href: string; label: string }> = [
  { href: "/predictions", label: "시즌 예측 대시보드" },
  { href: "/predictions/accuracy", label: "적중률 보드" },
  { href: "/injuries/EPL", label: "팀별 부상자 명단" },
  { href: "/about", label: "방법론 · 데이터 흐름" },
  { href: "/notices", label: "공지 · 패치노트" },
];

export default function Footer() {
  return (
    <footer className="site-footer mt-20">
      <div className="site-footer__inner max-w-6xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-3 gap-10 text-sm">
        {/* 컬럼 1 — 브랜드 */}
        <div>
          <h3 className="flex items-center gap-2 text-lg font-black tracking-tight text-white">
            <Mark size={28} />
            스코어베이스
            <span className="text-sm font-semibold text-white/30">
              Scorebase
            </span>
          </h3>
          <p className="mt-3 text-white/80 font-medium">
            통계 기반 AI 스포츠 분석.
          </p>
          <p className="mt-3 text-white/60 leading-relaxed">
            EPL · 라리가 · 분데스 · 세리에A · 리그 1 · UCL · MLS
            <br />
            KBO · NPB · NBA · MLB · NHL · FIFA 월드컵 2026 · LCK
          </p>
        </div>

        {/* 컬럼 2 — 카테고리 */}
        <div>
          <div className="site-footer__heading mb-3">카테고리</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-white/70">
            <ul className="space-y-2">
              {LEAGUES_LEFT.map((l) => (
                <li key={l.code}>
                  <Link href={`/leagues/${l.code}`} className="site-footer__link">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="space-y-2">
              {LEAGUES_RIGHT.map((l) => (
                <li key={l.code}>
                  <Link href={`/leagues/${l.code}`} className="site-footer__link">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 컬럼 3 — 바로가기 */}
        <div>
          <div className="site-footer__heading mb-3">바로가기</div>
          <ul className="space-y-2 text-white/70">
            {SHORTCUTS.map((s) => (
              <li key={s.href}>
                <Link href={s.href} className="site-footer__link">
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 안내 영역 */}
      <div className="site-footer__notice">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-2 text-[12px] leading-relaxed text-white/55">
          <p>
            본 사이트는 스포츠 정보 제공을 목적으로 하는 미디어이며,{" "}
            <strong className="text-white/85">도박·베팅과 무관</strong>합니다.
          </p>
          <p>
            외부 데이터 출처(football-data.org · ESPN · MLB Stats · NHL API 등)를
            정규화하여 표시하며, 시즌 시뮬레이션·승률 추정치·Value Bet 표시는{" "}
            <strong className="text-white/85">
              통계 모델 기반의 참고용 정보
            </strong>
            입니다. 실제 경기 결과와 다를 수 있습니다.
          </p>
          <p>
            본 사이트의 모든 기사·이미지·통계 분석·예측 콘텐츠는 저작권법에
            의해 보호되며, 사전 서면 동의 없는{" "}
            <strong className="text-rose-300/90">
              무단 전재·복제·재배포·상업적 이용
            </strong>
            을 엄격히 금지합니다.
          </p>
        </div>
      </div>

      {/* 하단 — 좌우 */}
      <div className="site-footer__bottom">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-white/50">
          <div>
            © 2026 스코어베이스 (Scorebase). All rights reserved. · 무단 전재·재배포 금지
          </div>
          <div>
            Built with <strong className="text-white/85">Claude Code</strong> ·
            Powered by{" "}
            <strong className="text-white/85">Claude + Gemini + ChatGPT</strong>{" "}
            · Next.js
          </div>
        </div>
      </div>
    </footer>
  );
}
