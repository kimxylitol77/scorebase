// 선발 투수 맞대결 카드 — /predictions/starters 목록과 단일 공유 페이지가 같은 카드를 렌더.
// 본문은 매치 상세로 이동하는 링크, 하단은 공유·게시판 액션 행(앵커 중첩 방지로 링크 바깥).
import Link from "next/link";
import { toKoreanTeamName } from "@/lib/team-names";
import PitcherAvatar from "@/components/predictions/PitcherAvatar";
import ShareCardButton from "@/components/ShareCardButton";
import { parseStarter, pitcherPhoto, fmtStat } from "@/lib/predict/starter-card";
import { PenSquare } from "lucide-react";

export interface StarterMatch {
  id: number;
  externalId: string | null;
  league: string;
  startTime: Date;
  status: string;
  predHome: number | null;
  predAway: number | null;
  homeScore: number | null;
  awayScore: number | null;
  homeStarter: unknown;
  awayStarter: unknown;
  homeTeam: { name: string };
  awayTeam: { name: string };
}

function kstTime(d: Date) {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

/** 지표 비교 행 — 중앙 라벨 기준 좌우로 뻗는 바. 우위 쪽 색 강조.
 *  lowerBetter(ERA·WHIP): 값이 낮을수록 바가 길고 진함 / higherBetter(K9): 반대. */
function StatRow({ label, home, away, lowerBetter }: { label: string; home?: number; away?: number; lowerBetter: boolean }) {
  const ok = (v?: number) => v != null && !Number.isNaN(v) && v >= 0;
  const both = ok(home) && ok(away);
  // 우위 강도(0~1): 상대 대비 비율 — lowerBetter 면 상대값 비중이 내 강도
  let sh = 0.5;
  if (both && home! + away! > 0) {
    sh = lowerBetter ? away! / (home! + away!) : home! / (home! + away!);
  }
  const sa = 1 - sh;
  const homeWins = both && home !== away && sh > 0.5;
  const awayWins = both && home !== away && sa > 0.5;
  const d = label === "K/9" ? 1 : 2;
  return (
    <div className="flex items-center gap-1.5 py-[3px]">
      {/* 홈 값 + 우→좌 바 */}
      <span className={`w-11 text-right text-[13px] tabular-nums shrink-0 ${homeWins ? "font-black text-emerald-600 dark:text-emerald-400" : "text-neutral-600 dark:text-neutral-300"}`}>
        {fmtStat(home, d)}
      </span>
      <div className="flex-1 flex justify-end">
        <div
          className={`h-1.5 rounded-l-full ${homeWins ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"}`}
          style={{ width: `${Math.round(sh * 100)}%` }}
        />
      </div>
      <span className="w-[72px] text-center text-[10px] text-neutral-400 shrink-0">{label}</span>
      <div className="flex-1 flex justify-start">
        <div
          className={`h-1.5 rounded-r-full ${awayWins ? "bg-sky-500" : "bg-neutral-300 dark:bg-neutral-700"}`}
          style={{ width: `${Math.round(sa * 100)}%` }}
        />
      </div>
      <span className={`w-11 text-left text-[13px] tabular-nums shrink-0 ${awayWins ? "font-black text-sky-600 dark:text-sky-400" : "text-neutral-600 dark:text-neutral-300"}`}>
        {fmtStat(away, d)}
      </span>
    </div>
  );
}

/** 카드 제목 — "류현진 vs 원태인 (KBO 선발 매치업)". 선발 미정이면 팀명으로 대체. */
export function starterCardTitle(m: StarterMatch) {
  const hs = parseStarter(m.homeStarter);
  const as = parseStarter(m.awayStarter);
  const hName = toKoreanTeamName(m.homeTeam.name, m.league) || m.homeTeam.name;
  const aName = toKoreanTeamName(m.awayTeam.name, m.league) || m.awayTeam.name;
  const left = hs?.name || hName;
  const right = as?.name || aName;
  return `${left} vs ${right} — ${m.league} 선발 매치업`;
}

export default function StarterMatchupCard({ m }: { m: StarterMatch }) {
  const lg = m.league;
  const hs = parseStarter(m.homeStarter);
  const as = parseStarter(m.awayStarter);
  const hName = toKoreanTeamName(m.homeTeam.name, lg) || m.homeTeam.name;
  const aName = toKoreanTeamName(m.awayTeam.name, lg) || m.awayTeam.name;
  const ph = m.predHome != null ? Math.round(m.predHome * 100) : null;
  const pa = m.predAway != null ? Math.round(m.predAway * 100) : null;

  const inner = (
    <>
      {/* 상태 뱃지 */}
      <div className="text-center mb-2.5">
        {m.status === "LIVE" ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/30 text-[11px] font-bold text-rose-600 dark:text-rose-400">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> LIVE
          </span>
        ) : m.status === "FINISHED" ? (
          <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-[11px] font-bold text-neutral-500">
            종료 {m.homeScore ?? 0} : {m.awayScore ?? 0}
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-[11px] font-bold text-neutral-500">
            {kstTime(m.startTime)} 예정
          </span>
        )}
      </div>
      {/* 투수 대면 헤더 — 사진 + 이름 + 승패 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex flex-col items-center w-[42%] text-center">
          <PitcherAvatar src={pitcherPhoto(lg, hs)} name={hs?.name ?? "?"} size={64} />
          <div className="mt-1.5 text-[13px] font-bold leading-tight truncate w-full">{hs?.name ?? "선발 미정"}</div>
          <div className="text-[11px] text-neutral-500 truncate w-full">
            {hName}{hs?.wins != null ? ` · ${hs.wins}승${hs.losses ?? 0}패` : ""}
          </div>
        </div>
        <div className="flex flex-col items-center pt-4 shrink-0">
          <span className="text-base font-black text-neutral-300 dark:text-neutral-600">VS</span>
        </div>
        <div className="flex flex-col items-center w-[42%] text-center">
          <PitcherAvatar src={pitcherPhoto(lg, as)} name={as?.name ?? "?"} size={64} />
          <div className="mt-1.5 text-[13px] font-bold leading-tight truncate w-full">{as?.name ?? "선발 미정"}</div>
          <div className="text-[11px] text-neutral-500 truncate w-full">
            {aName}{as?.wins != null ? ` · ${as.wins}승${as.losses ?? 0}패` : ""}
          </div>
        </div>
      </div>
      {/* AI 승률 게이지 */}
      {ph != null && pa != null && (
        <div className="mb-2.5">
          <div className="flex justify-between text-[11px] font-bold mb-0.5">
            <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">{ph}%</span>
            <span className="text-[10px] font-semibold text-neutral-400">AI 승률</span>
            <span className="text-sky-600 dark:text-sky-400 tabular-nums">{pa}%</span>
          </div>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800">
            <span className="bg-emerald-500" style={{ width: `${ph}%` }} />
            <span className="bg-sky-500" style={{ width: `${100 - ph}%` }} />
          </div>
        </div>
      )}
      {/* 지표 비교 바 */}
      {(hs || as) && (
        <div className="rounded-lg bg-neutral-50 dark:bg-white/[0.04] px-2.5 py-1.5">
          <StatRow label="ERA" home={hs?.era} away={as?.era} lowerBetter />
          <StatRow label="WHIP" home={hs?.whip} away={as?.whip} lowerBetter />
          <StatRow label="K/9" home={hs?.k9} away={as?.k9} lowerBetter={false} />
          {(hs?.recentEra != null || as?.recentEra != null) && (
            <StatRow label="최근 3등판" home={hs?.recentEra} away={as?.recentEra} lowerBetter />
          )}
        </div>
      )}
    </>
  );

  const shareTitle = starterCardTitle(m);
  const shareText = `${hName} vs ${aName}${ph != null ? ` · AI 승률 ${ph}% : ${pa}%` : ""} — Scorebase 선발 매치업`;

  return (
    <div className="group rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] p-4 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:ring-emerald-400/50 hover:shadow-[0_28px_70px_-30px_rgba(15,23,30,0.28)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06] dark:hover:ring-emerald-500/40">
      {m.externalId ? (
        <Link href={`/live/${lg}/${m.externalId}`} prefetch={false} className="block">
          {inner}
        </Link>
      ) : (
        inner
      )}
      {/* 공유 액션 — 링크 바깥(앵커 중첩 금지) */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3 dark:border-white/10">
        <ShareCardButton
          url={`/predictions/starters/${m.id}`}
          title={shareTitle}
          text={shareText}
          cardImageUrl={`/api/og/starter-card?m=${m.id}`}
        />
        <Link
          href={`/community/new?starter=${m.id}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 ring-1 ring-emerald-500/20 transition-all duration-300 hover:-translate-y-0.5 dark:text-emerald-400"
        >
          <PenSquare className="h-3.5 w-3.5" aria-hidden />
          게시판에 올리기
        </Link>
      </div>
    </div>
  );
}
