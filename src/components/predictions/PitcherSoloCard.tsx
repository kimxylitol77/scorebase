// 선발 투수 1명짜리 개인 카드 — 사진 + 팀·승패 + ERA·WHIP·K/9·최근 3등판 타일.
// 데이터는 매치업 카드와 같은 Match.homeStarter/awayStarter JSON 이라 별도 수집이 필요 없다.
import Link from "next/link";
import { toKoreanTeamName } from "@/lib/team-names";
import PitcherAvatar from "@/components/predictions/PitcherAvatar";
import ShareCardButton from "@/components/ShareCardButton";
import { parseStarter, pitcherPhoto, fmtStat, hasStats, type StarterJson } from "@/lib/predict/starter-card";
import { PenSquare } from "lucide-react";

export type StarterSide = "home" | "away";

export interface PitcherMatch {
  id: number;
  league: string;
  startTime: Date;
  homeStarter: unknown;
  awayStarter: unknown;
  homeTeam: { name: string };
  awayTeam: { name: string };
}

/** 카드에 쓸 투수·팀·상대팀 — 선발 미정이면 null (페이지에서 404 처리). */
export function pitcherOf(m: PitcherMatch, side: StarterSide): {
  s: StarterJson;
  team: string;
  opponent: string;
} | null {
  const s = parseStarter(side === "home" ? m.homeStarter : m.awayStarter);
  if (!s?.name) return null;
  const home = toKoreanTeamName(m.homeTeam.name, m.league) || m.homeTeam.name;
  const away = toKoreanTeamName(m.awayTeam.name, m.league) || m.awayTeam.name;
  return { s, team: side === "home" ? home : away, opponent: side === "home" ? away : home };
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-3 py-2.5 text-center dark:bg-white/[0.04]">
      <div className="text-[10px] font-semibold tracking-wide text-neutral-400">{label}</div>
      <div className="mt-0.5 text-xl font-black tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-neutral-400">{hint}</div>}
    </div>
  );
}

export default function PitcherSoloCard({
  m,
  side,
  s,
  team,
  opponent,
}: {
  m: PitcherMatch;
  side: StarterSide;
  s: StarterJson;
  team: string;
  opponent: string;
}) {
  const k = new Date(m.startTime.getTime() + 9 * 3600_000);
  const when = `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
  const shareUrl = `/predictions/starters/${m.id}/${side}`;
  const shareTitle = `${s.name} — ${m.league} 선발 카드`;

  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="flex items-center gap-4">
        <PitcherAvatar src={pitcherPhoto(m.league, s)} name={s.name ?? "?"} size={88} />
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-widest text-neutral-400">{m.league} 선발</div>
          <div className="truncate text-2xl font-bold leading-tight">{s.name}</div>
          <div className="mt-0.5 truncate text-sm text-neutral-500">
            {team}
            {s.wins != null ? ` · ${s.wins}승 ${s.losses ?? 0}패` : ""}
            {s.hand ? ` · ${s.hand}` : ""}
          </div>
          <div className="mt-1 text-xs text-neutral-400">
            {when} vs {opponent}
          </div>
        </div>
      </div>

      {hasStats(s) ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="ERA" value={fmtStat(s.era)} hint={s.ip ? `${s.ip}이닝` : undefined} />
          <Tile label="WHIP" value={fmtStat(s.whip)} />
          <Tile label="K/9" value={fmtStat(s.k9, 1)} />
          <Tile
            label="최근 3등판"
            value={fmtStat(s.recentEra)}
            hint={s.recentIp != null ? `평균 ${fmtStat(s.recentIp, 1)}이닝` : undefined}
          />
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-neutral-300 px-4 py-5 text-center dark:border-neutral-700">
          <div className="text-sm font-semibold text-neutral-500">시즌 기록 미집계</div>
          <div className="mt-1 text-xs text-neutral-400">리그 공식 기록이 들어오면 자동으로 채워집니다.</div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3 dark:border-white/10">
        <ShareCardButton
          url={shareUrl}
          title={shareTitle}
          text={
            hasStats(s)
              ? `${s.name} (${team}) — ERA ${fmtStat(s.era)} · WHIP ${fmtStat(s.whip)} · K/9 ${fmtStat(s.k9, 1)}`
              : `${s.name} (${team}) — ${m.league} 선발 카드`
          }
          cardImageUrl={`/api/og/pitcher-card?m=${m.id}&s=${side}`}
        />
        <Link
          href={`/community/new?starter=${m.id}&side=${side}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 ring-1 ring-emerald-500/20 transition-all duration-300 hover:-translate-y-0.5 dark:text-emerald-400"
        >
          <PenSquare className="h-3.5 w-3.5" aria-hidden />
          게시판에 올리기
        </Link>
      </div>
    </div>
  );
}
