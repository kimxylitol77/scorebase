import Link from "next/link";
import LeagueBadge from "./LeagueBadge";
import TeamBadge from "./TeamBadge";
import { formatRelativeKo } from "@/lib/format";
import { toKoreanTeamName } from "@/lib/team-names";
import { fifaFlag, isNationalTeamLeague } from "@/lib/sports/fifa-rankings";

interface Props {
  article: {
    slug: string;
    title: string;
    league: string;
    type: string;
    publishedAt: Date | null;
    createdAt: Date;
    /** PREVIEW 글에 야구 매치 한정 — 선발 투수 확정 여부 배지용 */
    match?: {
      startersUpdatedAt: Date | null;
      homeStarter: string | null;
      awayStarter: string | null;
      startTime: Date;
      /** 매치업 줄(로고+팀명)용 — select 에 없으면 줄 자체를 안 그린다 */
      homeTeam?: { name: string; logoUrl: string | null } | null;
      awayTeam?: { name: string; logoUrl: string | null } | null;
      /** 예정/종료 구분(킥오프 칩+최종 스코어)용 — optional, 없으면 칩 생략 */
      status?: string;
      homeScore?: number | null;
      awayScore?: number | null;
    } | null;
  };
  /** "compact" 면 더 좁은 그리드용으로 패딩/타이포 작게 */
  variant?: "default" | "compact";
}

function buildStarterBadge(
  league: string,
  type: string,
  publishedAt: Date | null,
  match: NonNullable<Props["article"]["match"]> | null | undefined,
): { label: string; cls: string; icon: string } | null {
  if (type !== "PREVIEW") return null;
  if (league !== "KBO" && league !== "NPB" && league !== "MLB") return null;
  if (!match) return null;
  // 매치 시작 후 24h 지나면 배지 의미 없음 — 표시 X
  const now = Date.now();
  if (match.startTime.getTime() < now - 24 * 3600 * 1000) return null;

  const hasStarters = !!(match.homeStarter || match.awayStarter);
  if (!hasStarters) {
    return {
      label: "선발 미확정",
      icon: "⏳",
      cls: "bg-neutral-100 text-neutral-600 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-700",
    };
  }
  // 발행 시점 이후 starters 갱신됐는지
  const pub = publishedAt?.getTime() ?? 0;
  const upd = match.startersUpdatedAt?.getTime() ?? 0;
  const updatedAfterPublish = upd > pub + 60 * 1000; // 1분 이상 차이
  return updatedAfterPublish
    ? {
        label: "선발 업데이트",
        icon: "🔄",
        cls: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20",
      }
    : {
        label: "선발 확정",
        icon: "⚾",
        cls: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20",
      };
}

// 매치 상태 칩 — 프리뷰 목록의 99%가 이미 끝난 경기라(2026-07-17 기준 1831중 1814)
// 예정/종료 구분이 없으면 "예정된 매치의 사전 분석"이라는 소개와 화면이 어긋난다.
// 예정=킥오프 시각(KST 고정 — 서버 TZ 무관), LIVE/종료/연기=상태 라벨.
function buildStatusChip(
  type: string,
  match: NonNullable<Props["article"]["match"]> | null | undefined,
): { label: string; cls: string } | null {
  if (type !== "PREVIEW") return null; // RECAP 은 본질이 종료 후 글 — 칩 불필요
  if (!match?.status) return null; // status 를 select 안 한 호출부는 생략
  if (match.status === "LIVE")
    return {
      label: "LIVE",
      cls: "bg-rose-50 text-rose-600 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20",
    };
  if (match.status === "POSTPONED")
    return {
      label: "연기",
      cls: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20",
    };
  if (match.status === "FINISHED")
    return {
      label: "종료",
      cls: "bg-zinc-100 text-zinc-500 ring-zinc-200 dark:bg-white/[0.06] dark:text-white/45 dark:ring-white/10",
    };
  // SCHEDULED — 킥오프 시각. KST = UTC+9 고정 계산 (toLocale 은 서버 TZ 따라 흔들림)
  const kst = new Date(match.startTime.getTime() + 9 * 3600 * 1000);
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const dayDiff =
    Math.floor(kst.getTime() / 86400000) -
    Math.floor(nowKst.getTime() / 86400000);
  const hm = `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
  const day =
    dayDiff === 0
      ? "오늘"
      : dayDiff === 1
        ? "내일"
        : `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`;
  return {
    label: `${day} ${hm}`,
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20",
  };
}

const BADGE_CLS =
  "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-white/[0.06] dark:text-white/70 dark:ring-white/10";

const TYPE_BADGE: Record<
  string,
  { label: string; cls: string; icon?: string }
> = {
  PREVIEW: { label: "프리뷰", cls: BADGE_CLS },
  RECAP: { label: "리뷰", cls: BADGE_CLS },
  ANALYSIS: { label: "분석", icon: "📊", cls: BADGE_CLS },
};

export default function ArticleCard({ article, variant = "default" }: Props) {
  const date = article.publishedAt ?? article.createdAt;
  const isCompact = variant === "compact";
  const typeBadge = TYPE_BADGE[article.type];
  const starterBadge = buildStarterBadge(
    article.league,
    article.type,
    article.publishedAt,
    article.match,
  );

  const statusChip = buildStatusChip(article.type, article.match);

  // 매치업 줄 — 제목이 서술형("포항의 공격력이 제주의 수비를 압도할 매치")이라
  // 어떤 경기인지 한눈에 안 들어와서 로고+팀명을 제목 위에 따로 놓는다.
  // homeTeam/awayTeam 을 select 안 한 호출부에선 undefined → 줄 자체를 생략.
  const home = article.match?.homeTeam;
  const away = article.match?.awayTeam;
  const showFlag = isNationalTeamLeague(article.league); // 국가대항은 국기, 클럽은 로고
  // 종료 경기는 vs 대신 최종 스코어 — 카드에서 바로 결과 확인
  const finalScore =
    article.match?.status === "FINISHED" &&
    article.match.homeScore != null &&
    article.match.awayScore != null
      ? `${article.match.homeScore}:${article.match.awayScore}`
      : null;
  const matchup =
    home && away
      ? {
          home,
          away,
          homeKo: toKoreanTeamName(home.name, article.league),
          awayKo: toKoreanTeamName(away.name, article.league),
        }
      : null;

  return (
    <Link
      href={`/articles/${article.slug}`}
      className="group flex flex-col h-full rounded-[1.5rem] bg-white p-5 ring-1 ring-black/5 shadow-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]"
    >
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <LeagueBadge league={article.league} />
        {typeBadge && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold ring-1 ring-inset text-[10px] ${typeBadge.cls}`}
          >
            {typeBadge.icon && <span className="text-[11px]">{typeBadge.icon}</span>}
            {typeBadge.label}
          </span>
        )}
        {starterBadge && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold ring-1 ring-inset text-[10px] ${starterBadge.cls}`}
          >
            <span className="text-[11px]">{starterBadge.icon}</span>
            {starterBadge.label}
          </span>
        )}
        {statusChip && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold ring-1 ring-inset text-[10px] tabular-nums ${statusChip.cls}`}
          >
            {statusChip.label}
          </span>
        )}
        <span className="text-neutral-500">{formatRelativeKo(date)}</span>
      </div>

      {matchup && (
        <div className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-white/80">
          <TeamBadge
            logoUrl={showFlag ? null : matchup.home.logoUrl}
            size={18}
            className="bg-white rounded-sm"
          />
          {showFlag && (
            <span className="shrink-0">
              {fifaFlag(matchup.home.name, matchup.homeKo)}
            </span>
          )}
          <span className="truncate">{matchup.homeKo}</span>
          {finalScore ? (
            <span className="shrink-0 text-sm font-bold tabular-nums">
              {finalScore}
            </span>
          ) : (
            <span className="shrink-0 text-xs font-normal text-neutral-400">vs</span>
          )}
          <TeamBadge
            logoUrl={showFlag ? null : matchup.away.logoUrl}
            size={18}
            className="bg-white rounded-sm"
          />
          {showFlag && (
            <span className="shrink-0">
              {fifaFlag(matchup.away.name, matchup.awayKo)}
            </span>
          )}
          <span className="truncate">{matchup.awayKo}</span>
        </div>
      )}

      <h3
        className={`${matchup ? "mt-2" : "mt-3"} font-bold leading-snug tracking-tight group-hover:underline underline-offset-4 decoration-2 line-clamp-3 ${
          isCompact ? "text-base" : "text-lg"
        }`}
      >
        {article.title}
      </h3>

      <div className="mt-auto pt-4 text-xs font-medium text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition flex items-center gap-1">
        읽어보기
        <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}
