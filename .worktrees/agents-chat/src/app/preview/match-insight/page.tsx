// 매치 인사이트 사이드바 미리보기 — sample 데이터로 3가지 케이스 렌더링.
// 1) 유의미 격차 (≥5%p) — 초록 글로우
// 2) 약한 격차 (2~5%p) — 옅은 글로우
// 3) 시장과 일치 — 글로우 없음

import MatchInsightSidebar from "@/components/match-insight/MatchInsightSidebar";
import type { Factor } from "@/components/match-insight/KeyFactors";
import type { PitcherStats } from "@/components/match-insight/PitcherMatchup";

export const dynamic = "force-static";

const FACTORS_STRONG: Factor[] = [
  {
    icon: "⚾",
    text: "롯데 선발 알칸타라 — 최근 4경기 평균 ERA 1.94, K/9 9.5",
    tone: "good",
  },
  {
    icon: "🏟️",
    text: "사직구장 좌타자 친화, 롯데 좌타 3명 1번~3번 배치",
    tone: "good",
  },
  {
    icon: "📉",
    text: "한화 타선 최근 7경기 OPS .658 — 시즌 평균 대비 11% 하락",
    tone: "warn",
  },
  {
    icon: "🌧️",
    text: "경기 시작 시점 강수 확률 20%, 7~8회 영향 가능",
    tone: "neutral",
  },
];

const FACTORS_NEUTRAL: Factor[] = [
  { icon: "⚽", text: "양 팀 최근 5경기 승률 모두 60%대로 비슷한 흐름", tone: "neutral" },
  { icon: "🤕", text: "양 팀 모두 핵심 부상자 0명", tone: "neutral" },
  { icon: "🏟️", text: "홈 어드밴티지가 시즌 통계상 미미 (+0.08 골)", tone: "neutral" },
  { icon: "📊", text: "시장과 AI 모두 박빙으로 추정", tone: "neutral" },
];

const PITCHER_AWAY: PitcherStats = {
  name: "알칸타라",
  era: 2.31,
  whip: 1.08,
  kPer9: 9.4,
  wins: 5,
  losses: 2,
  inningsPitched: 58.1,
};
const PITCHER_HOME: PitcherStats = {
  name: "와이스",
  era: 3.94,
  whip: 1.34,
  kPer9: 7.1,
  wins: 3,
  losses: 4,
  inningsPitched: 52.0,
};

export default function MatchInsightPreviewPage() {
  return (
    <div className="min-h-screen bg-[#020617] py-8 px-3 sm:px-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="text-white">
          <h1 className="text-2xl font-black tracking-tight">
            매치 인사이트 사이드바 — 미리보기
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            베팅 앱 시각 효과 + 미디어 톤 한국어 카피. 격차 정도에 따라 글로우
            강도 자동 분기.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Case 1: 유의미 격차 (LIVE) */}
          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-[0.2em] text-emerald-400 font-bold">
              Case 1 · 유의미 격차 (≥5%p) · LIVE
            </h2>
            <MatchInsightSidebar
              sport="baseball"
              leagueLabel="KBO"
              awayTeam="롯데 자이언츠"
              homeTeam="한화 이글스"
              meta="2026-05-14 18:30 KST · 사직"
              isLive
              liveText="5회 말"
              pickLabel="롯데 자이언츠 우세"
              aiProb={0.62}
              marketProb={0.51}
              outcomeLabel="롯데 자이언츠 승"
              expectedTotal={8.7}
              ouLine={8.5}
              aiSide="OVER"
              pitcherAway={PITCHER_AWAY}
              pitcherHome={PITCHER_HOME}
              factors={FACTORS_STRONG}
              analysisLines={[
                "선발 ERA 격차 1.63 — 롯데가 5이닝 기준 약 0.9점 우위.",
                "한화 타선 7경기 부진 흐름이 출루 / 장타 모두에서 확인됨.",
                "시장은 한화 홈 어드밴티지를 다소 과대 반영. AI 추정 격차 +11%p.",
              ]}
            />
          </section>

          {/* Case 2: 약한 격차 */}
          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-[0.2em] text-emerald-300/80 font-bold">
              Case 2 · 약한 격차 (2~5%p)
            </h2>
            <MatchInsightSidebar
              sport="baseball"
              leagueLabel="KBO"
              awayTeam="LG 트윈스"
              homeTeam="두산 베어스"
              meta="2026-05-15 18:30 KST · 잠실"
              pickLabel="LG 트윈스 약우세"
              aiProb={0.55}
              marketProb={0.52}
              outcomeLabel="LG 트윈스 승"
              expectedTotal={9.1}
              ouLine={9.5}
              aiSide="UNDER"
              pitcherAway={{
                name: "켈리",
                era: 3.12,
                whip: 1.18,
                kPer9: 8.2,
                wins: 4,
                losses: 3,
                inningsPitched: 60.2,
              }}
              pitcherHome={{
                name: "콜 어빈",
                era: 3.55,
                whip: 1.24,
                kPer9: 7.8,
                wins: 4,
                losses: 2,
                inningsPitched: 55.0,
              }}
              factors={[
                { icon: "🤝", text: "양 선발 ERA 격차 0.43 — 박빙 매치업", tone: "neutral" },
                { icon: "📍", text: "잠실 라이벌전 — 평균 득점 시즌 대비 -0.6점", tone: "warn" },
                { icon: "🌬️", text: "잠실 바람 좌→우, 좌타자 외야 비거리 약감소", tone: "neutral" },
                { icon: "📊", text: "최근 H2H 4경기 LG 3승 1패", tone: "good" },
              ]}
              analysisLines={[
                "잠실 라이벌전 특성상 양 팀 시즌 평균 대비 득점이 낮은 경향.",
                "AI 는 LG 선발 안정성을 시장보다 약간 더 평가.",
              ]}
            />
          </section>

          {/* Case 3: 시장과 일치 */}
          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-400 font-bold">
              Case 3 · 시장과 일치 ({"<"}2%p)
            </h2>
            <MatchInsightSidebar
              sport="baseball"
              leagueLabel="KBO"
              awayTeam="KIA 타이거즈"
              homeTeam="삼성 라이온즈"
              meta="2026-05-16 17:00 KST · 라이온즈파크"
              pickLabel="삼성 라이온즈 박빙 우세"
              aiProb={0.51}
              marketProb={0.5}
              outcomeLabel="삼성 라이온즈 승"
              expectedTotal={8.4}
              ouLine={8.5}
              aiSide="PUSH"
              pitcherAway={{
                name: "양현종",
                era: 3.62,
                whip: 1.22,
                kPer9: 7.5,
                wins: 4,
                losses: 3,
                inningsPitched: 56.2,
              }}
              pitcherHome={{
                name: "원태인",
                era: 3.48,
                whip: 1.2,
                kPer9: 7.9,
                wins: 5,
                losses: 2,
                inningsPitched: 60.0,
              }}
              factors={FACTORS_NEUTRAL}
              analysisLines={[
                "지표 대부분에서 양 팀 격차가 미미. 시장도 AI 도 1%p 안쪽 박빙.",
                "이런 매치는 변수 (선발 컨디션, 첫 회 흐름) 영향이 큼.",
              ]}
            />
          </section>
        </div>

        <footer className="text-xs text-neutral-500 pt-6 border-t border-neutral-800 max-w-3xl">
          <strong className="text-neutral-300">실제 적용 후보 페이지:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>
              <code>/articles/[slug]</code> 프리뷰/리뷰 글 사이드바
            </li>
            <li>
              <code>/scores</code> 매치 카드 클릭 시 인사이트 패널 (옵션)
            </li>
            <li>
              <code>/predictions</code> 매치별 카드 (옵션)
            </li>
          </ul>
          <p className="mt-3">
            ⚠ 이 페이지는 디자인 미리보기 전용입니다. 데이터는 sample 입니다.
          </p>
        </footer>
      </div>
    </div>
  );
}
