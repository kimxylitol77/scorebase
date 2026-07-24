// 골프 리더보드 — 선수 행 클릭 시 홀별 스코어카드(라운드 탭)를 펼치는 클라이언트 컴포넌트.
// 네이버 골프식: Total·오늘·홀(thru) 컬럼 + 펼침 시 Par/타수/누적 3행 + 이글·버디·보기 색상.
"use client";

import { useState } from "react";

export interface HoleScore {
  hole: number;
  par: number | null;
  strokes: number | null;
  rel: number | null; // 홀별 대par (버디 -1, 보기 +1 …)
}
export interface GolfRound {
  round: number;
  holes: HoleScore[]; // 홀 번호 오름차순, 미플레이 홀은 strokes=null
}
export interface GolfLeaderData {
  key: string;
  rank: number;
  name: string;
  flag: string | null;
  photo: string | null;
  country: string | null;
  isKorean: boolean;
  total: string; // "-9" / "E" / "+3"
  today: string; // 현재 라운드 대par
  thru: string; // "F" / "12" / "-"
  rounds: GolfRound[]; // 홀 데이터가 있는 라운드만
}

function fmtRel(n: number | null): string {
  if (n == null) return "-";
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `${n}`;
}
function scoreTone(s: string): string {
  if (s === "-") return "text-neutral-300 dark:text-neutral-600";
  if (s.startsWith("-")) return "text-rose-600 dark:text-rose-400";
  if (s.startsWith("+")) return "text-sky-700 dark:text-sky-400";
  return "text-neutral-600 dark:text-neutral-300";
}

// 홀 타수 셀 — 대par 결과에 따라 원(언더=빨강)·사각(오버=파랑) 배지.
// PGA 중계 관례(언더파 빨강) + 리더보드 Total 컬럼과 색 통일.
function holeCell(strokes: number | null, rel: number | null) {
  if (strokes == null) return <span className="text-neutral-300 dark:text-neutral-600">·</span>;
  const base = "inline-flex items-center justify-center w-6 h-6 text-[12px] tabular-nums leading-none";
  if (rel == null || rel === 0) return <span className={`${base} text-neutral-600 dark:text-neutral-300`}>{strokes}</span>;
  if (rel <= -2)
    return <span className={`${base} rounded-full ring-[1.5px] ring-rose-500 font-bold text-rose-600 dark:text-rose-400 shadow-[0_0_0_2px_theme(colors.rose.200)] dark:shadow-none`}>{strokes}</span>;
  if (rel === -1)
    return <span className={`${base} rounded-full ring-1 ring-rose-400 text-rose-600 dark:text-rose-400`}>{strokes}</span>;
  if (rel === 1)
    return <span className={`${base} rounded-[3px] ring-1 ring-sky-400 text-sky-700 dark:text-sky-400`}>{strokes}</span>;
  return <span className={`${base} rounded-[3px] ring-[1.5px] ring-sky-500 font-bold text-sky-700 dark:text-sky-300`}>{strokes}</span>;
}

// 선수 아바타 — 원형 사진 + 국기 배지. 사진 없거나 로드 실패 시 이니셜 폴백.
function Avatar({ photo, flag, country, name }: { photo: string | null; flag: string | null; country: string | null; name: string }) {
  const [err, setErr] = useState(false);
  return (
    <span className="relative inline-block shrink-0 w-8 h-8">
      {photo && !err ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt={name}
          loading="lazy"
          onError={() => setErr(true)}
          className="w-8 h-8 rounded-full object-cover object-top bg-neutral-100 dark:bg-neutral-800 ring-1 ring-black/5 dark:ring-white/10"
        />
      ) : (
        <span className="flex w-8 h-8 items-center justify-center rounded-full bg-neutral-200 text-[12px] font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {name.slice(0, 1)}
        </span>
      )}
      {flag && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={flag}
          alt={country ?? ""}
          className="absolute -bottom-0.5 -right-0.5 w-3.5 h-[10px] rounded-[1px] object-cover ring-1 ring-white dark:ring-neutral-950"
        />
      )}
    </span>
  );
}

function sumStrokes(holes: HoleScore[]): number | null {
  const played = holes.filter((h) => h.strokes != null);
  if (played.length === 0) return null;
  return played.reduce((s, h) => s + (h.strokes ?? 0), 0);
}
function sumPar(holes: HoleScore[]): number | null {
  const known = holes.filter((h) => h.par != null);
  if (known.length === 0) return null;
  return known.reduce((s, h) => s + (h.par ?? 0), 0);
}

function Scorecard({ round }: { round: GolfRound }) {
  const front = round.holes.filter((h) => h.hole <= 9);
  const back = round.holes.filter((h) => h.hole >= 10 && h.hole <= 18);
  // 누적 대par (플레이한 홀까지)
  let cum = 0;
  const cumById = new Map<number, number | null>();
  for (const h of round.holes) {
    if (h.rel != null) cum += h.rel;
    cumById.set(h.hole, h.strokes != null ? cum : null);
  }
  const outPar = sumPar(front);
  const inPar = sumPar(back);
  const outStk = sumStrokes(front);
  const inStk = sumStrokes(back);
  const totPar = outPar != null && inPar != null ? outPar + inPar : outPar ?? inPar;
  const totStk = outStk != null && inStk != null ? outStk + inStk : outStk ?? inStk;

  const th = "px-1 py-1 w-7 font-semibold";
  const sum = "px-1.5 py-1 font-bold";
  const sumHead = `${sum} bg-neutral-200/60 dark:bg-white/[0.06] text-neutral-700 dark:text-neutral-200`;
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-center border-collapse whitespace-nowrap">
        <thead>
          <tr className="bg-neutral-100 dark:bg-white/[0.04] text-[11px] text-neutral-500 dark:text-neutral-400">
            <th className="px-2 py-1 text-left font-semibold">홀</th>
            {front.map((h) => (
              <th key={h.hole} className={th}>{h.hole}</th>
            ))}
            <th className={sumHead}>OUT</th>
            {back.map((h) => (
              <th key={h.hole} className={th}>{h.hole}</th>
            ))}
            <th className={sumHead}>IN</th>
            <th className={sumHead}>합계</th>
          </tr>
        </thead>
        <tbody>
          {/* Par */}
          <tr className="text-[12px] text-neutral-500 bg-neutral-50 dark:bg-white/[0.02]">
            <td className="px-2 py-1 text-left font-semibold">Par</td>
            {front.map((h) => (
              <td key={h.hole} className="px-1 py-1 tabular-nums">{h.par ?? "-"}</td>
            ))}
            <td className={`${sum} tabular-nums`}>{outPar ?? "-"}</td>
            {back.map((h) => (
              <td key={h.hole} className="px-1 py-1 tabular-nums">{h.par ?? "-"}</td>
            ))}
            <td className={`${sum} tabular-nums`}>{inPar ?? "-"}</td>
            <td className={`${sum} tabular-nums`}>{totPar ?? "-"}</td>
          </tr>
          {/* 타수 */}
          <tr className="text-[12px]">
            <td className="px-2 py-1 text-left font-semibold text-neutral-700 dark:text-neutral-200">{round.round}R</td>
            {front.map((h) => (
              <td key={h.hole} className="px-1 py-1">{holeCell(h.strokes, h.rel)}</td>
            ))}
            <td className={`${sum} tabular-nums text-neutral-800 dark:text-neutral-100`}>{outStk ?? "-"}</td>
            {back.map((h) => (
              <td key={h.hole} className="px-1 py-1">{holeCell(h.strokes, h.rel)}</td>
            ))}
            <td className={`${sum} tabular-nums text-neutral-800 dark:text-neutral-100`}>{inStk ?? "-"}</td>
            <td className={`${sum} tabular-nums text-neutral-900 dark:text-white`}>{totStk ?? "-"}</td>
          </tr>
          {/* 누적 */}
          <tr className="text-[11px] text-neutral-500 bg-neutral-50 dark:bg-white/[0.02]">
            <td className="px-2 py-1 text-left font-semibold">누적</td>
            {front.map((h) => (
              <td key={h.hole} className={`px-1 py-1 tabular-nums ${scoreTone(fmtRel(cumById.get(h.hole) ?? null))}`}>{fmtRel(cumById.get(h.hole) ?? null)}</td>
            ))}
            <td className="px-1.5 py-1" />
            {back.map((h) => (
              <td key={h.hole} className={`px-1 py-1 tabular-nums ${scoreTone(fmtRel(cumById.get(h.hole) ?? null))}`}>{fmtRel(cumById.get(h.hole) ?? null)}</td>
            ))}
            <td className="px-1.5 py-1" />
            <td className="px-1.5 py-1" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ExpandedRow({ leader }: { leader: GolfLeaderData }) {
  const [tab, setTab] = useState(leader.rounds.length - 1); // 최신 라운드 기본
  if (leader.rounds.length === 0) {
    return (
      <div className="px-4 py-3 text-[12px] text-neutral-400">아직 기록된 홀 스코어가 없습니다.</div>
    );
  }
  const round = leader.rounds[Math.min(tab, leader.rounds.length - 1)];
  return (
    <div className="px-3 sm:px-4 py-3 space-y-2.5 bg-neutral-50/60 dark:bg-white/[0.015]">
      {leader.rounds.length > 1 && (
        <div className="inline-flex gap-1 rounded-full bg-white p-0.5 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          {leader.rounds.map((r, i) => (
            <button
              key={r.round}
              onClick={() => setTab(i)}
              className={`rounded-full px-3.5 py-1 text-[12px] font-semibold transition-colors ${
                i === tab
                  ? "bg-rose-600 text-white"
                  : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
            >
              {r.round}R
            </button>
          ))}
        </div>
      )}
      <Scorecard round={round} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-neutral-400">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full ring-[1.5px] ring-rose-500" />이글 이상</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full ring-1 ring-rose-400" />버디</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-[3px] ring-1 ring-sky-400" />보기</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-[3px] ring-[1.5px] ring-sky-500" />더블보기 이상</span>
      </div>
    </div>
  );
}

export default function GolfLeaderboard({ leaders }: { leaders: GolfLeaderData[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      {/* 헤더 */}
      <div className="grid grid-cols-[28px_1fr_52px_44px_52px] items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-100 dark:border-neutral-800">
        <span className="text-right">순위</span>
        <span>선수</span>
        <span className="text-right">Total</span>
        <span className="text-center">홀</span>
        <span className="text-right">오늘</span>
      </div>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {leaders.map((l) => {
          const expanded = open === l.key;
          const hasCard = l.rounds.length > 0;
          return (
            <li key={l.key} className={l.isKorean ? "bg-amber-50/70 dark:bg-amber-500/[0.08]" : ""}>
              <button
                type="button"
                onClick={() => hasCard && setOpen(expanded ? null : l.key)}
                aria-expanded={expanded}
                className={`grid w-full grid-cols-[28px_1fr_52px_44px_52px] items-center gap-2 px-4 py-2 text-[13px] text-left ${
                  hasCard ? "cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03]" : "cursor-default"
                }`}
              >
                <span className="text-right font-bold tabular-nums text-neutral-500">{l.rank || "-"}</span>
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar photo={l.photo} flag={l.flag} country={l.country} name={l.name} />
                  <span className={`truncate ${l.isKorean ? "font-bold text-neutral-900 dark:text-white" : "text-neutral-700 dark:text-neutral-300"}`}>
                    {l.name}
                  </span>
                  {hasCard && (
                    <svg
                      className={`shrink-0 w-3.5 h-3.5 text-neutral-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                      viewBox="0 0 20 20" fill="currentColor" aria-hidden
                    >
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  )}
                </span>
                <span className={`text-right font-bold tabular-nums ${scoreTone(l.total)}`}>{l.total}</span>
                <span className="text-center text-[12px] tabular-nums text-neutral-400">{l.thru}</span>
                <span className={`text-right tabular-nums ${scoreTone(l.today)}`}>{l.today}</span>
              </button>
              {expanded && <ExpandedRow leader={l} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
