// V-리그(KOVO) 선수 상세 — 헤더(프로필·소속 이력) + 3탭(개요=최근 시즌 요약·리그 순위 / 시즌별 / 기록 상세).
// 프로필·사진은 kovo-players.json(주간), 기록은 user-api.kovo.co.kr 런타임 fetch(1h 캐시). 경기별 기록 API 는 없다.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import {
  fetchKovoPlayer, fetchKovoPlayerHistory, fetchKovoPlayerRankings, fetchKovoPlayerRecordDetail, fetchKovoPlayerRecords, fetchKovoPlayerSeasonRecords,
  KOVO_TEAMS, type KovoRecordDetail,
} from "@/lib/sports/kovo-api";
import { kovoPlayer, kovoPosKo } from "@/lib/sports/kovo-players";
import { kblAge } from "@/lib/sports/kbl-players";
import AmbientGlow from "@/components/AmbientGlow";
import ShareCardButton from "@/components/ShareCardButton";
import { ChevronLeft, ExternalLink } from "lucide-react";
import PlayerTabs from "./PlayerTabs";

const n2 = (x: number | null | undefined) => (x == null ? "—" : x.toFixed(2));
const pc = (x: number | null | undefined) => (x == null ? "—" : `${x.toFixed(2)}%`);

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
const Card = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">{children}</div>
);

function DetailTable({ d }: { d: KovoRecordDetail }) {
  const rows: Array<[string, string, string, string, string]> = [
    ["공격", String(d.attackTry), String(d.attackSuccess), pc(d.attackSuccessPercent), `효율 ${pc(d.attackEfficiency)} · 점유율 ${pc(d.attackGamePercent)}`],
    ["블로킹", String(d.blockTry), String(d.blockSuccess), pc(d.blockSuccessPercent), `세트당 ${n2(d.blockSetPercent)} · 유효 ${d.blockValidBlock}`],
    ["서브", String(d.serveTry), String(d.serveSuccess), pc(d.serveSuccessPercent), `세트당 ${n2(d.serveSetPercent)} · 범실 ${d.serveError}`],
    ["세트", String(d.setTry), String(d.setSuccess), pc(d.setSuccessPercent), `세트당 ${n2(d.setSetPercent)}`],
    ["리시브", String(d.receiveTry), String(d.receiveSuccess), pc(d.receiveSuccessPercent), `실패 ${d.receiveFail}`],
    ["디그", String(d.digTry), String(d.digSuccess), pc(d.digSuccessPercent), `세트당 ${n2(d.digSetPercent)}`],
  ];
  return (
    <Card>
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500"><tr><Th left>부문</Th><Th>시도</Th><Th>성공</Th><Th>성공률</Th><Th left>보조</Th></tr></thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
          {rows.map(([k, t, s, p, sub]) => (<tr key={k}><Td left accent>{k}</Td><Td muted>{t}</Td><Td>{s}</Td><Td accent>{p}</Td><Td left muted>{sub}</Td></tr>))}
        </tbody>
      </table>
    </Card>
  );
}

export async function KovoPlayerView({ pid, league }: { pid: string; league: "V_LEAGUE" | "V_LEAGUE_W" }) {
  if (!/^\d{5,8}$/.test(pid)) notFound();
  const local = kovoPlayer(pid);
  const [prof, seasons, ranks, recs, detail, history] = await Promise.all([
    fetchKovoPlayer(pid), fetchKovoPlayerSeasonRecords(pid), fetchKovoPlayerRankings(pid), fetchKovoPlayerRecords(pid), fetchKovoPlayerRecordDetail(pid),
    local ? Promise.resolve(local.history) : fetchKovoPlayerHistory(pid),
  ]);
  if (!local && !prof) notFound();
  const name = local?.name ?? prof?.name ?? "";
  const teamCode = prof?.teamCode ?? local?.teamCode ?? "";
  const tmeta = KOVO_TEAMS[teamCode];
  const team = tmeta ? await prisma.team.findUnique({ where: { id: tmeta.teamId }, select: { id: true, name: true, logoUrl: true } }) : null;
  const teamKo = team?.name ?? prof?.teamName ?? local?.team ?? "";
  const pos = kovoPosKo(prof?.position ?? local?.pos);
  const no = prof?.backNumber ?? local?.no;
  const birth = prof?.birthDate ?? local?.birth ?? null;
  const age = kblAge(birth);
  const height = prof?.height ?? local?.height; const weight = prof?.weight ?? local?.weight;
  const photo = prof?.image ?? local?.photo ?? null;
  const latest = seasons.find((s) => /\[정\]/.test(s.seasonDivision)) ?? seasons[0] ?? null;
  const leagueName = league === "V_LEAGUE_W" ? "V-리그 여자부" : "V-리그 남자부";
  const facts: Array<[string, string]> = [
    ["포지션", pos || "—"],
    ["신장 · 체중", [height ? `${height}cm` : null, weight ? `${weight}kg` : null].filter(Boolean).join(" · ") || "—"],
    ["생년월일", birth ? `${birth.replace(/-/g, ".")}${age != null ? ` (${age}세)` : ""}` : "—"],
    ["출신학교", prof?.school ?? local?.school ?? "—"],
  ];
  const rankRow = (label: string, v: number | null | undefined, r: number | null | undefined, unit: string) => (
    <tr key={label}><Td left>{label}</Td><Td accent>{v == null ? "—" : label === "득점" ? String(v) : n2(v)}</Td><Td muted>{unit}</Td><Td muted>{r != null ? `${r}위` : "—"}</Td></tr>
  );
  const overview = (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500 break-keep">{latest ? `${latest.seasonDivision} ${latest.leagueDivision}` : "최근 시즌"} · KOVO 공식 기록 · 경기 종료 후 자동 갱신 (개막 전엔 지난 시즌 최종 기록)</p>
      {recs ? (
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500"><tr><Th left>부문</Th><Th>기록</Th><Th>기준</Th><Th>리그 순위</Th></tr></thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
              {rankRow("득점", recs.point, ranks?.point, "시즌 합계")}
              {rankRow("공격", recs.attack, ranks?.attack, "성공률 %")}
              {rankRow("블로킹", recs.block, ranks?.block, "세트당")}
              {rankRow("서브", recs.serve, ranks?.serve, "세트당")}
              {rankRow("디그(수비)", recs.defense, ranks?.defense, "세트당")}
              {rankRow("세트", recs.set, ranks?.set, "세트당")}
            </tbody>
          </table>
        </Card>
      ) : <p className="text-sm text-neutral-500">시즌 기록이 없습니다.</p>}
      <p className="text-[11px] text-neutral-400">ⓘ 리그 순위는 KOVO 공식 집계(규정 미달 부문은 —). 출처 KOVO.</p>
    </div>
  );

  return (
    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores?sport=volleyball" className="hover:underline">배구</Link><span>›</span>
        <Link href={`/leagues/${league}`} className="hover:underline">{leagueName}</Link>
        {team && (<><span>›</span><Link href={`/teams/${team.id}`} className="hover:underline">{teamKo}</Link></>)}
        <span>›</span><span className="text-neutral-700 dark:text-neutral-300">{name}</span>
      </nav>
      <header className="flex flex-wrap items-start gap-5">
        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-neutral-100 dark:bg-neutral-800 overflow-hidden ring-1 ring-black/5 dark:ring-white/10 shrink-0 flex items-center justify-center">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={name} className="w-full h-full object-cover object-top" />
          ) : <span className="text-2xl font-bold text-neutral-400">{name.slice(0, 1)}</span>}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/leagues/${league}`} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-white"><ChevronLeft className="h-5 w-5" /></Link>
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
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-2xl">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-lg bg-neutral-50 dark:bg-white/[0.04] px-3 py-1.5">
                <div className="text-[10px] text-neutral-500">{k}</div>
                <div className="text-sm font-semibold break-keep">{v}</div>
              </div>
            ))}
          </div>
          {history.length > 0 && (
            <p className="text-[11px] text-neutral-500 break-keep">소속 이력 · {history.slice(0, 6).join(" → ")}{history.length > 6 ? " …" : ""}</p>
          )}
        </div>
      </header>
      {latest && (
        <section className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          <Stat label={`${latest.seasonDivision.replace(/\s*\[.*\]/, "")} 득점`} value={String(latest.point)} sub={`${latest.gameCount}경기 ${latest.setCount}세트`} accent />
          <Stat label="공격 성공률" value={pc(latest.attackTotalSuccess)} />
          <Stat label="블로킹 (세트당)" value={n2(latest.blockingSetSuccess)} />
          <Stat label="서브 (세트당)" value={n2(latest.serveSetSuccess)} />
          <Stat label="디그 (세트당)" value={n2(latest.digSetSuccess)} />
        </section>
      )}
      <PlayerTabs
        tabs={[
          { key: "overview", label: "개요", content: overview },
          {
            key: "seasons", label: "시즌별",
            content: seasons.length === 0 ? <p className="text-sm text-neutral-500">시즌 기록이 없습니다.</p> : (
              <Card>
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
                    <tr><Th left>시즌</Th><Th left>구분</Th><Th left>팀</Th><Th>경기</Th><Th>세트</Th><Th>득점</Th><Th>공격%</Th><Th>블로킹</Th><Th>서브</Th><Th>세트</Th><Th>리시브%</Th><Th>디그</Th><Th>범실</Th></tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
                    {seasons.map((s, i) => (
                      <tr key={i}>
                        <Td left accent>{s.seasonDivision.replace(/\s*\[.*\]/, "")}</Td><Td left muted>{s.leagueDivision}{/\[(.+)\]/.exec(s.seasonDivision)?.[1] ? ` ${/\[(.+)\]/.exec(s.seasonDivision)?.[1]}` : ""}</Td><Td left>{s.teamName}</Td>
                        <Td muted>{s.gameCount}</Td><Td muted>{s.setCount}</Td><Td accent>{s.point}</Td><Td>{pc(s.attackTotalSuccess)}</Td><Td>{n2(s.blockingSetSuccess)}</Td><Td>{n2(s.serveSetSuccess)}</Td><Td muted>{n2(s.setSuccess)}</Td><Td muted>{pc(s.receiveSuccess)}</Td><Td muted>{n2(s.digSetSuccess)}</Td><Td muted>{s.error}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ),
          },
          { key: "detail", label: "기록 상세", content: detail ? <div className="space-y-2"><p className="text-xs text-neutral-500">최근 시즌 정규리그 · {detail.gameCount}경기 {detail.setCount}세트</p><DetailTable d={detail} /></div> : <p className="text-sm text-neutral-500">기록이 없습니다.</p> },
        ]}
      />
      <p className="text-[11px] text-neutral-400 flex items-center gap-1">
        출처 KOVO 공식 기록
        <a href={`https://www.kovo.co.kr/teams/players?playerCode=${pid}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:underline">kovo.co.kr <ExternalLink className="h-3 w-3" /></a>
      </p>
    </div>
  );
}
