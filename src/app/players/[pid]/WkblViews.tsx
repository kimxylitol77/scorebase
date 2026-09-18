// WKBL 선수 상세 — 헤더(프로필) + 3탭(개요=최근 시즌 평균·시즌 랭킹 / 시즌별=통산 / 최고 기록).
// 프로필·사진은 wkbl-players.json(주간), 기록은 wkbl.or.kr 파서(wkbl-api) 런타임 fetch(1h 캐시). 경기별 기록은 사이트가 제공하지 않는다.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import {
  fetchWkblCareer, fetchWkblCareerHighs, fetchWkblPlayerDetail, wkblPhotoUrl, wkblSeasonLabel, type WkblSeasonRow,
} from "@/lib/sports/wkbl-api";
import { wkblPlayer, wkblPosKo } from "@/lib/sports/wkbl-players";
import { kblAge } from "@/lib/sports/kbl-players";
import { toKoreanTeamName } from "@/lib/team-names";
import AmbientGlow from "@/components/AmbientGlow";
import ShareCardButton from "@/components/ShareCardButton";
import { ChevronLeft, ExternalLink } from "lucide-react";
import PlayerTabs from "./PlayerTabs";

const n1 = (x: number | null | undefined) => (x == null ? "—" : x.toFixed(1));
const pc = (x: number | null | undefined) => (x == null ? "—" : `${x.toFixed(1)}%`);

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
  return <td className={`px-2.5 py-2 tabular-nums whitespace-nowrap ${left ? "text-left" : "text-right"} ${accent ? "font-bold" : ""} ${muted ? "text-neutral-400" : ""}`}>{children}</td>;
}

function SeasonTable({ rows, career }: { rows: WkblSeasonRow[]; career: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-neutral-500">기록이 없습니다.</p>;
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
          <tr>
            <Th left>{career ? "시즌" : "구분"}</Th>{career && <Th left>팀</Th>}<Th>경기</Th><Th>출전</Th><Th>득점</Th><Th>리바운드</Th><Th>어시스트</Th><Th>스틸</Th><Th>블록</Th>
            {!career && <Th>2점</Th>}<Th>2점%</Th>{!career && <Th>3점</Th>}<Th>3점%</Th>{!career && <Th>자유투</Th>}<Th>자유투%</Th><Th>턴오버</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
          {rows.map((r, i) => (
            <tr key={`${r.label}-${i}`}>
              <Td left accent>{r.label}</Td>
              {career && <Td left muted>{r.team ?? "—"}</Td>}
              <Td muted>{r.g ?? "—"}</Td>
              <Td muted>{r.mpg || "—"}</Td>
              <Td accent>{n1(r.ppg)}</Td>
              <Td>{n1(r.reb)}</Td>
              <Td>{n1(r.apg)}</Td>
              <Td muted>{n1(r.spg)}</Td>
              <Td muted>{n1(r.bpg)}</Td>
              {!career && <Td muted>{r.fg2 || "—"}</Td>}<Td>{pc(r.fg2Pct)}</Td>
              {!career && <Td muted>{r.fg3 || "—"}</Td>}<Td>{pc(r.fg3Pct)}</Td>
              {!career && <Td muted>{r.ft || "—"}</Td>}<Td muted>{pc(r.ftPct)}</Td>
              <Td muted>{n1(r.to)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function WkblPlayerView({ pid }: { pid: string }) {
  if (!/^\d{4,8}$/.test(pid)) notFound();
  const local = wkblPlayer(pid);
  const detail = await fetchWkblPlayerDetail(pid);
  if (!local && !detail) notFound();
  const seasonGu = detail?.seasonGu ?? "046";
  const [career, highs, team] = await Promise.all([
    fetchWkblCareer(pid, seasonGu),
    fetchWkblCareerHighs(pid, seasonGu),
    local?.teamId ? prisma.team.findUnique({ where: { id: local.teamId }, select: { id: true, name: true, logoUrl: true } }) : Promise.resolve(null),
  ]);
  const name = local?.name ?? detail?.name ?? "";
  const ename = local?.ename ?? detail?.ename ?? "";
  const teamKo = team ? toKoreanTeamName(team.name, "WKBL") || team.name : (local?.teamFull ?? detail?.teamFull ?? local?.team ?? "");
  const no = detail?.no ?? local?.no;
  const pos = wkblPosKo(detail?.pos ?? local?.pos);
  const birth = detail?.birth ?? local?.birth ?? null;
  const age = kblAge(birth);
  const height = detail?.height ?? local?.height;
  const seasonLabel = wkblSeasonLabel(seasonGu);
  const regular = detail?.season.find((r) => !/playoff/i.test(r.label)) ?? null;
  const facts: Array<[string, string]> = [
    ["포지션", pos || "—"],
    ["신장", height ? `${height}cm` : "—"],
    ["생년월일", birth ? `${birth.replace(/-/g, ".")}${age != null ? ` (${age}세)` : ""}` : "—"],
    ["출신학교", detail?.school ?? local?.school ?? "—"],
    ["드래프트", detail?.draft ?? local?.draft ?? "—"],
  ];

  const overview = (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500 break-keep">{seasonLabel} 정규리그 기준 · WKBL 공식 기록 · 경기 종료 후 자동 갱신 (개막 전엔 지난 시즌 최종 기록)</p>
      {detail && detail.season.length > 0 ? <SeasonTable rows={detail.season} career={false} /> : <p className="text-sm text-neutral-500">시즌 기록이 없습니다.</p>}
      {detail && detail.ranks.length > 0 && (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500"><tr><Th left>부문</Th><Th>기록</Th><Th>리그 순위</Th></tr></thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
              {detail.ranks.map((r) => (
                <tr key={r.label}><Td left>{r.label}</Td><Td accent>{r.value == null ? "—" : Number.isInteger(r.value) ? String(r.value) : r.value.toFixed(r.label.includes("률") || r.label.includes("시간") ? 1 : 2)}</Td><Td muted>{r.rank != null ? `${r.rank}위` : "—"}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-neutral-400">ⓘ 시즌 랭킹은 WKBL 공식 집계. 출처 WKBL.</p>
    </div>
  );

  return (
    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/basketball" className="hover:underline">농구</Link><span>›</span>
        <Link href="/leagues/WKBL" className="hover:underline">WKBL</Link>
        {team && (<><span>›</span><Link href={`/teams/${team.id}`} className="hover:underline">{teamKo}</Link></>)}
        <span>›</span><span className="text-neutral-700 dark:text-neutral-300">{name}</span>
      </nav>
      <header className="flex flex-wrap items-start gap-5">
        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-neutral-100 dark:bg-neutral-800 overflow-hidden ring-1 ring-black/5 dark:ring-white/10 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wkblPhotoUrl(pid)} alt={name} className="w-full h-full object-cover object-top" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/leagues/WKBL" className="text-neutral-400 hover:text-neutral-700 dark:hover:text-white"><ChevronLeft className="h-5 w-5" /></Link>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{name}</h1>
            {no != null && <span className="text-lg font-bold text-neutral-400 tabular-nums">No.{no}</span>}
            <ShareCardButton />
          </div>
          <div className="text-sm text-neutral-500 flex items-center gap-2 flex-wrap">
            {team ? (
              <Link href={`/teams/${team.id}`} className="inline-flex items-center gap-1.5 font-semibold text-neutral-700 dark:text-neutral-200 hover:underline">
                {team.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={team.logoUrl} alt="" className="w-5 h-5 object-contain" />
                )}
                {teamKo}
              </Link>
            ) : <span>{teamKo}</span>}
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
      {regular && (
        <section className="grid grid-cols-3 gap-2 max-w-md">
          <Stat label={`${seasonLabel} 득점`} value={n1(regular.ppg)} sub={`${regular.g ?? "—"}경기`} accent />
          <Stat label="리바운드" value={n1(regular.reb)} />
          <Stat label="어시스트" value={n1(regular.apg)} />
        </section>
      )}
      <PlayerTabs
        tabs={[
          { key: "overview", label: "개요", content: overview },
          { key: "seasons", label: "시즌별", content: <SeasonTable rows={career} career /> },
          {
            key: "highs",
            label: "최고 기록",
            content: highs.length === 0 ? <p className="text-sm text-neutral-500">기록이 없습니다.</p> : (
              <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500"><tr><Th left>부문</Th><Th left>시즌 최고</Th><Th left>통산 최고</Th></tr></thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
                    {highs.map((h) => (<tr key={h.label}><Td left accent>{h.label}</Td><Td left>{h.season || "—"}</Td><Td left muted>{h.career || "—"}</Td></tr>))}
                  </tbody>
                </table>
              </div>
            ),
          },
        ]}
      />
      <p className="text-[11px] text-neutral-400 flex items-center gap-1">
        출처 WKBL 공식 기록
        <a href={`https://www.wkbl.or.kr/player/detail.asp?player_group=12&tcode=&pno=${pid}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:underline">wkbl.or.kr <ExternalLink className="h-3 w-3" /></a>
      </p>
    </div>
  );
}
