// NHL 순위 테이블 — /standings/NHL 페이지 + /leagues/NHL 순위 탭 공용. 공식 API 결과(std)를
// DB 팀(한글명·로고·팀링크)과 매핑해 표로. std 미전달 시 자체 fetch(리그 탭용). 승 2점·연장패 1점.
// 오프시즌(지난 시즌 정규 완료 + 마지막 경기 14일+ 경과)엔 축구 리그처럼 "다음 시즌 개막 대기"로
// 전환 — 지난 시즌 최종 순위는 접기, 개막 일정 확정되면 자동 노출. 개막(새 경기 유입) 시 평시 복귀.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { fetchNhlStandings } from "@/lib/sports/nhl-api";

type Std = NonNullable<Awaited<ReturnType<typeof fetchNhlStandings>>>;

function nhlNormName(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const pad = (n: number) => String(n).padStart(2, "0");

export default async function NhlStandingsTable({ std: stdProp }: { std?: Std | null }) {
  const std = stdProp ?? (await fetchNhlStandings());
  if (!std || std.rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">순위 데이터 수집 중입니다. 잠시 후 다시 확인해주세요.</p>
    );
  }

  // NHL API 팀 ↔ DB Team 매핑 (한글명·로고·팀 링크). 풀네임 일치 우선.
  const dbTeams = await prisma.team.findMany({
    where: { league: "NHL" },
    select: { id: true, name: true, shortName: true, logoUrl: true },
  });
  const findTeam = (row: { name: string; placeName: string; abbrev: string }) => {
    const an = nhlNormName(row.name);
    const common = nhlNormName(row.name.replace(row.placeName, ""));
    const aa = (row.abbrev || "").toLowerCase();
    return dbTeams.find((db) => {
      const dn = nhlNormName(db.name);
      if (dn === an) return true;
      if (common.length > 2 && (dn.includes(common) || common.includes(dn))) return true;
      if (db.shortName && nhlNormName(db.shortName) === nhlNormName(row.abbrev)) return true;
      if (aa && dn.endsWith(aa)) return true;
      return false;
    });
  };

  // 오프시즌 감지 + 개막 일정. 지난 경기 후 14일+ 경과 & 지난 시즌 정규 완료(최대 82경기)면 전환기.
  const now = new Date();
  const [lastFin, upcoming] = await Promise.all([
    prisma.match.findFirst({
      where: { league: "NHL", status: "FINISHED" },
      orderBy: { startTime: "desc" },
      select: { startTime: true },
    }),
    prisma.match.findMany({
      where: { league: "NHL", status: "SCHEDULED" },
      orderBy: { startTime: "asc" },
      take: 6,
      select: {
        id: true,
        startTime: true,
        homeTeam: { select: { name: true, logoUrl: true } },
        awayTeam: { select: { name: true, logoUrl: true } },
      },
    }),
  ]);
  const daysSinceLast = lastFin ? (now.getTime() - lastFin.startTime.getTime()) / 86400_000 : 0;
  const maxGamesPlayed = Math.max(...std.rows.map((r) => r.gamesPlayed));
  const inTransition = daysSinceLast >= 14 && maxGamesPlayed >= 80;

  // 시즌 라벨 — season 은 raw 8자리("20252026"). 없으면 마지막 경기 연도로 폴백.
  const s = std.season;
  const endYear = /^\d{8}$/.test(s)
    ? Number(s.slice(4, 8))
    : lastFin
      ? lastFin.startTime.getUTCFullYear()
      : now.getUTCFullYear();
  const oldLabel = `${endYear - 1}-${pad(endYear % 100)}`;
  const nextLabel = `${endYear}-${pad((endYear + 1) % 100)}`;

  // 순위표(방금 축구 리그와 통일한 스타일) — 평시 본문 + 전환기 접기에서 재사용.
  const tableEl = (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] overflow-x-auto dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.06] text-xs text-neutral-500">
          <tr>
            <th className="text-right px-3 py-2 font-medium w-10">#</th>
            <th className="text-left px-3 py-2 font-medium">팀</th>
            <th className="text-right px-2 py-2 font-medium">경기</th>
            <th className="text-right px-2 py-2 font-medium">승</th>
            <th className="text-right px-2 py-2 font-medium">패</th>
            <th className="text-right px-2 py-2 font-medium">연장패</th>
            <th className="text-right px-2 py-2 font-medium hidden sm:table-cell">득점</th>
            <th className="text-right px-2 py-2 font-medium hidden sm:table-cell">실점</th>
            <th className="text-right px-2 py-2 font-medium hidden sm:table-cell">득실</th>
            <th className="text-right px-3 py-2 font-medium">승점</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {std.rows.map((r, i) => {
            const db = findTeam(r);
            const ko = db ? toKoreanTeamName(db.name, "NHL") : r.name;
            const gd = r.goalDiff;
            return (
              <tr key={r.abbrev} className="hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-neutral-500">{i + 1}</td>
                <td className="px-3 py-2 truncate">
                  {db ? (
                    <Link href={`/teams/${db.id}`} prefetch={false} className="group flex items-center gap-2 min-w-0">
                      {db.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={db.logoUrl} alt="" width={24} height={24} loading="lazy" className="w-6 h-6 object-contain shrink-0 bg-white rounded-sm" />
                      ) : (
                        <div className="w-6 h-6 rounded-sm bg-neutral-200 dark:bg-neutral-700 shrink-0" />
                      )}
                      <span className="truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">{ko}</span>
                    </Link>
                  ) : (
                    <span className="truncate">{ko}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{r.gamesPlayed}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.wins}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.losses}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.otLosses}</td>
                <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{r.goalFor}</td>
                <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{r.goalAgainst}</td>
                <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{gd > 0 ? `+${gd}` : gd}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // 평시 — 시즌 진행 중이면 현재 순위 그대로.
  if (!inTransition) {
    return (
      <div className="space-y-2">
        {tableEl}
        <p className="text-[11px] text-neutral-400">승점 = 승 2점 + 연장·슛아웃 패 1점 · NHL 공식 기록 · 경기 종료 후 자동 갱신</p>
      </div>
    );
  }

  // 전환기 — 다음 시즌 개막 대기. 개막 일정(있으면) + 지난 시즌 최종 순위 접기.
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold text-blue-600 ring-1 ring-blue-500/20 dark:text-blue-400">
          {nextLabel} 시즌
        </span>
        <span className="text-xs text-neutral-400">개막 대기 · 지난 시즌 종료</span>
      </div>

      {upcoming.length > 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] overflow-hidden dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <div className="px-4 py-2.5 text-[11px] font-bold text-neutral-400 border-b border-neutral-100 dark:border-white/10">개막 일정</div>
          <ul className="divide-y divide-neutral-100 dark:divide-white/5">
            {upcoming.map((m) => {
              const kst = new Date(m.startTime.getTime() + 9 * 3600_000);
              const away = toKoreanTeamName(m.awayTeam.name, "NHL") || m.awayTeam.name;
              const home = toKoreanTeamName(m.homeTeam.name, "NHL") || m.homeTeam.name;
              return (
                <li key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="truncate">
                    {away} <span className="text-neutral-400">vs</span> {home}
                  </span>
                  <span className="shrink-0 ml-2 text-[11px] tabular-nums text-neutral-400">
                    {kst.getUTCMonth() + 1}/{kst.getUTCDate()} {kst.getUTCHours()}:{pad(kst.getUTCMinutes())}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-5 text-center text-xs text-neutral-500">
          {nextLabel} 시즌 개막 일정은 확정되면 자동으로 표시됩니다.
        </div>
      )}

      <details className="group rounded-2xl bg-white/60 ring-1 ring-black/5 dark:bg-white/[0.02] dark:ring-white/10">
        <summary className="flex cursor-pointer list-none select-none items-center gap-1.5 px-4 py-3 text-xs font-bold text-neutral-500 transition hover:text-neutral-700 dark:hover:text-neutral-300">
          <span className="text-[10px] transition group-open:rotate-90" aria-hidden>▶</span>
          지난 시즌 최종 순위 <span className="font-normal text-neutral-400">({oldLabel})</span>
        </summary>
        <div className="px-2 pb-3 pt-1">{tableEl}</div>
      </details>

      <p className="text-[11px] text-neutral-400">{nextLabel} 시즌 개막 후 자동으로 실시간 순위로 전환됩니다.</p>
    </div>
  );
}
