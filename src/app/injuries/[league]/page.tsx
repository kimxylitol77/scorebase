import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import LeagueBadge from "@/components/LeagueBadge";
import { toKoreanTeamName } from "@/lib/team-names";
import { resolvePlayerNames } from "@/lib/players/resolvePlayerName";
import { calcStandings } from "@/lib/predict/standings";
import type { PredictMatch } from "@/lib/predict/types";
import {
  fetchSeasonInjuries,
  getApiFootballSeason,
  getTeamInjuries,
  API_FOOTBALL_LEAGUE_ID,
  type InjuryEntry,
} from "@/lib/sports/api-football-pro";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// UCL 은 소속 리그(EPL/라리가/...)와 중복이라 제외 — 5대 리그 + MLS 만
const VALID = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS"] as const;
type Lg = (typeof VALID)[number];

const CANONICAL = "https://www.scorebase.kr";

interface LeagueMeta {
  krFull: string;
  krShort: string;
  enFull: string;
  /** 리그별 SEO 키워드 + 스타 선수 키워드 (부상 검색 패턴) */
  starKeywords: string[];
}

const LEAGUE_META: Record<Lg, LeagueMeta> = {
  EPL: {
    krFull: "프리미어리그",
    krShort: "EPL",
    enFull: "English Premier League",
    starKeywords: [
      "손흥민 부상",
      "살라 부상",
      "홀란 부상",
      "사카 부상",
      "데 브라위너 부상",
      "맨시티 부상자",
      "리버풀 부상자",
      "아스널 부상자",
      "토트넘 부상자",
    ],
  },
  LALIGA: {
    krFull: "라리가",
    krShort: "라리가",
    enFull: "La Liga",
    starKeywords: [
      "음바페 부상",
      "비니시우스 부상",
      "벨링엄 부상",
      "레반도프스키 부상",
      "야말 부상",
      "레알 마드리드 부상자",
      "바르셀로나 부상자",
      "아틀레티코 마드리드 부상자",
    ],
  },
  BUNDESLIGA: {
    krFull: "분데스리가",
    krShort: "분데스",
    enFull: "Bundesliga",
    starKeywords: [
      "케인 부상",
      "무시알라 부상",
      "비르츠 부상",
      "김민재 부상",
      "이재성 부상",
      "바이에른 뮌헨 부상자",
      "도르트문트 부상자",
      "레버쿠젠 부상자",
    ],
  },
  SERIE_A: {
    krFull: "세리에 A",
    krShort: "세리에A",
    enFull: "Serie A",
    starKeywords: [
      "라우타로 부상",
      "오스미안 부상",
      "디발라 부상",
      "레아오 부상",
      "인터 밀란 부상자",
      "유벤투스 부상자",
      "AC 밀란 부상자",
    ],
  },
  LIGUE_1: {
    krFull: "리그 1",
    krShort: "리그1",
    enFull: "Ligue 1",
    starKeywords: [
      "이강인 부상",
      "뎀벨레 부상",
      "PSG 부상자",
      "파리 생제르맹 부상자",
      "마르세유 부상자",
    ],
  },
  MLS: {
    krFull: "MLS",
    krShort: "MLS",
    enFull: "Major League Soccer",
    starKeywords: [
      "메시 부상",
      "수아레스 부상",
      "인터 마이애미 부상자",
      "LAFC 부상자",
    ],
  },
};

// ===== 사유 한글 번역 (보강) =====
const REASON_KO: Record<string, string> = {
  Hamstring: "햄스트링",
  Knee: "무릎",
  Ankle: "발목",
  Foot: "발",
  Calf: "종아리",
  Thigh: "허벅지",
  Groin: "사타구니",
  Back: "허리",
  Shoulder: "어깨",
  Wrist: "손목",
  Hand: "손",
  Hip: "고관절",
  Concussion: "뇌진탕",
  Achilles: "아킬레스",
  Illness: "질병",
  Sick: "질병",
  Suspended: "출장 정지",
  Fitness: "컨디션",
  Muscle: "근육",
  "Broken Bone": "골절",
  "Broken Leg": "다리 골절",
  "Broken collarbone": "쇄골 골절",
  Fracture: "골절",
  Hernia: "탈장",
  Wound: "외상",
  "Cardiac problems": "심장 문제",
  Toe: "발가락",
  Knock: "타박상",
  "Yellow Cards": "경고 누적",
  "Red Card": "퇴장 누적",
  Injury: "부상",
  injured: "부상",
  Strain: "근육 파열",
  Sprain: "염좌",
  Cramp: "쥐",
  Surgery: "수술",
  Rehab: "재활",
  Personal: "개인 사정",
  "Coach Decision": "감독 결정",
  "Coach's decision": "감독 결정",
  Doubtful: "출전 불투명",
  Rest: "휴식",
  Inactive: "미출전 명단 제외",
  "International duty": "국가대표 차출",
  "Loan agreement": "임대 이적",
  ACL: "전방 십자인대",
  Ligament: "인대",
  other: "사유 미공개",
};

function translateReason(en: string): string {
  if (!en) return "사유 미공개";
  for (const [k, v] of Object.entries(REASON_KO)) {
    if (en.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return en;
}

// ===== 심각도 분류 =====
type Severity = "long" | "short" | "returning" | "non_injury" | "unknown";

const SEVERITY_META: Record<
  Severity,
  { label: string; icon: string; color: string; bgClass: string }
> = {
  long: {
    label: "장기 결장",
    icon: "🔴",
    color: "#ef4444",
    bgClass:
      "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  },
  short: {
    label: "단기 결장",
    icon: "🟡",
    color: "#f59e0b",
    bgClass:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  },
  returning: {
    label: "회복 임박",
    icon: "🟢",
    color: "#10b981",
    bgClass:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  non_injury: {
    label: "부상 외",
    icon: "⚠️",
    color: "#6b7280",
    bgClass:
      "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  },
  unknown: {
    label: "사유 미공개",
    icon: "❓",
    color: "#4b5563",
    bgClass:
      "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  },
};

function classifySeverity(reasonEn: string): Severity {
  const r = (reasonEn ?? "").toLowerCase();
  if (
    /broken leg|broken collarbone|achilles|acl|hernia|fracture|surgery|ligament|십자인대|골절/.test(
      r,
    )
  )
    return "long";
  if (
    /knee|hamstring|muscle|ankle|thigh|calf|groin|knock|back|shoulder|foot|hip|wrist|hand|toe|strain|sprain/.test(
      r,
    )
  )
    return "short";
  if (/fitness|illness|sick|concussion|cramp|rest|rehab/.test(r))
    return "returning";
  if (
    /yellow cards|red card|suspended|international duty|loan agreement|inactive|coach.*decision|personal|doubtful/.test(
      r,
    )
  )
    return "non_injury";
  if (/wound|other|^$/.test(r) || !r) return "unknown";
  // 매핑에 없는 키워드 → 일단 short 로 보수적 분류
  return "short";
}

interface EnrichedInjury {
  playerId: number;
  playerName: string;
  reasonKo: string;
  reasonRaw: string;
  severity: Severity;
}

interface Props {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ q?: string; severity?: string; sort?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league } = await params;
  const upper = league.toUpperCase() as Lg;
  if (!VALID.includes(upper)) return { title: "부상자 명단" };
  const lm = LEAGUE_META[upper];

  // 빠른 통계 fetch (description 에 수치 포함)
  let totalInjuries = 0;
  let topTeam: { name: string; count: number } | null = null;
  let fullSquadCount = 0;
  try {
    const teams = await prisma.team.findMany({ where: { league: upper } });
    const hasKey = !!process.env.API_FOOTBALL_KEY;
    if (hasKey && API_FOOTBALL_LEAGUE_ID[upper] && teams.length > 0) {
      const season = getApiFootballSeason(new Date(), upper);
      const all = await fetchSeasonInjuries(upper, season);
      let maxCount = 0;
      let maxName = "";
      for (const t of teams) {
        const list = getTeamInjuries(all, t.name, undefined, 30);
        totalInjuries += list.length;
        if (list.length === 0) fullSquadCount++;
        if (list.length > maxCount) {
          maxCount = list.length;
          maxName = toKoreanTeamName(t.name);
        }
      }
      if (maxCount > 0) topTeam = { name: maxName, count: maxCount };
    }
  } catch {}

  const url = `${CANONICAL}/injuries/${upper}`;
  const title = `${lm.krFull} 부상자 명단 2025-26 시즌${totalInjuries > 0 ? ` · 총 ${totalInjuries}명 결장` : ""} | 스코어베이스`;
  const description = totalInjuries > 0
    ? `${lm.krFull} 전 팀 부상·결장 선수 ${totalInjuries}명 현황${topTeam ? `. 가장 많은 결장자 보유: ${topTeam.name}(${topTeam.count}명)` : ""}${fullSquadCount > 0 ? `. 풀스쿼드 팀 ${fullSquadCount}개` : ""}. 매일 업데이트 · 출처 api-football Pro.`
    : `${lm.krFull} 전 팀의 현재 부상·결장 선수 한 페이지 정리. 사유·심각도·복귀 가늠 — 매일 업데이트.`;

  return {
    title,
    description,
    keywords: [
      `${lm.krFull} 부상자`,
      `${lm.krFull} 부상자 명단`,
      `${upper} 부상자`,
      `${lm.enFull} injuries`,
      "축구 부상자",
      "스포츠 부상자 명단",
      "2025-26 시즌 부상자",
      ...lm.starKeywords,
    ],
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      url,
      siteName: "스코어베이스",
      title,
      description,
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
  };
}

export default async function InjuriesByLeague({
  params,
  searchParams,
}: Props) {
  const { league } = await params;
  const sp = await searchParams;
  const upper = league.toUpperCase() as Lg;
  if (!VALID.includes(upper)) notFound();
  const lm = LEAGUE_META[upper];

  const teams = await prisma.team.findMany({
    where: { league: upper },
    orderBy: { name: "asc" },
  });

  // 리그 매치 데이터 (순위 + 다음 경기 계산용)
  const dbMatches = await prisma.match.findMany({
    where: { league: upper },
    select: {
      id: true,
      league: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      startTime: true,
    },
  });
  const standings = calcStandings(
    dbMatches.map((m) => ({ ...m })) as PredictMatch[],
  );

  // 팀별 다음 경기 (가장 가까운 SCHEDULED)
  const now = new Date();
  const upcomingMatches = await prisma.match.findMany({
    where: {
      league: upper,
      status: "SCHEDULED",
      startTime: { gte: now },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "asc" },
  });
  const nextMatchByTeam = new Map<
    number,
    { startTime: Date; oppId: number; oppName: string; isHome: boolean }
  >();
  for (const m of upcomingMatches) {
    if (!nextMatchByTeam.has(m.homeTeamId)) {
      nextMatchByTeam.set(m.homeTeamId, {
        startTime: m.startTime,
        oppId: m.awayTeam.id,
        oppName: m.awayTeam.name,
        isHome: true,
      });
    }
    if (!nextMatchByTeam.has(m.awayTeamId)) {
      nextMatchByTeam.set(m.awayTeamId, {
        startTime: m.startTime,
        oppId: m.homeTeam.id,
        oppName: m.homeTeam.name,
        isHome: false,
      });
    }
  }

  let allInjuries: InjuryEntry[] = [];
  const hasKey = !!process.env.API_FOOTBALL_KEY;
  if (hasKey && API_FOOTBALL_LEAGUE_ID[upper]) {
    try {
      const season = getApiFootballSeason(new Date(), upper);
      allInjuries = await fetchSeasonInjuries(upper, season);
    } catch {}
  }

  // 검색·필터·정렬 파라미터
  const query = (sp.q ?? "").trim().toLowerCase();
  const severityFilter = (sp.severity ?? "ALL") as
    | "ALL"
    | Severity;
  const sort = sp.sort ?? "count_desc";

  // 팀별 raw 부상자 (한글 미적용)
  const rawByTeam = teams.map((t) => ({
    team: t,
    raw: getTeamInjuries(allInjuries, t.name, undefined, 30),
  }));

  // 모든 선수 ID 모아서 Supabase batch 조회 (한 번에)
  const allPlayers = rawByTeam.flatMap((x) =>
    x.raw.map((i) => ({
      apiFootballId: i.playerId,
      nameEn: i.playerName,
    })),
  );
  const resolved = await resolvePlayerNames(allPlayers, "soccer", upper);

  const byTeam = rawByTeam.map(({ team, raw }) => {
    const enriched: EnrichedInjury[] = raw.map((i) => {
      const r = resolved.get(i.playerId) ?? { ko: i.playerName };
      return {
        playerId: i.playerId,
        playerName: r.ko,
        reasonKo: translateReason(i.reason),
        reasonRaw: i.reason,
        severity: classifySeverity(i.reason),
      };
    });

    // 필터 적용 (선수 검색 / 심각도)
    let filtered = enriched;
    if (query) {
      filtered = filtered.filter((p) =>
        p.playerName.toLowerCase().includes(query),
      );
    }
    if (severityFilter !== "ALL") {
      filtered = filtered.filter((p) => p.severity === severityFilter);
    }
    return { team, all: enriched, filtered };
  });

  // 정렬
  byTeam.sort((a, b) => {
    if (sort === "alpha") {
      return toKoreanTeamName(a.team.name).localeCompare(
        toKoreanTeamName(b.team.name),
        "ko",
      );
    }
    if (sort === "rank") {
      const ra = standings.byTeam.get(a.team.id)?.position ?? 999;
      const rb = standings.byTeam.get(b.team.id)?.position ?? 999;
      return ra - rb;
    }
    if (sort === "count_asc") return a.all.length - b.all.length;
    // count_desc 기본
    if (a.all.length > 0 && b.all.length === 0) return -1;
    if (a.all.length === 0 && b.all.length > 0) return 1;
    return b.all.length - a.all.length;
  });

  // 풀스쿼드 vs 부상자 있는 팀
  const fullSquadTeams = byTeam.filter((x) => x.all.length === 0);
  const injuredTeams = byTeam.filter((x) => x.all.length > 0);

  const totalInjuries = byTeam.reduce((s, x) => s + x.all.length, 0);
  const avgPerTeam = byTeam.length > 0 ? totalInjuries / byTeam.length : 0;

  // 상위 3팀
  const top3 = [...byTeam]
    .sort((a, b) => b.all.length - a.all.length)
    .slice(0, 3)
    .filter((x) => x.all.length > 0);

  // 부위 집계
  const partCount = new Map<string, number>();
  for (const { all } of byTeam) {
    for (const i of all) {
      partCount.set(i.reasonKo, (partCount.get(i.reasonKo) ?? 0) + 1);
    }
  }
  const sortedParts = Array.from(partCount.entries()).sort(
    (a, b) => b[1] - a[1],
  );
  const topPart = sortedParts[0]
    ? {
        name: sortedParts[0][0],
        count: sortedParts[0][1],
        pct:
          totalInjuries > 0
            ? Math.round((sortedParts[0][1] / totalInjuries) * 100)
            : 0,
      }
    : null;

  const lastUpdatedKst = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const pageUrl = `${CANONICAL}/injuries/${upper}`;
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: CANONICAL },
      {
        "@type": "ListItem",
        position: 2,
        name: lm.krFull,
        item: `${CANONICAL}/leagues/${upper}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "부상자 명단",
        item: pageUrl,
      },
    ],
  };
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${lm.krFull} 부상자 명단`,
    description: `${lm.krFull} 전 팀의 부상·결장 선수 명단.`,
    itemListElement: injuredTeams.slice(0, 30).map((x, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SportsTeam",
        name: toKoreanTeamName(x.team.name),
        alternateName: x.team.name,
        url: `${CANONICAL}/teams/${x.team.id}`,
      },
    })),
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      {/* 헤더 */}
      <section className="relative overflow-hidden border-b border-neutral-200 dark:border-neutral-800">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-60 dark:opacity-30"
          style={{
            background:
              "radial-gradient(60% 80% at 20% 0%, rgba(244,63,94,0.15), transparent 60%), radial-gradient(50% 70% at 90% 30%, rgba(59,130,246,0.12), transparent 60%)",
          }}
        />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="text-[11px] font-bold tracking-[0.2em] uppercase text-neutral-500 mb-2">
            Injuries · api-football Pro · 2025-26 시즌
          </div>
          <div className="flex items-center gap-3 mb-2">
            <LeagueBadge league={upper} size="md" />
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
              {lm.krFull} 부상자 명단
            </h1>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            팀별 시즌 누적 부상·결장 선수. 사유는 영문 의학용어를 한글로 자동
            번역, 심각도별 분류.
          </p>
          <p className="text-[11px] text-neutral-500 mt-1">
            🕒 마지막 업데이트: {lastUpdatedKst} · 출처: api-football Pro
          </p>
        </div>
      </section>

      {/* 리그 탭 */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center gap-2">
        {VALID.map((l) => {
          const active = l === upper;
          return (
            <Link
              key={l}
              href={`/injuries/${l}`}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                active
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              }`}
            >
              {LEAGUE_META[l].krFull}
            </Link>
          );
        })}
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 space-y-6">
        {!hasKey && (
          <div className="rounded-xl border border-amber-300/40 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm">
            API_FOOTBALL_KEY 가 설정되지 않아 부상자 데이터를 불러오지 못했습니다.
          </div>
        )}

        {/* 요약 대시보드 — 4개 카드 */}
        {totalInjuries > 0 && (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="총 결장자"
              value={`${totalInjuries}명`}
              subtle={`${byTeam.length}개 팀 평균 ${avgPerTeam.toFixed(1)}명`}
            />
            {topPart && (
              <StatCard
                label="최다 부상 부위"
                value={topPart.name}
                subtle={`${topPart.count}건 · ${topPart.pct}%`}
              />
            )}
            <StatCard
              label="영향 큰 팀 TOP 3"
              value={top3.length > 0 ? `${top3[0].all.length}명` : "—"}
              subtle={top3
                .map((x) => toKoreanTeamName(x.team.name))
                .join(" · ")}
            />
            <StatCard
              label="풀스쿼드"
              value={`${fullSquadTeams.length}팀`}
              subtle={fullSquadTeams.length > 0 ? "부상자 0명" : "없음"}
              positive={fullSquadTeams.length > 0}
            />
          </section>
        )}

        {/* SEO 분석 문단 */}
        {totalInjuries > 0 && (
          <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 p-5 space-y-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            <p>
              <strong>
                2025-26 시즌 {lm.krFull} 전체 부상·결장 선수는 총{" "}
                {totalInjuries}명
              </strong>
              으로 집계됐다. {byTeam.length}개 팀 평균 {avgPerTeam.toFixed(1)}
              명이 결장 중이며
              {top3.length > 0 && (
                <>
                  , 가장 많은 결장자를 보유한 팀은{" "}
                  <strong>
                    {toKoreanTeamName(top3[0].team.name)}({top3[0].all.length}
                    명)
                  </strong>
                </>
              )}
              {fullSquadTeams.length > 0 && (
                <>
                  , 풀스쿼드를 유지 중인 팀은{" "}
                  <strong>
                    {fullSquadTeams
                      .slice(0, 3)
                      .map((x) => toKoreanTeamName(x.team.name))
                      .join(", ")}
                    {fullSquadTeams.length > 3 &&
                      ` 외 ${fullSquadTeams.length - 3}팀`}
                  </strong>
                  이다.
                </>
              )}
              {fullSquadTeams.length === 0 && "."}
            </p>
            {topPart && (
              <p>
                부상 부위별로는{" "}
                <strong>
                  {topPart.name}({topPart.count}건, {topPart.pct}%)
                </strong>
                이 가장 많이 발생했고
                {sortedParts.slice(1, 3).length > 0 &&
                  `, 그 다음은 ${sortedParts
                    .slice(1, 3)
                    .map((p) => p[0])
                    .join("과 ")} 순이다.`}
              </p>
            )}
          </section>
        )}

        {/* 풀스쿼드 별도 섹션 — 상단에서 강조 */}
        {fullSquadTeams.length > 0 && severityFilter === "ALL" && !query && (
          <section>
            <h2 className="text-sm font-bold tracking-wider uppercase text-emerald-700 dark:text-emerald-400 mb-2">
              ✅ 풀스쿼드 유지 {fullSquadTeams.length}팀
            </h2>
            <div className="flex flex-wrap gap-2">
              {fullSquadTeams.map((x) => (
                <Link
                  key={x.team.id}
                  href={`/teams/${x.team.id}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-sm hover:border-emerald-500/60 transition"
                >
                  {x.team.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={x.team.logoUrl}
                      alt=""
                      className="w-4 h-4 object-contain"
                      loading="lazy"
                    />
                  )}
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {toKoreanTeamName(x.team.name)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 컨트롤 바 — 검색 + 필터 + 정렬 (URL query 기반, 서버 컴포넌트) */}
        <ControlsBar
          league={upper}
          query={query}
          severity={severityFilter}
          sort={sort}
        />

        {/* 부상자 있는 팀 카드 그리드 */}
        {injuredTeams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-neutral-500 text-sm">
            {query || severityFilter !== "ALL"
              ? "필터에 일치하는 결과가 없습니다."
              : "현재 부상자 데이터가 없습니다."}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {injuredTeams.map(({ team, all, filtered }) => {
              if (query || severityFilter !== "ALL") {
                if (filtered.length === 0) return null;
              }
              const list = query || severityFilter !== "ALL" ? filtered : all;
              return (
                <TeamInjuryCard
                  key={team.id}
                  teamId={team.id}
                  teamName={team.name}
                  logoUrl={team.logoUrl}
                  rank={standings.byTeam.get(team.id)?.position}
                  nextMatch={nextMatchByTeam.get(team.id)}
                  all={all}
                  shown={list}
                  filterActive={!!query || severityFilter !== "ALL"}
                />
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-neutral-500 leading-relaxed">
          데이터: api-football Pro (시즌 누적 부상자) · 사유 한글 번역은
          의학용어 매핑 기반. 본 명단은 참고용으로 실제 매치 라인업과 다를 수
          있습니다.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtle,
  positive = false,
}: {
  label: string;
  value: string;
  subtle?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 hover:-translate-y-0.5 transition-transform">
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-black tabular-nums ${
          positive ? "text-emerald-600 dark:text-emerald-400" : ""
        }`}
      >
        {value}
      </div>
      {subtle && (
        <div className="mt-0.5 text-[11px] text-neutral-500 truncate">
          {subtle}
        </div>
      )}
    </div>
  );
}

function ControlsBar({
  league,
  query,
  severity,
  sort,
}: {
  league: Lg;
  query: string;
  severity: "ALL" | Severity;
  sort: string;
}) {
  // 서버 컴포넌트 — form GET 으로 URL query 반영
  return (
    <form
      action={`/injuries/${league}`}
      method="get"
      className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 flex flex-wrap gap-2 items-center text-sm bg-white/40 dark:bg-neutral-900/40"
    >
      <input
        type="search"
        name="q"
        defaultValue={query}
        placeholder="🔍 선수명 검색"
        className="flex-1 min-w-[200px] px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
      />
      <select
        name="severity"
        defaultValue={severity}
        className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
      >
        <option value="ALL">심각도 전체</option>
        <option value="long">🔴 장기 결장</option>
        <option value="short">🟡 단기 결장</option>
        <option value="returning">🟢 회복 임박</option>
        <option value="non_injury">⚠️ 부상 외</option>
        <option value="unknown">❓ 사유 미공개</option>
      </select>
      <select
        name="sort"
        defaultValue={sort}
        className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
      >
        <option value="count_desc">부상자 많은 순</option>
        <option value="count_asc">부상자 적은 순</option>
        <option value="alpha">팀 이름 순</option>
        <option value="rank">리그 순위 순</option>
      </select>
      <button
        type="submit"
        className="px-3 py-1.5 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold"
      >
        적용
      </button>
      {(query || severity !== "ALL" || sort !== "count_desc") && (
        <Link
          href={`/injuries/${league}`}
          className="text-xs text-neutral-500 hover:underline"
        >
          초기화
        </Link>
      )}
    </form>
  );
}

function TeamInjuryCard({
  teamId,
  teamName,
  logoUrl,
  rank,
  nextMatch,
  all,
  shown,
  filterActive,
}: {
  teamId: number;
  teamName: string;
  logoUrl: string | null;
  rank?: number;
  nextMatch?: {
    startTime: Date;
    oppId: number;
    oppName: string;
    isHome: boolean;
  };
  all: EnrichedInjury[];
  shown: EnrichedInjury[];
  filterActive: boolean;
}) {
  // 심각도별 카운트 (all 기준 — 필터와 무관하게 전체 표시)
  const counts: Record<Severity, number> = {
    long: 0,
    short: 0,
    returning: 0,
    non_injury: 0,
    unknown: 0,
  };
  for (const i of all) counts[i.severity]++;

  // 핵심 결장자 — 장기 결장 > 단기 결장 > ... 순서 첫 1명 (한글 매핑 우선)
  const keyOne =
    all.find((i) => i.severity === "long" && /[가-힣]/.test(i.playerName)) ??
    all.find((i) => i.severity === "short" && /[가-힣]/.test(i.playerName)) ??
    all.find((i) => /[가-힣]/.test(i.playerName)) ??
    all[0] ??
    null;

  return (
    <details className="injury-card group rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-900/40 hover:-translate-y-0.5 transition-transform">
      <summary className="list-none cursor-pointer flex items-start gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition select-none">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="w-9 h-9 object-contain shrink-0 mt-0.5"
            loading="lazy"
          />
        ) : (
          <span className="inline-flex w-9 h-9 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-sm font-bold text-neutral-500 shrink-0">
            {teamName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/teams/${teamId}`}
              className="font-bold truncate hover:underline"
            >
              {toKoreanTeamName(teamName)}
            </Link>
            {rank && (
              <span className="text-[11px] text-neutral-500">
                리그 {rank}위
              </span>
            )}
          </div>
          <div className="text-[11px] text-neutral-500 truncate">
            {teamName}
            {nextMatch && (
              <>
                {" · "}
                <span title={nextMatch.startTime.toISOString()}>
                  다음 경기 {nextMatch.isHome ? "vs" : "@"}{" "}
                  {toKoreanTeamName(nextMatch.oppName)},{" "}
                  {nextMatch.startTime.toLocaleDateString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                    timeZone: "Asia/Seoul",
                  })}
                </span>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px]">
            {counts.long > 0 && (
              <SevBadge sev="long" count={counts.long} />
            )}
            {counts.short > 0 && (
              <SevBadge sev="short" count={counts.short} />
            )}
            {counts.returning > 0 && (
              <SevBadge sev="returning" count={counts.returning} />
            )}
            {counts.non_injury > 0 && (
              <SevBadge sev="non_injury" count={counts.non_injury} />
            )}
            {counts.unknown > 0 && (
              <SevBadge sev="unknown" count={counts.unknown} />
            )}
          </div>
          {keyOne && counts.long + counts.short > 0 && (
            <div className="text-[11px] text-neutral-500 mt-1 truncate">
              핵심 결장:{" "}
              <strong className="text-neutral-700 dark:text-neutral-200">
                {keyOne.playerName}
              </strong>{" "}
              ({keyOne.reasonKo})
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {all.length}명
            {filterActive && shown.length !== all.length && (
              <span className="ml-1 text-neutral-500">
                ({shown.length} 표시)
              </span>
            )}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 group-open:opacity-0 transition">
            부상자 보기
          </span>
        </div>
      </summary>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm border-t border-neutral-100 dark:border-neutral-800">
        {shown.map((p) => (
          <li
            key={p.playerId}
            className="flex items-center justify-between gap-3 px-4 py-2"
            title={p.reasonRaw}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span
                className="inline-flex items-center justify-center w-5 h-5 text-[11px] shrink-0"
                title={SEVERITY_META[p.severity].label}
              >
                {SEVERITY_META[p.severity].icon}
              </span>
              <span className="font-medium truncate">{p.playerName}</span>
            </div>
            <span className="text-xs text-neutral-500 shrink-0">
              {p.reasonKo}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function SevBadge({ sev, count }: { sev: Severity; count: number }) {
  const m = SEVERITY_META[sev];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold ${m.bgClass}`}
      title={m.label}
    >
      <span>{m.icon}</span>
      <span className="tabular-nums">{count}</span>
    </span>
  );
}
