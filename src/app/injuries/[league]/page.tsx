import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import LeagueBadge from "@/components/LeagueBadge";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import {
  fetchSeasonInjuries,
  getApiFootballSeason,
  getTeamInjuries,
  API_FOOTBALL_LEAGUE_ID,
} from "@/lib/sports/api-football-pro";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// UCL 부상자는 소속 리그(EPL/라리가/...) 페이지에 중복이라 제외 — 5대 리그 + MLS 만
const VALID = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS"] as const;
type Lg = (typeof VALID)[number];

const LEAGUE_LABEL: Record<Lg, string> = {
  EPL: "프리미어리그",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
  MLS: "MLS",
};

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
  Fracture: "골절",
  "Cardiac problems": "심장 문제",
  Toe: "발가락",
  Knock: "타박상",
  "Yellow Cards": "경고 누적",
  "Red Card": "퇴장 누적",
  Injury: "부상",
  Strain: "근육 파열",
  Sprain: "염좌",
  Cramp: "쥐",
  Surgery: "수술",
  Rehab: "재활",
  Personal: "개인 사정",
  "Coach Decision": "감독 결정",
  Doubtful: "출전 불투명",
  Rest: "휴식",
};

function translateReason(en: string): string {
  if (!en) return "사유 미공개";
  for (const [k, v] of Object.entries(REASON_KO)) {
    if (en.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return en;
}

interface Props {
  params: Promise<{ league: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league } = await params;
  const upper = league.toUpperCase() as Lg;
  if (!VALID.includes(upper)) return { title: "부상자 명단" };
  const label = LEAGUE_LABEL[upper];
  return {
    title: `${label} 부상자 명단 — 팀별 시즌 누적`,
    description: `${label} 전 팀의 현재 부상·결장 선수를 한 페이지에서. 팀별 부상자 명단·사유·복귀 가늠.`,
    keywords: [
      `${label} 부상자`,
      `${label} 부상자 명단`,
      `${upper} 부상자`,
      "축구 부상자",
      "EPL 부상자",
      "라리가 부상자",
      "스포츠 부상자",
    ],
  };
}

export default async function InjuriesByLeague({ params }: Props) {
  const { league } = await params;
  const upper = league.toUpperCase() as Lg;
  if (!VALID.includes(upper)) notFound();

  const teams = await prisma.team.findMany({
    where: { league: upper },
    orderBy: { name: "asc" },
  });

  let allInjuries: Awaited<ReturnType<typeof fetchSeasonInjuries>> = [];
  const hasKey = !!process.env.API_FOOTBALL_KEY;
  if (hasKey && API_FOOTBALL_LEAGUE_ID[upper]) {
    try {
      const season = getApiFootballSeason(new Date(), upper);
      allInjuries = await fetchSeasonInjuries(upper, season);
    } catch {}
  }

  // 팀별 부상자 그룹화
  const byTeam = teams.map((t) => {
    const list = getTeamInjuries(allInjuries, t.name, undefined, 20);
    return { team: t, injuries: list };
  });

  // 부상자 많은 팀이 위로 (부상자 없는 팀은 끝부분)
  byTeam.sort((a, b) => {
    if (a.injuries.length > 0 && b.injuries.length === 0) return -1;
    if (a.injuries.length === 0 && b.injuries.length > 0) return 1;
    return b.injuries.length - a.injuries.length;
  });

  const totalInjuries = byTeam.reduce((s, x) => s + x.injuries.length, 0);

  // ===== 요약 통계 (SEO + 가독성) =====
  const top = byTeam[0];
  const topInjuredTeam =
    top && top.injuries.length > 0
      ? { name: toKoreanTeamName(top.team.name), count: top.injuries.length }
      : null;
  const fullSquadTeams = byTeam
    .filter((x) => x.injuries.length === 0)
    .slice(0, 3)
    .map((x) => toKoreanTeamName(x.team.name));

  // 부상 부위별 집계 (한글 사유 기준)
  const bodyPartCount = new Map<string, number>();
  for (const { injuries } of byTeam) {
    for (const i of injuries) {
      const ko = translateReason(i.reason);
      bodyPartCount.set(ko, (bodyPartCount.get(ko) ?? 0) + 1);
    }
  }
  const sortedParts = Array.from(bodyPartCount.entries()).sort(
    (a, b) => b[1] - a[1],
  );
  const topBodyPart = sortedParts[0]
    ? {
        name: sortedParts[0][0],
        count: sortedParts[0][1],
        pct:
          totalInjuries > 0
            ? Math.round((sortedParts[0][1] / totalInjuries) * 100)
            : 0,
      }
    : null;
  const nextParts = sortedParts.slice(1, 3).map((p) => p[0]);

  // 핵심 결장자 = 부상자 많은 상위 팀들의 대표 결장자 한 명씩 (한글 이름 매핑된 선수 우선)
  const keyMissingPlayers: string[] = [];
  for (const { injuries } of byTeam.slice(0, 6)) {
    if (keyMissingPlayers.length >= 3) break;
    const ko = injuries
      .map((i) => toKoreanPlayerName(i.playerName))
      .find((n) => /[가-힣]/.test(n));
    if (ko) keyMissingPlayers.push(ko);
  }

  const lastUpdatedKst = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const avgPerTeam = byTeam.length > 0 ? totalInjuries / byTeam.length : 0;

  return (
    <div>
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
            Injuries · api-football Pro
          </div>
          <div className="flex items-center gap-3 mb-2">
            <LeagueBadge league={upper} size="md" />
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
              {LEAGUE_LABEL[upper]} 부상자 명단
            </h1>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            팀별 시즌 누적 부상·결장 선수. 사유는 영문 의학용어를 한글로 자동 번역.
            {totalInjuries > 0 && (
              <span className="ml-2 text-neutral-500">
                · 현재 총 <strong>{totalInjuries}명</strong> 결장
              </span>
            )}
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
              {LEAGUE_LABEL[l]}
            </Link>
          );
        })}
      </div>

      {/* 요약 텍스트 — SEO + 한 문단 개요 */}
      {totalInjuries > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-2">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 p-5 space-y-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                {LEAGUE_LABEL[upper]} 부상자 명단 · 2025-26 시즌
              </h2>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                🕒 마지막 업데이트: {lastUpdatedKst} · 출처: api-football Pro
              </p>
            </div>
            <div className="space-y-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              <p>
                <strong>
                  2025-26 시즌 {LEAGUE_LABEL[upper]} 전체 부상·결장 선수는 총{" "}
                  {totalInjuries}명
                </strong>
                으로 집계됐다. {byTeam.length}개 팀 평균 {avgPerTeam.toFixed(1)}명이
                결장 중이며
                {topInjuredTeam &&
                  `, 가장 많은 결장자를 보유한 팀은 `}
                {topInjuredTeam && (
                  <strong>
                    {topInjuredTeam.name}({topInjuredTeam.count}명)
                  </strong>
                )}
                {fullSquadTeams.length > 0 && (
                  <>
                    , 반대로 풀스쿼드를 유지 중인 팀은{" "}
                    <strong>{fullSquadTeams.join(", ")}</strong>이다.
                  </>
                )}
                {fullSquadTeams.length === 0 && "."}
              </p>
              {topBodyPart && (
                <p>
                  부상 부위별로는{" "}
                  <strong>
                    {topBodyPart.name}({topBodyPart.count}건, {topBodyPart.pct}
                    %)
                  </strong>
                  이 가장 많이 발생했고
                  {nextParts.length > 0 &&
                    `, 그 다음은 ${nextParts.join("과 ")} 순이다.`}
                  {keyMissingPlayers.length > 0 && (
                    <>
                      {" "}
                      이번 라운드 경기에 영향을 받을 핵심 결장자는{" "}
                      {keyMissingPlayers.join(", ")} 등이다.
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        {!hasKey && (
          <div className="rounded-xl border border-amber-300/40 bg-amber-50 dark:bg-amber-900/20 p-4 mb-6 text-sm">
            API_FOOTBALL_KEY 가 설정되지 않아 부상자 데이터를 불러오지 못했습니다.
          </div>
        )}

        {teams.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-neutral-500 text-sm">
            팀 데이터가 아직 수집되지 않았습니다.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {byTeam.map(({ team, injuries }) => (
            <TeamInjuryCard
              key={team.id}
              teamId={team.id}
              teamName={team.name}
              logoUrl={team.logoUrl}
              injuries={injuries.map((i) => ({
                playerId: i.playerId,
                playerName: toKoreanPlayerName(i.playerName),
                reasonKo: translateReason(i.reason),
                reasonRaw: i.reason,
              }))}
            />
          ))}
        </div>

        <p className="mt-8 text-[11px] text-neutral-500 leading-relaxed">
          데이터: api-football Pro (시즌 누적 부상자) · 사유 한글 번역은 의학용어 매핑 기반.
          본 명단은 참고용으로 실제 매치 라인업과 다를 수 있습니다.
        </p>
      </div>
    </div>
  );
}

function TeamInjuryCard({
  teamId,
  teamName,
  logoUrl,
  injuries,
}: {
  teamId: number;
  teamName: string;
  logoUrl: string | null;
  injuries: Array<{
    playerId: number;
    playerName: string;
    reasonKo: string;
    reasonRaw: string;
  }>;
}) {
  return (
    <details className="injury-card group rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-900/40">
      <summary className="list-none cursor-pointer flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition select-none">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="w-7 h-7 object-contain shrink-0"
            loading="lazy"
          />
        ) : (
          <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-xs font-bold text-neutral-500">
            {teamName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <Link
            href={`/teams/${teamId}`}
            className="font-bold truncate hover:underline"
          >
            {toKoreanTeamName(teamName)}
          </Link>
          <div className="text-[11px] text-neutral-500 truncate">
            {teamName}
          </div>
        </div>
        <span
          className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-md shrink-0 ${
            injuries.length === 0
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
              : injuries.length >= 5
                ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
          }`}
        >
          {injuries.length === 0 ? "✅ 0명" : `${injuries.length}명`}
        </span>
        {injuries.length > 0 && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shrink-0 group-open:opacity-0 transition">
            부상자 보기
          </span>
        )}
        {injuries.length > 0 && (
          <span className="text-xs font-semibold text-neutral-500 shrink-0 hidden group-open:inline-flex items-center gap-1">
            닫기
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path
                d="M1 3l4 4 4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                transform="rotate(180 5 5)"
              />
            </svg>
          </span>
        )}
      </summary>
      {injuries.length > 0 && (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm border-t border-neutral-100 dark:border-neutral-800">
          {injuries.map((p) => (
            <li
              key={p.playerId}
              className="flex items-center justify-between gap-3 px-4 py-2"
              title={p.reasonRaw}
            >
              <span className="font-medium truncate">{p.playerName}</span>
              <span className="text-xs text-neutral-500 shrink-0">
                {p.reasonKo}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
