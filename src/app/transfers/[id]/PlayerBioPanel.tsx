// 선수 헤더 바이오 패널 — FotMob식 2열(정보 왼쪽 + 포지션 오른쪽 미니 피치).
// 포지션은 현재 coarse(G/D/M/F) 단일 = "기본"만. 세부 다중 포지션(기타)은 좌표 집계 데이터 확보 후.

import Link from "next/link";
import type { ReactNode } from "react";

// coarse 포지션 → 한글 라벨 + 미니 피치 좌표(x,y: 0~100, 하단=자기 골문). 세부 포지션 데이터 생기면 교체.
const POS_META: Record<string, { label: string; x: number; y: number }> = {
  F: { label: "공격수", x: 50, y: 22 },
  M: { label: "미드필더", x: 50, y: 50 },
  D: { label: "수비수", x: 50, y: 76 },
  G: { label: "골키퍼", x: 50, y: 92 },
};

function InfoCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-lg font-bold tabular-nums truncate">{children}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}

function MiniPitch({ codes }: { codes: string[] }) {
  // codes: 표시할 coarse 포지션 코드 목록(첫 번째=기본). 현재는 1개.
  const primary = codes[0];
  return (
    <svg viewBox="0 0 100 130" className="w-full h-full" role="img" aria-label="포지션">
      <rect x="1" y="1" width="98" height="128" rx="4" className="fill-neutral-100 dark:fill-white/[0.05] stroke-black/10 dark:stroke-white/10" strokeWidth="0.6" />
      {/* 하프라인 + 센터서클 */}
      <line x1="1" y1="65" x2="99" y2="65" className="stroke-black/10 dark:stroke-white/10" strokeWidth="0.5" />
      <circle cx="50" cy="65" r="11" className="fill-none stroke-black/10 dark:stroke-white/10" strokeWidth="0.5" />
      {/* 상단/하단 박스 */}
      <rect x="30" y="1" width="40" height="16" className="fill-none stroke-black/10 dark:stroke-white/10" strokeWidth="0.5" />
      <rect x="30" y="113" width="40" height="16" className="fill-none stroke-black/10 dark:stroke-white/10" strokeWidth="0.5" />
      {codes.map((code, i) => {
        const m = POS_META[code];
        if (!m) return null;
        const isPrimary = code === primary;
        // y는 0~100 스케일 → 130 뷰박스로 환산
        const cy = (m.y / 100) * 130;
        return (
          <g key={code + i}>
            <circle cx={m.x} cy={cy} r={isPrimary ? 11 : 8} className={isPrimary ? "fill-rose-500" : "fill-neutral-400 dark:fill-neutral-500"} />
            <text x={m.x} y={cy} textAnchor="middle" dominantBaseline="central" className="fill-white font-bold" fontSize={isPrimary ? 8 : 6.5}>
              {code === "F" ? "FW" : code === "M" ? "MF" : code === "D" ? "DF" : "GK"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function PlayerBioPanel({
  age, birthDate, height, weight, country, flag, natlHref,
  teamName, teamLogo, leagueLabel, teamHref, valueEur, valueKrw, recentChg, posCode,
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
  posCode: string | null; // coarse G/D/M/F
}) {
  const pm = posCode ? POS_META[posCode] : null;

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
      {pm && (
        <div className="p-5 sm:border-l border-t sm:border-t-0 border-black/5 dark:border-white/10 flex gap-4 sm:w-[260px]">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-neutral-500 mb-3">포지션</div>
            <div className="text-xs text-neutral-400">기본</div>
            <div className="text-lg font-bold">{pm.label}</div>
          </div>
          <div className="w-[88px] shrink-0">
            <MiniPitch codes={posCode ? [posCode] : []} />
          </div>
        </div>
      )}
    </div>
  );
}
