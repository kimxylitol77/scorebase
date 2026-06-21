// 시즌별(year-by-year) 기록 테이블 — 기본 컬럼 + advanced(고급스탯) 토글.
// MLB(advanced=true): wRC+/WAR/ISO·FIP/ERA-/WAR 표시. KBO/NPB(false): 전통 스탯만.

import type { HitterSeasonRow, PitcherSeasonRow } from "@/lib/sports/mlb-player-extras";

const v = (x: string | number | undefined | null): string =>
  x == null || x === "" ? "—" : String(x);
const pct = (x: number | undefined): string => (x == null ? "—" : `${x}%`);

function Th({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <th
      className={`px-2.5 py-2 text-right font-medium whitespace-nowrap ${
        accent ? "text-blue-600 dark:text-blue-400" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  accent,
  muted,
}: {
  children: React.ReactNode;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={`px-2.5 py-2 text-right tabular-nums whitespace-nowrap ${
        accent ? "font-bold" : ""
      } ${muted ? "text-neutral-400" : ""}`}
    >
      {children}
    </td>
  );
}

export function HitterSeasonTable({
  rows,
  advanced = false,
}: {
  rows: HitterSeasonRow[];
  advanced?: boolean;
}) {
  if (rows.length === 0)
    return <p className="text-sm text-neutral-500">시즌 기록이 없습니다.</p>;
  const ordered = rows.slice().reverse();
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium sticky left-0 bg-neutral-50 dark:bg-neutral-900">
              시즌
            </th>
            <th className="px-2.5 py-2 text-left font-medium whitespace-nowrap">팀</th>
            <Th>G</Th>
            <Th>PA</Th>
            <Th accent>타율</Th>
            <Th>출루</Th>
            <Th>장타</Th>
            <Th accent>OPS</Th>
            <Th>HR</Th>
            <Th>RBI</Th>
            <Th>R</Th>
            <Th>SB</Th>
            <Th>BB</Th>
            <Th>SO</Th>
            {advanced && (
              <>
                <Th>ISO</Th>
                <Th>BB%</Th>
                <Th>K%</Th>
                <Th accent>wRC+</Th>
                <Th accent>WAR</Th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {ordered.map((r) => (
            <tr key={`${r.season}-${r.teamLabel}`}>
              <td className="px-3 py-2 text-left font-semibold tabular-nums sticky left-0 bg-white dark:bg-neutral-950">
                {r.season}
              </td>
              <td className="px-2.5 py-2 text-left text-xs text-neutral-500 whitespace-nowrap max-w-[120px] truncate">
                {r.teamLabel}
              </td>
              <Td muted>{v(r.g)}</Td>
              <Td muted>{v(r.pa)}</Td>
              <Td accent>{v(r.avg)}</Td>
              <Td>{v(r.obp)}</Td>
              <Td>{v(r.slg)}</Td>
              <Td accent>{v(r.ops)}</Td>
              <Td>{v(r.hr)}</Td>
              <Td>{v(r.rbi)}</Td>
              <Td muted>{v(r.r)}</Td>
              <Td muted>{v(r.sb)}</Td>
              <Td muted>{v(r.bb)}</Td>
              <Td muted>{v(r.so)}</Td>
              {advanced && (
                <>
                  <Td>{v(r.iso)}</Td>
                  <Td muted>{pct(r.bbPct)}</Td>
                  <Td muted>{pct(r.kPct)}</Td>
                  <Td accent>{v(r.wrcPlus)}</Td>
                  <Td accent>{v(r.war)}</Td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PitcherSeasonTable({
  rows,
  advanced = false,
}: {
  rows: PitcherSeasonRow[];
  advanced?: boolean;
}) {
  if (rows.length === 0)
    return <p className="text-sm text-neutral-500">시즌 기록이 없습니다.</p>;
  const ordered = rows.slice().reverse();
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium sticky left-0 bg-neutral-50 dark:bg-neutral-900">
              시즌
            </th>
            <th className="px-2.5 py-2 text-left font-medium whitespace-nowrap">팀</th>
            <Th>G</Th>
            <Th>GS</Th>
            <Th>W</Th>
            <Th>L</Th>
            <Th>SV</Th>
            <Th>IP</Th>
            <Th accent>ERA</Th>
            <Th accent>WHIP</Th>
            <Th>K</Th>
            <Th>BB</Th>
            <Th>HR</Th>
            <Th>K/9</Th>
            {advanced && (
              <>
                <Th accent>FIP</Th>
                <Th>ERA-</Th>
                <Th accent>WAR</Th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {ordered.map((r) => (
            <tr key={`${r.season}-${r.teamLabel}`}>
              <td className="px-3 py-2 text-left font-semibold tabular-nums sticky left-0 bg-white dark:bg-neutral-950">
                {r.season}
              </td>
              <td className="px-2.5 py-2 text-left text-xs text-neutral-500 whitespace-nowrap max-w-[120px] truncate">
                {r.teamLabel}
              </td>
              <Td muted>{v(r.g)}</Td>
              <Td muted>{v(r.gs)}</Td>
              <Td>{v(r.w)}</Td>
              <Td>{v(r.l)}</Td>
              <Td muted>{v(r.sv)}</Td>
              <Td>{v(r.ip)}</Td>
              <Td accent>{v(r.era)}</Td>
              <Td accent>{v(r.whip)}</Td>
              <Td>{v(r.so)}</Td>
              <Td muted>{v(r.bb)}</Td>
              <Td muted>{v(r.hr)}</Td>
              <Td muted>{v(r.k9)}</Td>
              {advanced && (
                <>
                  <Td accent>{v(r.fip)}</Td>
                  <Td muted>{v(r.eraMinus)}</Td>
                  <Td accent>{v(r.war)}</Td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
