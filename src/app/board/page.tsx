// scoreboard.kr — 오늘의 경기 일정 (행-테이블, D 시안 테마).
// scorebase 백엔드 공유, 디자인 독립. 시간순 일정 + 종목탭 + 날짜네비(?date=) + 즐겨찾기.

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
import FavoriteStar from "@/components/scores/FavoriteStar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "오늘의 경기 일정 · 스코어보드 라이브 스코어",
  description:
    "축구 · 야구 · 농구 · 하키 · e스포츠 오늘 경기 일정과 실시간 라이브 스코어를 한눈에. 전력분석 · 기록까지.",
};

const SPORT_TABS: Array<{ code: SportCode; label: string }> = [
  { code: "all", label: "전체" },
  { code: "soccer", label: "축구" },
  { code: "baseball", label: "야구" },
  { code: "basketball", label: "농구" },
  { code: "hockey", label: "하키" },
  { code: "esports", label: "e스포츠" },
];

const SPORT_ICON: Record<string, string> = {
  soccer: "⚽",
  baseball: "⚾",
  basketball: "🏀",
  hockey: "🏒",
  esports: "🎮",
};

// league -> sport 역맵 (행 종목 아이콘용)
const LEAGUE_SPORT: Record<string, SportCode> = {};
for (const code of ["soccer", "baseball", "basketball", "hockey", "esports"] as SportCode[]) {
  for (const lg of leaguesForSport(code)) LEAGUE_SPORT[lg] = code;
}

const pad = (n: number) => String(n).padStart(2, "0");

// date 파라미터(YYYY-MM-DD, KST) → 그날 0시~24시 UTC window
function dayWindowKst(dateStr?: string) {
  const KST = 9 * 3600 * 1000;
  let y: number, mo: number, d: number;
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [yy, mm, dd] = dateStr.split("-").map(Number);
    y = yy;
    mo = mm - 1;
    d = dd;
  } else {
    const nowKst = new Date(Date.now() + KST);
    y = nowKst.getUTCFullYear();
    mo = nowKst.getUTCMonth();
    d = nowKst.getUTCDate();
  }
  const start = new Date(Date.UTC(y, mo, d) - KST);
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000), y, mo, d };
}

function shiftDate(y: number, mo: number, d: number, delta: number) {
  const dt = new Date(Date.UTC(y, mo, d) + delta * 24 * 3600 * 1000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function kstHHmm(d: Date) {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}

function abbr(name: string, short?: string | null) {
  if (short && short.length <= 4) return short;
  return name.replace(/\s/g, "").slice(0, 3);
}

function Logo({
  url,
  name,
  short,
}: {
  url?: string | null;
  name: string;
  short?: string | null;
}) {
  if (url) {
    // 외부 로고가 다양한 도메인 — next/image remotePatterns 제약 없이 일반 img 사용.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="bd-logo-img" loading="lazy" />;
  }
  return <span className="bd-logo-ph">{abbr(name, short)}</span>;
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const sport = (SPORT_TABS.some((s) => s.code === sp.sport)
    ? sp.sport
    : "all") as SportCode;
  const { start, end, y, mo, d } = dayWindowKst(sp.date);
  const leagues = leaguesForSport(sport);

  const matches = await prisma.match
    .findMany({
      where: { league: { in: leagues }, startTime: { gte: start, lt: end } },
      select: {
        id: true,
        league: true,
        status: true,
        startTime: true,
        homeScore: true,
        awayScore: true,
        predWinner: true,
        homeTeam: { select: { name: true, shortName: true, logoUrl: true } },
        awayTeam: { select: { name: true, shortName: true, logoUrl: true } },
      },
      orderBy: { startTime: "asc" },
      take: 400,
    })
    .catch(() => []);

  // LIVE 경기를 맨 위로 (그 안에서 시간순), 나머지는 시간순
  const sorted = [...matches].sort((a, b) => {
    const la = a.status === "LIVE" ? 0 : 1;
    const lb = b.status === "LIVE" ? 0 : 1;
    return la - lb || a.startTime.getTime() - b.startTime.getTime();
  });

  const liveCount = matches.filter((m) => m.status === "LIVE").length;
  const dateLabel = `${y}-${pad(mo + 1)}-${pad(d)}`;
  const prevDate = shiftDate(y, mo, d, -1);
  const nextDate = shiftDate(y, mo, d, 1);
  const today = dayWindowKst();
  const isToday = today.y === y && today.mo === mo && today.d === d;
  const dateQS = sp.date ? `&date=${sp.date}` : "";

  return (
    <div className="bd-root">
      <div className="bd-wrap">
        {/* 헤더 1단: 제목 + 종목탭 */}
        <div className="bd-bar1">
          <h1 className="bd-h1">
            {isToday ? "오늘의 경기 일정" : `${dateLabel} 경기 일정`}
            {liveCount > 0 && (
              <span className="bd-liven">
                <span className="d" />
                LIVE {liveCount}
              </span>
            )}
          </h1>
          <nav className="bd-tabs">
            {SPORT_TABS.map((s) => (
              <Link
                key={s.code}
                href={`/board?sport=${s.code}${dateQS}`}
                className={`bd-tab${s.code === sport ? " on" : ""}`}
              >
                {s.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* 헤더 2단: 서브타이틀 + 날짜네비 */}
        <div className="bd-bar2">
          <div className="bd-sub">
            <div className="bd-sub-t">주요 경기 일정</div>
            <div className="bd-sub-d">
              오늘 축구 · 프로야구 · 농구 · 하키 경기 일정과 실시간 라이브 스코어,
              전력분석 · 기록을 한눈에 확인하세요
            </div>
          </div>
          <div className="bd-datenav">
            <Link
              href={`/board?sport=${sport}&date=${prevDate}`}
              className="bd-dnav"
            >
              ‹ 어제
            </Link>
            <span className="bd-dnow">{dateLabel}</span>
            <Link
              href={`/board?sport=${sport}&date=${nextDate}`}
              className="bd-dnav"
            >
              내일 ›
            </Link>
          </div>
        </div>

        {/* 리스트 */}
        {matches.length === 0 ? (
          <div className="bd-empty">
            예정된 경기가 없습니다.
            <div className="e2">다른 종목이나 날짜를 선택해 보세요.</div>
          </div>
        ) : (
          <div className="bd-list">
            {sorted.map((m, i) => {
              const sportCode = LEAGUE_SPORT[m.league] ?? "soccer";
              const homeKo = toKoreanTeamName(m.homeTeam.name, m.league);
              const awayKo = toKoreanTeamName(m.awayTeam.name, m.league);
              const tl = kstHHmm(m.startTime);
              // 시간 그룹: LIVE 섹션과 비LIVE 섹션은 같은 시각이어도 분리
              const gk = (mm: typeof m) =>
                (mm.status === "LIVE" ? "L:" : "") + kstHHmm(mm.startTime);
              const showTime = i === 0 || gk(m) !== gk(sorted[i - 1]);
              const isLive = m.status === "LIVE";
              const isFin = m.status === "FINISHED";
              const isPost = m.status === "POSTPONED";
              const hasScore = m.homeScore != null && m.awayScore != null;
              const decided = (isFin || isLive) && hasScore;
              const hw = decided && (m.homeScore ?? 0) > (m.awayScore ?? 0);
              const aw = decided && (m.awayScore ?? 0) > (m.homeScore ?? 0);
              const hasPred = m.predWinner != null;
              return (
                <div
                  key={m.id}
                  className={`bd-row${isLive ? " live" : ""}${showTime ? " gf" : ""}`}
                >
                  <div className="bd-time">{showTime ? tl : ""}</div>
                  <div className="bd-lgc">
                    <span className="ic" aria-hidden>
                      {SPORT_ICON[sportCode] ?? "⚽"}
                    </span>
                    <span className="nm">{LEAGUE_DISPLAY[m.league] ?? m.league}</span>
                  </div>
                  <div className={`bd-home${hw ? " win" : ""}`}>
                    <span className="tn">{homeKo}</span>
                    <Logo
                      url={m.homeTeam.logoUrl}
                      name={homeKo}
                      short={m.homeTeam.shortName}
                    />
                  </div>
                  <div className={`bd-sc${hw ? " win" : ""}`}>
                    {hasScore ? m.homeScore : ""}
                  </div>
                  <div className="bd-st">
                    {isLive ? (
                      <span className="b live">
                        <span className="dt" />
                        LIVE
                      </span>
                    ) : isFin ? (
                      <span className="b fin">종료</span>
                    ) : isPost ? (
                      <span className="b post">연기</span>
                    ) : (
                      <span className="b sch">VS</span>
                    )}
                  </div>
                  <div className={`bd-sc${aw ? " win" : ""}`}>
                    {hasScore ? m.awayScore : ""}
                  </div>
                  <div className={`bd-away${aw ? " win" : ""}`}>
                    <Logo
                      url={m.awayTeam.logoUrl}
                      name={awayKo}
                      short={m.awayTeam.shortName}
                    />
                    <span className="tn">{awayKo}</span>
                  </div>
                  <div className="bd-acts">
                    <FavoriteStar matchId={String(m.id)} className="bd-fav" />
                    <Link
                      href={`/leagues/${m.league}`}
                      className="bd-act"
                      prefetch={false}
                    >
                      기록
                    </Link>
                    {hasPred ? (
                      <Link
                        href={`/predictions/${m.league}`}
                        className="bd-act on"
                        prefetch={false}
                      >
                        전력
                      </Link>
                    ) : (
                      <span className="bd-act off">전력</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
