// scoreboard.kr — 라이브 스코어 전용 화면 (D · 프리미엄 시안).
// scorebase 와 데이터 공유(오늘 경기 DB), 디자인/레이아웃은 완전 독립.
// Phase 1: 서버 렌더 + 종목 탭(링크). 폴링/날짜네비/미니상세는 후속.

import "./board.css";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import {
  leaguesForSport,
  LEAGUE_DISPLAY,
  type SportCode,
} from "@/lib/sports/sport-leagues";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "스코어보드 · 실시간 라이브 스코어",
  description: "축구 · 야구 · 농구 · 하키 · e스포츠 실시간 라이브 스코어.",
};

const SPORT_TABS: Array<{ code: SportCode; label: string }> = [
  { code: "soccer", label: "⚽ 축구" },
  { code: "baseball", label: "⚾ 야구" },
  { code: "basketball", label: "🏀 농구" },
  { code: "hockey", label: "🏒 하키" },
  { code: "esports", label: "🎮 e스포츠" },
];

function kstTodayWindow() {
  const KST = 9 * 3600 * 1000;
  const nowKst = new Date(Date.now() + KST);
  const start = new Date(
    Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate()) - KST,
  );
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}
function kstHHmm(d: Date) {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}
function abbr(short: string | null, ko: string) {
  if (short && short.length <= 4) return short;
  return ko.replace(/\s/g, "").slice(0, 3);
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>;
}) {
  const sp = await searchParams;
  const sport = (SPORT_TABS.some((s) => s.code === sp.sport)
    ? sp.sport
    : "soccer") as SportCode;
  const { start, end } = kstTodayWindow();
  const leagues = leaguesForSport(sport);

  const matches = await prisma.match
    .findMany({
      where: { league: { in: leagues }, startTime: { gte: start, lt: end } },
      include: {
        homeTeam: { select: { name: true, shortName: true } },
        awayTeam: { select: { name: true, shortName: true } },
      },
      orderBy: { startTime: "asc" },
      take: 300,
    })
    .catch(() => []);

  // 리그별 그룹
  const byLeague = new Map<string, typeof matches>();
  for (const m of matches) {
    const arr = byLeague.get(m.league) ?? [];
    arr.push(m);
    byLeague.set(m.league, arr);
  }
  // 리그 정렬: LIVE 있는 리그 먼저, 그 다음 가장 이른 경기순
  const groups = [...byLeague.entries()]
    .map(([lg, ms]) => ({
      lg,
      ms,
      hasLive: ms.some((m) => m.status === "LIVE"),
      earliest: Math.min(...ms.map((m) => m.startTime.getTime())),
    }))
    .sort(
      (a, b) =>
        Number(b.hasLive) - Number(a.hasLive) || a.earliest - b.earliest,
    );

  const liveCount = matches.filter((m) => m.status === "LIVE").length;

  return (
    <div className="bd-root">
      <div className="bd-wrap">
        {/* 상단 바 */}
        <div className="bd-top">
          <div className="bd-brand">
            <div className="bd-logo">
              <span className="ic" />
              <span className="nm">스코어보드</span>
            </div>
            {liveCount > 0 && (
              <div className="bd-liven">
                <span className="d" />
                LIVE {liveCount}
              </div>
            )}
          </div>
          <div className="bd-sports">
            {SPORT_TABS.map((s) => (
              <Link
                key={s.code}
                href={`/board?sport=${s.code}`}
                className={`bd-sport${s.code === sport ? " on" : ""}`}
              >
                {s.label}
              </Link>
            ))}
          </div>
          <div className="bd-datebar">
            <div className="bd-dates">
              <span className="bd-dt">어제</span>
              <span className="bd-dt on">오늘</span>
              <span className="bd-dt">내일</span>
            </div>
          </div>
        </div>

        {/* 경기 */}
        {groups.length === 0 ? (
          <div className="bd-empty">
            오늘 예정된 경기가 없습니다.
            <div className="e2">다른 종목을 선택해 보세요.</div>
          </div>
        ) : (
          groups.map(({ lg, ms }) => (
            <div key={lg}>
              <div className="bd-lg">
                <span className="nm">{LEAGUE_DISPLAY[lg] ?? lg}</span>
                <span className="ct">{ms.length}경기</span>
              </div>
              {ms.map((m) => {
                const homeKo = toKoreanTeamName(m.homeTeam.name, m.league);
                const awayKo = toKoreanTeamName(m.awayTeam.name, m.league);
                const isLive = m.status === "LIVE";
                const isFin = m.status === "FINISHED";
                const hasScore = m.homeScore != null && m.awayScore != null;
                const hw = isFin && (m.homeScore ?? 0) > (m.awayScore ?? 0);
                const aw = isFin && (m.awayScore ?? 0) > (m.homeScore ?? 0);
                return (
                  <div key={m.id} className={`bd-m${isLive ? " live" : ""}`}>
                    <div className={`bd-side${hw || (isLive && (m.homeScore ?? 0) > (m.awayScore ?? 0)) ? " win" : ""}`}>
                      <span className="bd-lo">{abbr(m.homeTeam.shortName, homeKo)}</span>
                      <span className="bd-tn">{homeKo}</span>
                    </div>
                    <div className="bd-mid">
                      {hasScore && (isLive || isFin) ? (
                        <div className="bd-score">
                          {m.homeScore}
                          <span className="x">:</span>
                          {m.awayScore}
                        </div>
                      ) : (
                        <div className="bd-vs">VS</div>
                      )}
                      <div
                        className={`bd-stat${isLive ? "" : isFin ? " ft" : " up"}`}
                      >
                        {isLive
                          ? "LIVE"
                          : isFin
                            ? "종료"
                            : m.status === "POSTPONED"
                              ? "연기"
                              : kstHHmm(m.startTime)}
                      </div>
                    </div>
                    <div className={`bd-side away${aw || (isLive && (m.awayScore ?? 0) > (m.homeScore ?? 0)) ? " win" : ""}`}>
                      <span className="bd-lo">{abbr(m.awayTeam.shortName, awayKo)}</span>
                      <span className="bd-tn">{awayKo}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
