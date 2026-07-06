// 선수 헤더 바이오 패널 — FotMob식 2열(정보 왼쪽 + 포지션 오른쪽 미니 피치).
// 포지션 = data/player-positions.json(라인업 grid 집계) 의 선호(primary) + 뛸 수 있는(others).
// 없으면 coarse(G/D/M/F) 단일 폴백.

import Link from "next/link";
import type { ReactNode } from "react";
import { POS_KO, POS_XY, type PosCode } from "@/lib/players/grid-position";

// coarse 폴백용 라벨/좌표
const COARSE: Record<string, { label: string; code: PosCode }> = {
  F: { label: "공격수", code: "ST" },
  M: { label: "미드필더", code: "CM" },
  D: { label: "수비수", code: "CB" },
  G: { label: "골키퍼", code: "GK" },
};

function InfoCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-lg font-bold tabular-nums truncate">{children}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}

function MiniPitch({ primary, others }: { primary: PosCode; others: PosCode[] }) {
  const markers: { code: PosCode; primary: boolean }[] = [
    { code: primary, primary: true },
    ...others.map((c) => ({ code: c, primary: false })),
  ];
  return (
    <svg viewBox="0 0 100 130" className="w-full h-full" role="img" aria-label="포지션">
      <rect x="1" y="1" width="98" height="128" rx="4" className="fill-neutral-100 dark:fill-white/[0.05] stroke-black/10 dark:stroke-white/10" strokeWidth="0.6" />
      <line x1="1" y1="65" x2="99" y2="65" className="stroke-black/10 dark:stroke-white/10" strokeWidth="0.5" />
      <circle cx="50" cy="65" r="11" className="fill-none stroke-black/10 dark:stroke-white/10" strokeWidth="0.5" />
      <rect x="30" y="1" width="40" height="16" className="fill-none stroke-black/10 dark:stroke-white/10" strokeWidth="0.5" />
      <rect x="30" y="113" width="40" height="16" className="fill-none stroke-black/10 dark:stroke-white/10" strokeWidth="0.5" />
      {markers.map((m, i) => {
        const xy = POS_XY[m.code];
        if (!xy) return null;
        const cy = (xy.y / 100) * 130;
        return (
          <g key={m.code + i}>
            <circle cx={xy.x} cy={cy} r={m.primary ? 11 : 8.5} className={m.primary ? "fill-rose-500" : "fill-neutral-400 dark:fill-neutral-500"} />
            <text x={xy.x} y={cy} textAnchor="middle" dominantBaseline="central" className="fill-white font-bold" fontSize={m.primary ? 7.5 : 6}>
              {m.code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function PlayerBioPanel({
  age, birthDate, height, weight, country, flag, natlHref,
  teamName, teamLogo, leagueLabel, teamHref, valueEur, valueKrw, recentChg,
  positions, posCode,
}: {
  age: number | null;
  birthDate: string | null;
  height: string | null;
  weight: string | null;
  country: string | null;
  flag: string | null;
  natlHref: string | null;
  teamName: string;
  teamLogo: string | null;
  leagueLabel: string | null;
  teamHref: string | null;
  valueEur: number | null;
  valueKrw: string | null;
  recentChg: number | null;
  positions: { primary: PosCode; others: PosCode[] } | null; // 라인업 집계 (있으면 우선)
  posCode: string | null; // coarse G/D/M/F 폴백
}) {
  // 구체 포지션 우선, 없으면 coarse 폴백
  const coarse = posCode ? COARSE[posCode] : null;
  const primary: PosCode | null = positions?.primary ?? coarse?.code ?? null;
  const others: PosCode[] = positions?.others ?? [];
  const primaryLabel = positions ? POS_KO[positions.primary] : coarse?.label ?? null;

  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none overflow-hidden grid sm:grid-cols-[1fr_auto]">
      {/* 왼쪽 — 정보 */}
      <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-4 content-start">
        {age != null && (
          <InfoCell label="나이">{age}세{birthDate ? <span className="ml-1 text-xs font-normal text-neutral-400">{birthDate}</span> : null}</InfoCell>
        )}
        {height && (
          <InfoCell label="신체">{height.replace(/\s*cm/i, "")}cm{weight ? ` · ${weight.replace(/\s*kg/i, "")}kg` : ""}</InfoCell>
        )}
        {country && (
          <InfoCell label="국가">
            <span className="inline-flex items-center gap-1.5">
              {flag && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={flag} alt="" className="w-5 h-3.5 object-cover rounded-[1px]" />
              )}
              {natlHref ? <Link href={natlHref} prefetch={false} className="hover:underline">{country}</Link> : country}
            </span>
          </InfoCell>
        )}
        <InfoCell label="소속">
          <span className="inline-flex items-center gap-1.5">
            {teamLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={teamLogo} alt="" className="w-5 h-5 object-contain" />
            )}
            {teamHref ? <Link href={teamHref} className="hover:underline truncate">{teamName}</Link> : <span className="truncate">{teamName}</span>}
          </span>
        </InfoCell>
        {valueEur != null && (
          <div className="col-span-2 pt-1 border-t border-black/5 dark:border-white/10">
            <div className="text-xs text-neutral-400 mb-0.5">현재 시장가치</div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-black text-cyan-600 dark:text-cyan-400 tabular-nums">€{valueEur}M</span>
              {valueKrw && <span className="text-xs text-neutral-500 tabular-nums">{valueKrw}</span>}
              {recentChg != null && (
                <span className={`text-xs font-semibold tabular-nums ${recentChg >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {recentChg >= 0 ? "▲" : "▼"} {Math.abs(recentChg)}% <span className="text-neutral-400 font-normal">최근</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 오른쪽 — 포지션 */}
      {primary && (
        <div className="p-5 sm:border-l border-t sm:border-t-0 border-black/5 dark:border-white/10 flex gap-4 sm:w-[280px]">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="text-sm font-bold text-neutral-500">포지션</div>
            <div>
              <div className="text-xs text-neutral-400">선호</div>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[11px] font-bold">{primary}</span>
                {primaryLabel && <span className="text-base font-bold">{primaryLabel}</span>}
              </div>
            </div>
            {others.length > 0 && (
              <div>
                <div className="text-xs text-neutral-400">뛸 수 있는</div>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {others.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/[0.08] text-xs font-semibold">
                      <span className="text-neutral-500">{c}</span>
                      <span className="text-neutral-400 font-normal">{POS_KO[c]}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="w-[92px] shrink-0">
            <MiniPitch primary={primary} others={others} />
          </div>
        </div>
      )}
    </div>
  );
}
