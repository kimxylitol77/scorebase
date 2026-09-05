// 사이트 전체 구조 지도 — 헤더 메뉴 트리 + 종목별 데이터 커버리지 매트릭스 + 갭.
// 메뉴·리그는 nav-config·sport-leagues 에서 자동 렌더(코드 바뀌면 갱신), 커버리지·갭은 수동 큐레이션 상수.
// 혼자 운영하는 사이트 전체를 한눈에 파악 + 뭐가 비어있는지 보기 위한 운영자 전용 페이지.
import Link from "next/link";
import type { Metadata } from "next";
import { SPORT_CATEGORIES, COMMUNITY_CATEGORY } from "@/components/nav-config";
import { SPORTS } from "@/lib/sports/sport-leagues";
import { STANDINGS_VALID, NO_TABLE_LEAGUES } from "@/lib/sports/standings-valid";
import pagesInventory from "../../../../data/pages-inventory.json";
import PageInventory from "@/components/admin/PageInventory";
import MenuFlowDiagram from "@/components/admin/MenuFlowDiagram";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "구조 지도 — admin", robots: { index: false } };

// 커버리지 매트릭스 컬럼 — 종목 공통 기능 축.
const FEATURES = ["라이브", "AI예측", "시즌예측", "배당", "순위", "선수", "팀", "연봉", "이적", "부상", "선발/골리", "고급지표"] as const;
const STANDINGS_COL = FEATURES.indexOf("순위");

/** 마지막으로 코드·운영 화면을 대조해 이 표를 검증한 날. 오래되면 아래 배너가 경고한다. */
const COVERAGE_VERIFIED_AT = "2026-09-05";

// SportCode → 기능별 커버리지 (FEATURES 순서). ● 완비 · ◐ 부분/일부리그 · ○ 미구현(갭) · – 종목상 해당없음.
// ● 기준은 "그 종목의 주력 리그를 전부 덮는가" — 국제대회·마이너 리그까지 요구하지 않는다.
// "auto" 는 코드에서 산출하는 칸(STANDINGS_VALID) — 손으로 고치지 말 것.
//
// 2026-09-05 재검증(운영 화면 실측): 시즌시뮬은 NBA·WNBA·NHL·LCK 가동 확인(종전 ○ → ◐),
//   /salaries 는 kbo·mlb·nba·nhl·soccer 5종(축구·하키 ○ → ◐, 농구는 NBA 뿐이라 ● → ◐),
//   배구 AI예측은 volleyball-predict cron 이 VOLLEYBALL_LEAGUES 전체를 돌아 ◐ → ●.
//   배당 컬럼 신설 — 2026-09 배당 확장(축구 af-odds 53리그·하키 ts 폴러·배구·LOL·UFC) 반영.
// 2026-06-19 코드 재검증: salaries=kbo/mlb/nba, transactions=nba, 시즌시뮬=KBO/NPB/MLB, 로스터=NHL/MLB.
// 2026-06-22: e스포츠 LOL 수집 BDL→TheSports 전환(deeca3d) → 선수·팀 ◐(LCK·LEC·LCS 페이지 가동).
const COVERAGE: Record<string, string[]> = {
  //            라이브 AI예측 시즌예측 배당  순위    선수   팀    연봉   이적   부상  선발/골리 고급지표
  soccer:     ["●", "●", "●", "●", "auto", "●", "●", "◐", "●", "●", "–", "●"],
  baseball:   ["●", "●", "●", "●", "auto", "●", "◐", "◐", "○", "◐", "●", "◐"],
  basketball: ["●", "●", "◐", "◐", "auto", "●", "○", "◐", "◐", "●", "–", "○"],
  volleyball: ["●", "●", "○", "◐", "auto", "◐", "◐", "○", "○", "○", "–", "○"],
  hockey:     ["●", "●", "◐", "◐", "auto", "●", "●", "◐", "○", "○", "●", "○"],
  esports:    ["◐", "◐", "◐", "◐", "auto", "◐", "◐", "○", "○", "–", "–", "○"],
  mma:        ["◐", "○", "–", "◐", "–", "◐", "–", "–", "–", "○", "–", "○"],
  // ESPN 표시 전용 3종(DB 수집 없음) — 2026-09-05 실측으로 신설. 종전엔 COVERAGE 항목이 없어
  // 표에서 세 줄이 통째로 비어 있었다. 이 셋의 "순위" 는 리그 순위표가 아니라 선수·드라이버
  // 랭킹이라 STANDINGS_VALID 로 못 재므로 "auto" 를 쓰지 않고 손으로 적는다.
  //   테니스 /rankings/tennis(ATP·WTA 150위 + 선수 상세)·/tennis/draw·/salaries/tennis(상금)
  //   골프   /golf/korea(한국 선수 트래커)·/salaries/golf(PGA 상금만)
  //   F1     /rankings/f1(드라이버·컨스트럭터)·/salaries/f1(미디어 추정치)
  tennis:     ["◐", "○", "–", "○", "●", "●", "–", "●", "–", "○", "–", "○"],
  golf:       ["◐", "○", "–", "○", "◐", "◐", "–", "◐", "–", "○", "–", "○"],
  f1:         ["◐", "○", "–", "○", "●", "◐", "◐", "◐", "–", "–", "–", "○"],
};

/** 순위 칸 — STANDINGS_VALID 에서 산출(순위표가 의미 없는 컵·친선은 분모에서 뺀다). */
function standingsCell(leagues: string[]): string {
  const target = leagues.filter((l) => !NO_TABLE_LEAGUES.has(l));
  if (target.length === 0) return "–";
  const covered = target.filter((l) => STANDINGS_VALID.has(l)).length;
  return covered === target.length ? "●" : covered === 0 ? "○" : "◐";
}

// 지금 눈에 띄는 갭 — 우선순위 후보 (수동 큐레이션, 2026-09-05 갱신).
const GAPS: { sport: string; level: "none" | "part"; text: string }[] = [
  { sport: "UFC", level: "none", text: "정식 AI예측이 없어 회원봇 픽만. 배당은 2026-09 부터 The Odds API h2h 를 Match 에 저장(/odds UFC 탭)." },
  { sport: "농구(KBL·WKBL)", level: "part", text: "NBA·WNBA 는 시즌시뮬·연봉·이적·배당이 있는데 국내 리그는 전부 없음. 배당은 Odds API·TheSports 어디에도 없어 시즌 중 베트맨 BK 가 유일한 소스." },
  { sport: "배구", level: "part", text: "AI예측(volleyball-elo)·순위·배당(ts 폴러) 가동. 남은 갭=프리뷰 글 미생성, 선수 상세 페이지 없음(리그 리더보드만), 시즌 우승확률 미구현." },
  { sport: "e스포츠", level: "part", text: "LCK 는 일정·결과·순위·선수·시즌시뮬·배당까지 커버. 남은 갭=LEC·LCS 매치/통계 얇고 미래 일정 부족, LPL 은 표시만." },
  { sport: "야구", level: "part", text: "NPB 연봉·이적 없음, KBO/NPB 팀 로스터 미완(scraping). CPBL·LMB 는 배당 소스 자체가 없음." },
  { sport: "하키", level: "part", text: "유럽 리그 순위·배당은 붙었으나 시즌시뮬은 NHL 뿐. 이적·부상 소스 없음(ts lineup.injury 미제공)." },
  { sport: "축구", level: "part", text: "배당 미커버 잔여=api-football 이 odds=false 로 주는 리그(J2·FA컵·동남아·가나·모로코·인도·파라과이). 연봉은 빅5 미디어 추정치뿐(Capology 403 차단)." },
  { sport: "테니스·골프·F1", level: "part", text: "ESPN 직접 fetch 로 랭킹·상금·일정만 표시하고 DB 수집이 없다. 그래서 AI예측·배당이 전부 공백이고 골프는 한국 선수 트래커 범위만 덮는다." },
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
  // 서버 컴포넌트 — 요청(force-dynamic)마다 1회 렌더라 클라이언트 렌더 순수성 규칙 대상이 아니다.
  // eslint-disable-next-line react-hooks/purity
  const staleDays = Math.floor((Date.now() - new Date(COVERAGE_VERIFIED_AT).getTime()) / 86400000);
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
      {/* 이 표는 손으로 유지하는 값이라(순위 칸만 자동) 언제 대조했는지가 신뢰의 전부다.
          90일 넘게 방치되면 배너가 색을 바꿔 스스로 알린다. */}
      <div
        className={`mb-2.5 rounded-lg px-3 py-2 text-xs leading-relaxed ${
          staleDays > 90
            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "bg-neutral-100 text-neutral-500 dark:bg-neutral-900/60 dark:text-neutral-400"
        }`}
      >
        마지막 대조 <strong>{COVERAGE_VERIFIED_AT}</strong> ({staleDays}일 전)
        {staleDays > 90 && " — 90일이 넘었습니다. 코드·운영 화면과 다시 대조하세요."}
        <span className="ml-1">
          · <strong>순위</strong> 칸은 STANDINGS_VALID 에서 자동 산출, 나머지는 수동 큐레이션입니다.
        </span>
      </div>
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
                {(COVERAGE[s.code] ?? []).map((raw, i) => {
                  const v = raw === "auto" ? standingsCell(s.leagues) : raw;
                  return (
                    <td key={i} className={`text-center py-2.5 text-base ${cellColor(v)}`}>{v}</td>
                  );
                })}
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

      <div className="mt-8 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3.5 text-xs leading-relaxed text-neutral-500">
        <p className="font-semibold text-neutral-600 dark:text-neutral-300 mb-1.5">이 페이지는 어디까지 자동인가</p>
        <ul className="space-y-1">
          <li>
            <span className="text-green-600 dark:text-green-500 font-semibold">자동</span> — ① 메뉴 트리(nav-config.ts)·종목별 리그 수(sport-leagues.ts)는 코드를 그대로 읽습니다.
          </li>
          <li>
            <span className="text-green-600 dark:text-green-500 font-semibold">자동</span> — ④ 페이지 인벤토리는{" "}
            <code className="text-[11px]">predev·prebuild</code> hook 이 <code className="text-[11px]">build-pages-inventory.ts</code> 를 돌려
            dev 시작·배포 때마다 다시 만듭니다. page.tsx 를 추가·삭제하거나 헤더 주석만 고쳐도 다음 배포에 반영됩니다.
          </li>
          <li>
            <span className="text-green-600 dark:text-green-500 font-semibold">자동</span> — ② 의 <strong>순위</strong> 칸은 STANDINGS_VALID 로 계산합니다. 리그를 온보딩하면 저절로 바뀝니다.
          </li>
          <li>
            <span className="text-amber-600 dark:text-amber-500 font-semibold">수동</span> — ② 의 나머지 칸과 ③ 갭. &quot;기능이 있느냐&quot;는 라우트 존재만으로 판정되지 않아
            (리그 몇 개를 덮는지·소스가 살아 있는지) 사람이 대조합니다. 고칠 곳은{" "}
            <code className="text-[11px]">admin/structure/page.tsx</code> 의 COVERAGE·GAPS·COVERAGE_VERIFIED_AT 세 상수뿐입니다.
          </li>
        </ul>
      </div>
    </main>
  );
}
