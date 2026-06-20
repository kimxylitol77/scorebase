// 사이트 전체 구조 지도 — 헤더 메뉴 트리 + 종목별 데이터 커버리지 매트릭스 + 갭.
// 메뉴·리그는 nav-config·sport-leagues 에서 자동 렌더(코드 바뀌면 갱신), 커버리지·갭은 수동 큐레이션 상수.
// 혼자 운영하는 사이트 전체를 한눈에 파악 + 뭐가 비어있는지 보기 위한 운영자 전용 페이지.
import Link from "next/link";
import type { Metadata } from "next";
import { SPORT_CATEGORIES, COMMUNITY_CATEGORY } from "@/components/nav-config";
import { SPORTS } from "@/lib/sports/sport-leagues";
import pagesInventory from "../../../../data/pages-inventory.json";
import PageInventory from "@/components/admin/PageInventory";
import MenuFlowDiagram from "@/components/admin/MenuFlowDiagram";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "구조 지도 — admin", robots: { index: false } };

// 커버리지 매트릭스 컬럼 — 종목 공통 기능 축.
const FEATURES = ["라이브", "AI예측", "시즌예측", "순위", "선수", "팀", "연봉", "이적", "부상", "선발/골리", "고급지표"] as const;

// SportCode → 기능별 커버리지 (FEATURES 순서). ● 완비 · ◐ 부분/일부리그 · ○ 미구현(갭) · – 종목상 해당없음.
// 2026-06-19 코드 재검증: salaries=kbo/mlb/nba, transactions=nba, 시즌시뮬=KBO/NPB/MLB, 로스터=NHL/MLB.
const COVERAGE: Record<string, string[]> = {
  soccer:     ["●", "●", "●", "●", "●", "●", "○", "●", "●", "–", "●"],
  baseball:   ["●", "●", "●", "●", "●", "◐", "◐", "○", "◐", "●", "○"],
  basketball: ["●", "●", "○", "●", "●", "○", "●", "●", "●", "–", "○"],
  volleyball: ["●", "○", "○", "●", "○", "◐", "○", "○", "○", "–", "○"],
  hockey:     ["●", "●", "○", "●", "●", "●", "○", "○", "○", "●", "○"],
  esports:    ["◐", "◐", "○", "◐", "○", "○", "○", "○", "–", "–", "○"],
  mma:        ["◐", "○", "–", "–", "○", "–", "–", "–", "○", "–", "○"],
};

// 지금 눈에 띄는 갭 — 우선순위 후보 (수동 큐레이션).
const GAPS: { sport: string; level: "none" | "part"; text: string }[] = [
  { sport: "배구", level: "part", text: "라이브·순위·배당까지 풀스택 수집했는데 헤더 메뉴 노출 0 — 만든 걸 안 보여주는 중 (트래픽 기회손실)." },
  { sport: "e스포츠(LCK)", level: "none", text: "BDL plan 막혀 수집 멈춤(401). 복구는 결제·plan 확인 필요." },
  { sport: "농구·하키", level: "part", text: "시즌 우승확률 예측 미구현 (야구·축구만 있음)." },
  { sport: "야구", level: "part", text: "NPB 연봉·이적 없음, KBO/NPB 팀 로스터 미완(scraping)." },
  { sport: "UFC", level: "none", text: "예측 데이터가 없어 회원봇 픽만, 정식 AI예측 없음." },
];

// 페이지 인벤토리 그룹 — 표시 순서·한글 라벨·색 (스크립트의 group 키와 1:1).
const GROUP_META = [
  { key: "menu", label: "메뉴 직행", dot: "bg-blue-500", bar: "border-l-blue-500" },
  { key: "predictions-deep", label: "예측 딥링크 (메뉴 비노출)", dot: "bg-indigo-500", bar: "border-l-indigo-500" },
  { key: "live", label: "라이브 상세 (매치 클릭)", dot: "bg-rose-500", bar: "border-l-rose-500" },
  { key: "detail", label: "상세 페이지 (동적)", dot: "bg-emerald-500", bar: "border-l-emerald-500" },
  { key: "worldcup", label: "월드컵", dot: "bg-amber-500", bar: "border-l-amber-500" },
  { key: "other", label: "기타·시안", dot: "bg-slate-400", bar: "border-l-slate-400" },
  { key: "prototype", label: "프로토타입 (정리 후보)", dot: "bg-red-500", bar: "border-l-red-500" },
];

function cellColor(v: string): string {
  return v === "●" ? "text-green-600 dark:text-green-500"
    : v === "◐" ? "text-amber-600 dark:text-amber-500"
    : v === "○" ? "text-red-500"
    : "text-neutral-300 dark:text-neutral-700";
}

export default function StructurePage() {
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-1">사이트 구조 지도</h1>
      <p className="text-sm text-neutral-500 mb-7">
        홈 → 대표메뉴 → 종목별 제품 · 종목별 데이터 커버리지까지 한눈에. 메뉴·리그는 코드에서 자동 렌더되고,
        커버리지·갭은 큐레이션 상수(<code className="text-xs">admin/structure/page.tsx</code>)입니다.
      </p>

      {/* ① 메뉴 트리 — 플로우(요약) + 카드(설명, 접기) */}
      <h2 className="text-sm font-bold mb-2.5">
        ① 헤더 메뉴 트리 <span className="text-neutral-400 font-normal">— nav-config.ts (홈 → 메뉴 → 페이지)</span>
      </h2>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 mb-3">
        <MenuFlowDiagram />
      </div>
      <details className="mb-9">
        <summary className="cursor-pointer select-none text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
          메뉴별 카드로 보기 (제품 목록)
        </summary>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-2">
          {[...SPORT_CATEGORIES, COMMUNITY_CATEGORY].map((cat) => (
            <div key={cat.label} className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 bg-neutral-50 dark:bg-neutral-900/40">
              <Link href={cat.href} className="text-sm font-semibold hover:underline block mb-2">
                {cat.label}
              </Link>
              <ul className="space-y-1">
                {cat.items.map((it) => (
                  <li key={it.href} className="text-xs text-neutral-500 leading-snug">
                    <Link href={it.href} className="hover:underline hover:text-neutral-700 dark:hover:text-neutral-300">
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>

      {/* ② 커버리지 매트릭스 */}
      <h2 className="text-sm font-bold mb-2.5">
        ② 종목별 데이터 커버리지{" "}
        <span className="text-neutral-400 font-normal">— ● 완비 · ◐ 부분 · ○ 갭 · – 해당없음</span>
      </h2>
      <div className="overflow-x-auto mb-9">
        <table className="w-full text-xs border-collapse min-w-[640px]">
          <thead>
            <tr className="text-neutral-500 border-b-2 border-neutral-300 dark:border-neutral-700">
              <th className="text-left py-2 pr-2 font-semibold">종목 <span className="text-neutral-400 font-normal">(리그)</span></th>
              {FEATURES.map((f) => (
                <th key={f} className="py-2 px-1 font-semibold whitespace-nowrap">{f}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SPORTS.map((s) => (
              <tr key={s.code} className="border-b border-neutral-100 dark:border-neutral-800/60">
                <td className="text-left py-2.5 pr-2 whitespace-nowrap font-semibold">
                  {s.emoji} {s.label} <span className="text-neutral-400 font-normal tabular-nums">{s.leagues.length}</span>
                </td>
                {(COVERAGE[s.code] ?? []).map((v, i) => (
                  <td key={i} className={`text-center py-2.5 text-base ${cellColor(v)}`}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ③ 갭 */}
      <h2 className="text-sm font-bold mb-2.5">③ 지금 눈에 띄는 갭 <span className="text-neutral-400 font-normal">— 우선순위 후보</span></h2>
      <ol className="space-y-2.5 list-decimal list-inside marker:text-neutral-400">
        {GAPS.map((g, i) => (
          <li key={i} className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
            <span className={`font-bold ${g.level === "none" ? "text-red-500" : "text-amber-600 dark:text-amber-500"}`}>{g.sport}</span>
            {" — "}{g.text}
          </li>
        ))}
      </ol>

      {/* ④ 페이지 인벤토리 — page.tsx 헤더 주석 자동 추출, 박스 카드 */}
      <h2 className="text-sm font-bold mt-9 mb-2.5">
        ④ 페이지 인벤토리{" "}
        <span className="text-neutral-400 font-normal">— page.tsx 헤더 주석 자동 추출 ({pagesInventory.length}개 · 그룹 클릭 펼침 · 설명 길면 카드 클릭)</span>
      </h2>
      <PageInventory
        groups={GROUP_META.map((g) => ({
          ...g,
          pages: pagesInventory.filter((p) => p.group === g.key),
        })).filter((g) => g.pages.length > 0)}
      />

      <p className="mt-8 text-xs text-neutral-400 leading-relaxed">
        출처: nav-config.ts · sport-leagues.ts (메뉴·리그 자동) + 코드 재검증(커버리지). 페이지 인벤토리는{" "}
        <code className="text-[11px]">predev·prebuild</code> hook 으로 dev 시작·배포 시 자동 갱신(page.tsx 추가·삭제 자동 반영). 커버리지·갭 칸이 틀리면 COVERAGE·GAPS 상수만 고치면 됩니다.
      </p>
    </main>
  );
}
