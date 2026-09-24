// UEFA 네이션스리그 허브 — 빅매치 카드(가운데) + 같은 라운드 리그 A 레일(양옆) + 리그 A~D 조별 카드.
// 순위 행은 lib/standings/af-grouped(조별 순위 단일 출처), 규칙은 lib/sports/nations-league 에서 온다.
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { prisma } from "@/lib/db";
import TeamLogoImg from "@/components/TeamLogoImg";
import { getAfGroupedRows } from "@/lib/standings/af-grouped";
import { fifaFlag, getFifaRank } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import {
  NL_MATCHDAYS,
  NL_TIERS,
  NL_TIER_RULE,
  kstKickoff,
  nlZone,
  parseNlGroup,
  parseNlRound,
  pickFeatured,
  type NlTier,
} from "@/lib/sports/nations-league";
import NationsLeagueTiers, { type NlGroupView, type NlTierView } from "./NationsLeagueTiers";

const LEAGUE = "UEFA_NL";

interface HubMatch {
  id: number;
  href: string;
  tier: NlTier;
  matchday: number;
  group: number | null;
  status: string;
  startTime: Date;
  rankSum: number | null;
  homeScore: number | null;
  awayScore: number | null;
  home: HubTeam;
  away: HubTeam;
}
interface HubTeam {
  name: string;
  flag: string;
  logoUrl: string | null;
  fifaRank: number | null;
}

function team(t: { name: string; logoUrl: string | null }): HubTeam {
  return {
    name: toKoreanTeamName(t.name, LEAGUE) || t.name,
    flag: fifaFlag(t.name),
    logoUrl: t.logoUrl,
    fifaRank: getFifaRank(t.name),
  };
}

export default async function NationsLeagueHub() {
  const [rows, rawMatches] = await Promise.all([
    getAfGroupedRows(LEAGUE),
    prisma.match.findMany({
      where: { league: LEAGUE },
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        externalId: true,
        status: true,
        startTime: true,
        homeScore: true,
        awayScore: true,
        raw: true,
        homeTeamId: true,
        awayTeamId: true,
        homeTeam: { select: { name: true, logoUrl: true } },
        awayTeam: { select: { name: true, logoUrl: true } },
      },
    }),
  ]);

  // 팀 → 조. 경기 raw 엔 조가 없어 순위표에서 역으로 붙인다(한 조의 두 팀끼리만 붙는다).
  const groupOf = new Map<number, { tier: NlTier; group: number }>();
  for (const r of rows) {
    const g = parseNlGroup(r.rawGroup);
    if (g) groupOf.set(r.teamId, g);
  }

  const matches: HubMatch[] = [];
  for (const m of rawMatches) {
    const round = parseNlRound(m.raw);
    if (!round) continue;
    const home = team(m.homeTeam);
    const away = team(m.awayTeam);
    matches.push({
      id: m.id,
      href: `/live/${LEAGUE}/${m.externalId}`,
      tier: round.tier,
      matchday: round.matchday,
      group: groupOf.get(m.homeTeamId)?.group ?? null,
      status: m.status,
      startTime: m.startTime,
      rankSum: home.fifaRank != null && away.fifaRank != null ? home.fifaRank + away.fifaRank : null,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      home,
      away,
    });
  }

  // ── 조별 카드 데이터 (클라이언트 토글로 넘김 — 네 등급 모두 HTML 에 실린다)
  const teamIds = [...new Set(rows.map((r) => r.teamId))];
  const teams = teamIds.length
    ? await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(teams.map((t) => [t.id, t.name]));

  const tiers: NlTierView[] = NL_TIERS.map((tier) => {
    const groupNos = [...new Set(rows.map((r) => parseNlGroup(r.rawGroup)).filter((g) => g?.tier === tier).map((g) => g!.group))].sort((a, b) => a - b);
    const groups: NlGroupView[] = groupNos.map((no) => {
      const gRows = rows.filter((r) => {
        const g = parseNlGroup(r.rawGroup);
        return g?.tier === tier && g.group === no;
      });
      const played = gRows.some((r) => r.won + r.draw + r.loss > 0);
      const next = matches.find((m) => m.tier === tier && m.group === no && (m.status === "SCHEDULED" || m.status === "LIVE"));
      return {
        no,
        played,
        rows: gRows.map((r) => {
          const en = nameOf.get(r.teamId) ?? "";
          return {
            teamId: r.teamId,
            position: r.position,
            name: toKoreanTeamName(en, LEAGUE) || en,
            flag: fifaFlag(en),
            played: r.won + r.draw + r.loss,
            goalDiff: r.goalDiff,
            points: r.points,
            zone: nlZone(tier, r.position, played),
          };
        }),
        next: next
          ? { href: next.href, home: next.home.name, away: next.away.name, when: kstKickoff(next.startTime), live: next.status === "LIVE" }
          : null,
      };
    });
    return { tier, teams: groups.reduce((s, g) => s + g.rows.length, 0), rule: NL_TIER_RULE[tier].label, groups };
  }).filter((t) => t.groups.length > 0);

  // ── 빅매치 + 같은 라운드 리그 A 레일
  const featured = pickFeatured(matches);
  const sameRound = featured
    ? matches.filter((m) => m.tier === "A" && m.matchday === featured.matchday && m.id !== featured.id)
    : [];
  const leftRail = sameRound.filter((m) => (m.group ?? 0) <= 2);
  const rightRail = sameRound.filter((m) => (m.group ?? 0) > 2);

  if (tiers.length === 0) {
    return (
      <div className="rounded-[1.75rem] bg-white p-8 text-center text-sm text-zinc-500 ring-1 ring-black/5 dark:bg-white/[0.04] dark:text-white/55 dark:ring-white/10">
        조 편성 데이터를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {featured && (
        <section aria-labelledby="nl-featured" className="relative">
          {/* 빅매치 뒤 스포트라이트 — 초점은 이 한 곳에만 */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[min(720px,100%)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-300/30 blur-3xl dark:bg-rose-500/[0.14]"
          />
          {/* items-start — 레일 경기 수가 조마다 달라(4·3) 가운데 정렬하면 머리글이 어긋난다.
              위로 붙여 세 머리글(레일 둘 + 빅매치)을 한 줄에 둔다. */}
          <div className="relative grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
            <FeaturedCard m={featured} />
            <Rail title="리그 A · 1·2조" items={leftRail} className="lg:order-1" />
            <Rail title="리그 A · 3·4조" items={rightRail} className="lg:order-3" />
          </div>
        </section>
      )}

      <section aria-labelledby="nl-tiers" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400">League phase</p>
            <h2 id="nl-tiers" className="mt-1 text-2xl font-black tracking-tight text-zinc-950 break-keep dark:text-white sm:text-3xl">
              리그페이즈 순위
            </h2>
          </div>
          <p className="text-sm text-zinc-500 dark:text-white/55">
            리그 A~D · {tiers.reduce((s, t) => s + t.groups.length, 0)}개 조 · {tiers.reduce((s, t) => s + t.teams, 0)}팀
          </p>
        </div>
        <NationsLeagueTiers tiers={tiers} />
      </section>
    </div>
  );
}

function statusLine(m: HubMatch): string {
  if (m.status === "LIVE") return "진행 중인 리그 A 경기";
  if (m.status === "FINISHED") return "리그페이즈 마지막 리그 A 경기";
  return "이번 라운드 리그 A 중 두 팀 FIFA 랭킹이 가장 높은 경기";
}

function FeaturedCard({ m }: { m: HubMatch }) {
  const scored = (m.status === "LIVE" || m.status === "FINISHED") && m.homeScore != null && m.awayScore != null;
  return (
    <div className="lg:order-2">
      <h2 id="nl-featured" className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400">
        빅매치 · 리그 A{m.group ? ` · ${m.group}조` : ""}
      </h2>
      <Link
        href={m.href}
        prefetch={false}
        className="group block overflow-hidden rounded-[2rem] bg-white shadow-[0_28px_70px_-34px_rgba(15,23,30,0.35)] ring-1 ring-black/5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:bg-white/[0.05] dark:shadow-none dark:ring-white/10 dark:hover:bg-white/[0.07] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-5 pb-6 pt-7 sm:px-8">
          <Side t={m.home} />
          <div className="flex flex-col items-center">
            {scored ? (
              <span className="text-4xl font-black tabular-nums tracking-tight text-zinc-950 dark:text-white sm:text-5xl">
                {m.homeScore}
                <span className="mx-1.5 text-zinc-300 dark:text-white/25">:</span>
                {m.awayScore}
              </span>
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-bold tracking-[0.12em] text-zinc-500 dark:bg-white/[0.06] dark:text-white/55">
                VS
              </span>
            )}
            {m.status === "LIVE" && (
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500 motion-reduce:animate-none" aria-hidden />
                LIVE
              </span>
            )}
          </div>
          <Side t={m.away} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-black/5 bg-zinc-50/70 px-5 py-3.5 dark:border-white/10 dark:bg-white/[0.03] sm:px-8">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-700 dark:text-white/75">
            <CalendarClock className="h-4 w-4 text-zinc-400 dark:text-white/40" aria-hidden />
            {m.status === "FINISHED" ? "종료" : kstKickoff(m.startTime)}
            <span className="font-normal text-zinc-400 dark:text-white/40">KST</span>
          </span>
          <MatchdayTrack current={m.matchday} />
        </div>
      </Link>
      <p className="mt-3 text-center text-[12px] text-zinc-500 break-keep dark:text-white/45">{statusLine(m)}</p>
    </div>
  );
}

function Side({ t }: { t: HubTeam }) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-zinc-50 ring-1 ring-black/5 dark:bg-white/[0.06] dark:ring-white/10 sm:h-20 sm:w-20">
        <TeamLogoImg
          url={t.logoUrl}
          name={t.name}
          size={48}
          className="h-11 w-11 object-contain sm:h-12 sm:w-12"
          fallbackClassName="text-xl font-black text-zinc-400"
        />
      </span>
      <span className="mt-3 w-full truncate text-2xl font-black tracking-[-0.03em] text-zinc-950 dark:text-white sm:text-4xl">{t.name}</span>
      {t.fifaRank != null && (
        <span className="mt-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-600 dark:bg-white/[0.06] dark:text-white/60">
          FIFA {t.fifaRank}위
        </span>
      )}
    </div>
  );
}

/** 리그페이즈 6라운드 중 어디인가 — 지난 라운드는 채움, 현재는 로즈, 남은 라운드는 빈 칸. */
function MatchdayTrack({ current }: { current: number }) {
  return (
    <span className="inline-flex items-center gap-2" aria-label={`리그페이즈 ${NL_MATCHDAYS}라운드 중 ${current}라운드`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-white/40">라운드</span>
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: NL_MATCHDAYS }, (_, i) => i + 1).map((n) => (
          <span
            key={n}
            className={`h-1.5 w-5 rounded-full ${
              n === current ? "bg-rose-500" : n < current ? "bg-zinc-400 dark:bg-white/40" : "bg-zinc-200 dark:bg-white/10"
            }`}
          />
        ))}
      </span>
      <span className="text-[12px] font-bold tabular-nums text-zinc-700 dark:text-white/75">
        {current}/{NL_MATCHDAYS}
      </span>
    </span>
  );
}

function Rail({ title, items, className }: { title: string; items: HubMatch[]; className?: string }) {
  if (items.length === 0) return <div className={className} aria-hidden />;
  return (
    <div className={className}>
      <h3 className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400 dark:text-white/40">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((m) => {
          const scored = (m.status === "LIVE" || m.status === "FINISHED") && m.homeScore != null && m.awayScore != null;
          return (
            <li key={m.id}>
              <Link
                href={m.href}
                prefetch={false}
                className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-2xl bg-white/80 px-3 py-2.5 ring-1 ring-black/5 transition-colors duration-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:bg-white/[0.03] dark:ring-white/[0.08] dark:hover:bg-white/[0.06]"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Flag flag={m.home.flag} />
                  <span className="truncate text-[13px] font-semibold text-zinc-800 dark:text-white/85">{m.home.name}</span>
                </span>
                <span className="text-center text-[12px] tabular-nums text-zinc-500 dark:text-white/50">
                  {scored ? (
                    <span className={`font-bold ${m.status === "LIVE" ? "text-rose-600 dark:text-rose-400" : "text-zinc-800 dark:text-white/85"}`}>
                      {m.homeScore}-{m.awayScore}
                    </span>
                  ) : (
                    // 한 라운드가 이틀에 걸친다 — 요일은 빼도 날짜는 남긴다("9/26 03:45").
                    kstKickoff(m.startTime).replace(/ \(.\)/, "")
                  )}
                </span>
                <span className="flex min-w-0 items-center justify-end gap-1.5">
                  <span className="truncate text-right text-[13px] font-semibold text-zinc-800 dark:text-white/85">{m.away.name}</span>
                  <Flag flag={m.away.flag} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Flag({ flag }: { flag: string }) {
  // 국기 이모지가 없는 팀(북아일랜드 — 영국 구성국 중 공식 이모지 없음)은 빈 자리로 정렬만 맞춘다.
  return flag ? (
    <span className="shrink-0 text-[15px] leading-none" aria-hidden>
      {flag}
    </span>
  ) : (
    <span className="h-3.5 w-[18px] shrink-0 rounded-[3px] bg-zinc-200 dark:bg-white/10" aria-hidden />
  );
}
