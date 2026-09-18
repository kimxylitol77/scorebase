// KBL 선수 상세 — 헤더(프로필) + 3탭(개요=시즌 평균·리그 순위 / 시즌별 / 경기별).
// 프로필·사진은 kbl-players.json(주간), 통계는 KBL 공식 API(kbl-api.sports2i.com) 런타임 fetch(1h 캐시).
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { KBL_TEAM_IDS } from "@/lib/sports/basketball-standings";
import {
  fetchKblPlayerCategoryAvg,
  fetchKblPlayerGames,
  fetchKblPlayerProfile,
  fetchKblPlayerSeasons,
  fetchKblRecentSeason,
  fetchKblSeasonList,
  fetchKblTeamNames,
  KBL_CATEGORY_KO,
  kblPlayerPhotoUrl,
  type KblGameRecord,
  type KblSeasonRecord,
} from "@/lib/sports/kbl-api";
import { kblPlayer, kblPosKo, kblAge } from "@/lib/sports/kbl-players";
import AmbientGlow from "@/components/AmbientGlow";
import ShareCardButton from "@/components/ShareCardButton";
import { ChevronLeft, ExternalLink } from "lucide-react";
import PlayerTabs from "./PlayerTabs";

const n1 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "—" : x.toFixed(1));
const pc = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "—" : `${x.toFixed(1)}%`);
const mmss = (sec: number | null | undefined) => {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const ymd = (d: string) => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : d);

type TeamInfo = { id: number; logo: string | null; name: string };

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${accent ? "bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30" : "bg-neutral-50 dark:bg-white/[0.04]"}`}>
      <div className="text-[10px] text-neutral-500">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-neutral-400">{sub}</div>}
    </div>
  );
}
function Th({ children, left }: { children: ReactNode; left?: boolean }) {
  return <th className={`px-2.5 py-2 font-medium whitespace-nowrap ${left ? "text-left" : "text-right"}`}>{children}</th>;
}
function Td({ children, accent, muted, left }: { children: ReactNode; accent?: boolean; muted?: boolean; left?: boolean }) {
  return (
    <td className={`px-2.5 py-2 tabular-nums whitespace-nowrap ${left ? "text-left" : "text-right"} ${accent ? "font-bold" : ""} ${muted ? "text-neutral-400" : ""}`}>
      {children}
    </td>
  );
}

function TeamCell({ code, teamMap, nameOf }: { code: string; teamMap: Map<string, TeamInfo>; nameOf: (c: string) => string }) {
  const t = teamMap.get(code);
  const inner = (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {t?.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.logo} alt="" className="w-4 h-4 object-contain shrink-0" />
      )}
      <span className="truncate">{nameOf(code)}</span>
    </span>
  );
  return t ? <Link href={`/teams/${t.id}`} className="hover:underline underline-offset-2">{inner}</Link> : inner;
}

function SeasonTable({ rows, career, labelOf, teamMap, nameOf, title }: {
  rows: KblSeasonRecord[]; career: KblSeasonRecord | null; labelOf: (code: number) => string;
  teamMap: Map<string, TeamInfo>; nameOf: (c: string) => string; title?: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-neutral-500">{title ? `${title} 기록이 없습니다.` : "시즌 기록이 없습니다."}</p>;
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
          <tr>
            <Th left>시즌</Th><Th left>팀</Th><Th>경기</Th><Th>승-패</Th><Th>출전</Th><Th>득점</Th><Th>리바운드</Th><Th>어시스트</Th><Th>스틸</Th><Th>블록</Th><Th>야투%</Th><Th>3점%</Th><Th>자유투%</Th><Th>턴오버</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
          {rows.map((r) => (
            <tr key={`${r.seasonCode}-${r.teamCode}`}>
              <Td left accent>{labelOf(Number(r.seasonCode))}</Td>
              <Td left><TeamCell code={r.teamCode} teamMap={teamMap} nameOf={nameOf} /></Td>
              <Td muted>{r.gameCount}</Td>
              <Td muted>{r.winTot}-{r.loseTot}</Td>
              <Td muted>{mmss(r.avgPlaySec)}</Td>
              <Td accent>{n1(r.avgScore)}</Td>
              <Td>{n1(r.avgRb)}</Td>
              <Td>{n1(r.avgAS)}</Td>
              <Td muted>{n1(r.avgSt)}</Td>
              <Td muted>{n1(r.avgBs)}</Td>
              <Td>{pc(r.avgFdgRt)}</Td>
              <Td>{pc(r.avgThreePRt)}</Td>
              <Td muted>{pc(r.avgFtRt)}</Td>
              <Td muted>{n1(r.avgTo)}</Td>
            </tr>
          ))}
          {career && (
            <tr className="bg-neutral-50 dark:bg-white/[0.04] font-semibold">
              <Td left accent>통산</Td>
              <Td left muted>정규리그</Td>
              <Td muted>{career.gameCount}</Td>
              <Td muted>{career.winTot}-{career.loseTot}</Td>
              <Td muted>{mmss(career.avgPlaySec)}</Td>
              <Td accent>{n1(career.avgScore)}</Td>
              <Td>{n1(career.avgRb)}</Td>
              <Td>{n1(career.avgAS)}</Td>
              <Td muted>{n1(career.avgSt)}</Td>
              <Td muted>{n1(career.avgBs)}</Td>
              <Td>{pc(career.avgFdgRt)}</Td>
              <Td>{pc(career.avgThreePRt)}</Td>
              <Td muted>{pc(career.avgFtRt)}</Td>
              <Td muted>{n1(career.avgTo)}</Td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GameTable({ rows, teamMap, nameOf }: { rows: KblGameRecord[]; teamMap: Map<string, TeamInfo>; nameOf: (c: string) => string }) {
  if (rows.length === 0) return <p className="text-sm text-neutral-500">이번 시즌 경기 기록이 아직 없습니다. 개막 후 경기마다 갱신됩니다.</p>;
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
          <tr>
            <Th left>날짜</Th><Th left>상대</Th><Th>결과</Th><Th>출전</Th><Th>득점</Th><Th>리바운드</Th><Th>어시스트</Th><Th>스틸</Th><Th>블록</Th><Th>야투</Th><Th>3점</Th><Th>자유투</Th><Th>턴오버</Th><Th>+/-</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
          {rows.map((g) => {
            const win = g.win === 1;
            return (
              <tr key={`${g.gameDate}-${g.gameNo}`}>
                <Td left muted>{ymd(g.gameDate)}</Td>
                <Td left><TeamCell code={g.awayTeam} teamMap={teamMap} nameOf={nameOf} /></Td>
                <Td>
                  <span className={`font-bold ${win ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>{win ? "승" : "패"}</span>
                  <span className="text-neutral-400 text-xs ml-1">{g.score}-{g.awayScore}</span>
                </Td>
                <Td muted>{mmss(g.playSec)}</Td>
                <Td accent>{g.pts}</Td>
                <Td>{g.rb}</Td>
                <Td>{g.aS}</Td>
                <Td muted>{g.sT}</Td>
                <Td muted>{g.bS}</Td>
                <Td muted>{g.fdg}/{g.fdgA}</Td>
                <Td muted>{g.threep}/{g.threepA}</Td>
                <Td muted>{g.ft}/{g.ftA}</Td>
                <Td muted>{g.tO}</Td>
                <Td muted>{g.margin > 0 ? `+${g.margin}` : g.margin}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export async function KblPlayerView({ pid }: { pid: string }) {
  if (!/^\d{4,8}$/.test(pid)) notFound();
  const local = kblPlayer(pid);
  const [{ info, career }, recent, seasonList] = await Promise.all([
    fetchKblPlayerProfile(pid, 0),
    fetchKblRecentSeason(),
    fetchKblSeasonList(),
  ]);
  if (!local && !info) notFound();

  const seasons = await fetchKblPlayerSeasons(pid);
  // 표시 시즌 = 최근 진행 시즌. 개막 전(그 시즌 기록 0)이면 선수의 마지막 기록 시즌으로.
  const recentCode = recent?.seasonCode ?? Number(seasons.regular[0]?.seasonCode ?? 0);
  const lastPlayedCode = Number(seasons.regular[0]?.seasonCode ?? recentCode);
  const showCode = seasons.regular.some((r) => Number(r.seasonCode) === recentCode) ? recentCode : lastPlayedCode;
  const [avg, games, teamNames, kblTeams] = await Promise.all([
    showCode ? fetchKblPlayerCategoryAvg(pid, showCode) : Promise.resolve([]),
    showCode ? fetchKblPlayerGames(pid, showCode) : Promise.resolve([]),
    fetchKblTeamNames(recentCode || showCode),
    prisma.team.findMany({ where: { league: "KBL" }, select: { id: true, name: true, logoUrl: true } }),
  ]);

  const labelOf = (code: number) => seasonList.find((s) => s.seasonCode === code)?.label ?? `시즌 ${code}`;
  const teamMap = new Map<string, TeamInfo>();
  for (const [code, id] of Object.entries(KBL_TEAM_IDS)) {
    const t = kblTeams.find((x) => x.id === id);
    if (t) teamMap.set(code, { id: t.id, logo: t.logoUrl, name: t.name });
  }
  const nameOf = (code: string) => teamNames.get(code) ?? code;

  const name = local?.name ?? info?.kName ?? "";
  const ename = local?.ename ?? info?.eName ?? "";
  const teamCode = info?.teamCode ?? local?.teamCode ?? "";
  const teamKo = teamNames.get(teamCode) ?? "";
  const teamInfo = teamMap.get(teamCode);
  const pos = kblPosKo(info?.pos ?? local?.pos);
  const no = info?.backNum?.trim() || (local?.no != null ? String(local.no) : "");
  const birth = local?.birth ?? (info?.birthday && /^\d{8}$/.test(info.birthday) ? `${info.birthday.slice(0, 4)}-${info.birthday.slice(4, 6)}-${info.birthday.slice(6, 8)}` : null);
  const age = kblAge(birth);
  const height = local?.height ?? (info?.pHeight ? Math.round(Number(info.pHeight)) : null);
  const seasonRow = seasons.regular.find((r) => Number(r.seasonCode) === showCode) ?? null;
  const showLabel = showCode ? labelOf(showCode) : "";
  const isPastSeason = recent != null && showCode !== recentCode;
  const openingNote = isPastSeason || (recent && seasons.regular.length > 0 && games.length === 0 && seasonList[0] && seasonList[0].seasonCode !== recentCode)
    ? `${showLabel} 시즌 최종 기록 · 새 시즌은 개막 후 자동 갱신`
    : `${showLabel} 정규리그 · KBL 공식 기록 · 경기 종료 후 자동 갱신`;

  const facts: Array<[string, string]> = [
    ["포지션", pos || "—"],
    ["신장 · 체중", [height ? `${height}cm` : null, local?.weight ? `${local.weight}kg` : null].filter(Boolean).join(" · ") || "—"],
    ["생년월일", birth ? `${birth.replace(/-/g, ".")}${age != null ? ` (${age}세)` : ""}` : "—"],
    ["국적", info?.country ?? local?.country ?? "—"],
    ["학교", (info?.univSch && info.univSch !== "0" ? info.univSch : local?.school) ?? "—"],
    ["드래프트", local?.draft ?? "—"],
  ];

  const overview = (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500 break-keep">{openingNote}</p>
      {avg.length > 0 ? (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
              <tr><Th left>부문</Th><Th>경기당 평균</Th><Th>리그 순위</Th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
              {avg.map((r) => {
                const meta = KBL_CATEGORY_KO[r.columnName];
                if (!meta) return null;
                return (
                  <tr key={r.columnName}>
                    <Td left>{meta.label}</Td>
                    <Td accent>{meta.pct ? pc(r.value) : n1(r.value)}</Td>
                    <Td muted>{r.rank > 0 ? `${r.rank}위` : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">시즌 평균 기록이 없습니다.</p>
      )}
      <p className="text-[11px] text-neutral-400">ⓘ 리그 순위는 KBL 공식 집계(규정 경기수 기준). 출처 KBL.</p>
    </div>
  );

  return (
    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/basketball" className="hover:underline">농구</Link>
        <span>›</span>
        <Link href="/leagues/KBL" className="hover:underline">KBL</Link>
        {teamInfo && (
          <>
            <span>›</span>
            <Link href={`/teams/${teamInfo.id}`} className="hover:underline">{teamKo || teamInfo.name}</Link>
          </>
        )}
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">{name}</span>
      </nav>

      <header className="flex flex-wrap items-start gap-5">
        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-neutral-100 dark:bg-neutral-800 overflow-hidden ring-1 ring-black/5 dark:ring-white/10 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={kblPlayerPhotoUrl(pid)} alt={name} className="w-full h-full object-cover object-top" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/leagues/KBL" className="text-neutral-400 hover:text-neutral-700 dark:hover:text-white"><ChevronLeft className="h-5 w-5" /></Link>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{name}</h1>
            {no && <span className="text-lg font-bold text-neutral-400 tabular-nums">No.{no}</span>}
            <ShareCardButton />
          </div>
          <div className="text-sm text-neutral-500 flex items-center gap-2 flex-wrap">
            {teamInfo ? (
              <Link href={`/teams/${teamInfo.id}`} className="inline-flex items-center gap-1.5 font-semibold text-neutral-700 dark:text-neutral-200 hover:underline">
                {teamInfo.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={teamInfo.logo} alt="" className="w-5 h-5 object-contain" />
                )}
                {teamKo || teamInfo.name}
              </Link>
            ) : (
              <span>{teamKo}</span>
            )}
            {pos && <span>· {pos}</span>}
            {ename && <span className="text-neutral-400">· {ename}</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-xl">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-lg bg-neutral-50 dark:bg-white/[0.04] px-3 py-1.5">
                <div className="text-[10px] text-neutral-500">{k}</div>
                <div className="text-sm font-semibold break-keep">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {(seasonRow || career) && (
        <section className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {seasonRow && (
            <>
              <Stat label={`${showLabel} 득점`} value={n1(seasonRow.avgScore)} sub={`${seasonRow.gameCount}경기`} accent />
              <Stat label="리바운드" value={n1(seasonRow.avgRb)} />
              <Stat label="어시스트" value={n1(seasonRow.avgAS)} />
            </>
          )}
          {career && (
            <>
              <Stat label="통산 득점" value={n1(career.score)} sub="정규리그 평균" />
              <Stat label="통산 리바운드" value={n1(career.rb)} />
              <Stat label="통산 어시스트" value={n1(career.as)} />
            </>
          )}
        </section>
      )}

      <PlayerTabs
        tabs={[
          { key: "overview", label: "개요", content: overview },
          {
            key: "seasons",
            label: "시즌별",
            content: (
              <div className="space-y-5">
                <SeasonTable rows={seasons.regular} career={seasons.careerAvg} labelOf={labelOf} teamMap={teamMap} nameOf={nameOf} />
                {seasons.playoff.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-neutral-500">플레이오프</h3>
                    <SeasonTable rows={seasons.playoff} career={null} labelOf={labelOf} teamMap={teamMap} nameOf={nameOf} title="플레이오프" />
                  </div>
                )}
              </div>
            ),
          },
          {
            key: "games",
            label: "경기별",
            content: (
              <div className="space-y-2">
                <p className="text-xs text-neutral-500">{showLabel} 정규리그 · 최근 경기부터</p>
                <GameTable rows={games.slice(0, 40)} teamMap={teamMap} nameOf={nameOf} />
              </div>
            ),
          },
        ]}
      />

      <p className="text-[11px] text-neutral-400 flex items-center gap-1">
        출처 KBL 공식 기록
        <a href={`https://kbl.or.kr/player/player/${pid}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:underline">
          kbl.or.kr <ExternalLink className="h-3 w-3" />
        </a>
      </p>
    </div>
  );
}
