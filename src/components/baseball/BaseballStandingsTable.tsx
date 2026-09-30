// 야구 리그 페이지 순위 탭 — MLB 는 MLB 공식 API(지구·리그·와일드카드), KBO·NPB 는 TheSports 공식 표(baseball-table).
// MLB: 지구 6표 / 아메리칸·내셔널 / 전체 전환, 지구 1위(초록)·와일드카드 3장(주황). NPB: 센트럴·퍼시픽 상위 3팀(클라이맥스 시리즈), KBO: 상위 5팀.
// 승률 정렬·게임차 표기(야구 관례). 탭 전환은 NHL 과 같은 StandingsViewTabs.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { fetchBaseballTable, npbDivisionKo } from "@/lib/sports/thesports/baseball-table";
import StandingsViewTabs from "@/components/nhl/StandingsViewTabs";

interface Row {
  key: string;
  teamId: number | null;
  name: string;
  logo: string | null;
  w: number;
  l: number;
  d?: number;
  pct: number;
  gb: string;
  mark?: "lead" | "wild" | "po";
  last10?: string;
  streak?: string;
}

const MLB_DIV: Record<number, { ko: string; league: 103 | 104; order: number }> = {
  201: { ko: "AL 동부", league: 103, order: 1 },
  202: { ko: "AL 중부", league: 103, order: 2 },
  200: { ko: "AL 서부", league: 103, order: 3 },
  204: { ko: "NL 동부", league: 104, order: 4 },
  205: { ko: "NL 중부", league: 104, order: 5 },
  203: { ko: "NL 서부", league: 104, order: 6 },
};
const MLB_LEAGUE_KO: Record<number, string> = { 103: "아메리칸리그", 104: "내셔널리그" };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const pctLabel = (p: number) => (p >= 1 ? "1.000" : p.toFixed(3).replace(/^0/, ""));

function Table({ rows, title, showExtra }: { rows: Row[]; title?: string; showExtra?: boolean }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      {title && <div className="px-4 pt-3 pb-1 text-xs font-bold text-neutral-700 dark:text-neutral-200">{title}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500 whitespace-nowrap dark:bg-white/[0.06]">
            <tr>
              <th className="w-8 px-2 py-2 text-right font-medium">#</th>
              <th className="px-2 py-2 text-left font-medium">팀</th>
              <th className="px-1.5 py-2 text-right font-medium">승</th>
              {rows.some((r) => r.d) && <th className="px-1.5 py-2 text-right font-medium">무</th>}
              <th className="px-1.5 py-2 text-right font-medium">패</th>
              <th className="px-1.5 py-2 text-right font-medium">승률</th>
              <th className="px-1.5 py-2 text-right font-medium">게임차</th>
              {showExtra && <th className="hidden px-1.5 py-2 text-right font-medium sm:table-cell">최근10</th>}
              {showExtra && <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">연속</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.map((r, i) => (
              <tr key={r.key} className="hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                <td
                  className={`px-2 py-2 text-right font-semibold tabular-nums text-neutral-500 ${
                    r.mark === "lead" || r.mark === "po"
                      ? "shadow-[inset_3px_0_0_rgb(16_185_129)]"
                      : r.mark === "wild"
                        ? "shadow-[inset_3px_0_0_rgb(245_158_11)]"
                        : ""
                  }`}
                >
                  {i + 1}
                </td>
                <td className="max-w-[9.5rem] truncate px-2 py-2 sm:max-w-none">
                  {r.teamId ? (
                    <Link href={`/teams/${r.teamId}`} prefetch={false} className="group flex min-w-0 items-center gap-2">
                      {r.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.logo} alt="" width={22} height={22} loading="lazy" className="h-[22px] w-[22px] shrink-0 object-contain" />
                      ) : (
                        <span className="h-[22px] w-[22px] shrink-0 rounded-sm bg-neutral-200 dark:bg-neutral-700" />
                      )}
                      <span className="truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">{r.name}</span>
                    </Link>
                  ) : (
                    <span className="truncate">{r.name}</span>
                  )}
                </td>
                <td className="px-1.5 py-2 text-right tabular-nums">{r.w}</td>
                {rows.some((x) => x.d) && <td className="px-1.5 py-2 text-right tabular-nums">{r.d ?? 0}</td>}
                <td className="px-1.5 py-2 text-right tabular-nums">{r.l}</td>
                <td className="px-1.5 py-2 text-right font-bold tabular-nums">{pctLabel(r.pct)}</td>
                <td className="px-1.5 py-2 text-right tabular-nums text-neutral-500">{r.gb}</td>
                {showExtra && <td className="hidden px-1.5 py-2 text-right tabular-nums text-neutral-500 sm:table-cell">{r.last10 ?? "-"}</td>}
                {showExtra && (
                  <td className={`hidden px-2 py-2 text-right tabular-nums sm:table-cell ${r.streak?.startsWith("W") ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                    {r.streak ? r.streak.replace(/^[WL]/, "") + (r.streak.startsWith("W") ? "연승" : "연패") : "-"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 승률 순 정렬 + 그룹 1위 기준 게임차 */
function withGb(rows: Row[]): Row[] {
  const s = [...rows].sort((a, b) => b.pct - a.pct || b.w - a.w);
  const top = s[0];
  return s.map((r) => {
    const gb = top ? (top.w - r.w + (r.l - top.l)) / 2 : 0;
    return { ...r, gb: gb <= 0 ? "-" : gb.toFixed(1) };
  });
}

interface MlbTeamRecord {
  team: { id: number; name: string };
  wins: number;
  losses: number;
  winningPercentage: string;
  gamesBack: string;
  divisionRank: string;
  wildCardRank?: string;
  divisionLeader?: boolean;
  streak?: { streakCode?: string };
  records?: { splitRecords?: Array<{ type: string; wins: number; losses: number }> };
}

async function mlbView() {
  const now = new Date();
  const season = now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  let records: Array<{ division: { id: number }; league: { id: number }; teamRecords: MlbTeamRecord[] }> = [];
  try {
    const r = await fetch(
      `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason&hydrate=team`,
      { next: { revalidate: 600 } },
    );
    if (r.ok) records = ((await r.json()) as { records?: typeof records }).records ?? [];
  } catch { /* 아래 빈 안내 */ }
  if (records.length === 0) return null;

  const teams = await prisma.team.findMany({ where: { league: "MLB" }, select: { id: true, name: true, logoUrl: true } });
  const byName = new Map(teams.map((t) => [norm(t.name), t]));
  const find = (name: string) =>
    byName.get(norm(name)) ?? teams.find((t) => norm(t.name).endsWith(norm(name.split(" ").pop() ?? "")) && norm(name.split(" ").pop() ?? "").length > 3);

  const all: Array<Row & { div: number; league: number }> = [];
  for (const rec of records) {
    const div = MLB_DIV[rec.division.id];
    if (!div) continue;
    for (const t of rec.teamRecords) {
      const db = find(t.team.name);
      const l10 = t.records?.splitRecords?.find((x) => x.type === "lastTen");
      const wc = Number(t.wildCardRank ?? 99);
      all.push({
        key: String(t.team.id),
        teamId: db?.id ?? null,
        name: db ? toKoreanTeamName(db.name, "MLB") || db.name : t.team.name,
        logo: db?.logoUrl ?? null,
        w: t.wins,
        l: t.losses,
        pct: Number(t.winningPercentage) || (t.wins + t.losses > 0 ? t.wins / (t.wins + t.losses) : 0),
        gb: t.gamesBack,
        mark: t.divisionLeader || t.divisionRank === "1" ? "lead" : wc <= 3 ? "wild" : undefined,
        last10: l10 ? `${l10.wins}-${l10.losses}` : undefined,
        streak: t.streak?.streakCode,
        div: rec.division.id,
        league: rec.league.id,
      });
    }
  }
  const divs = Object.entries(MLB_DIV).sort((a, b) => a[1].order - b[1].order);
  return (
    <StandingsViewTabs
      views={[
        {
          key: "div", label: "지구",
          node: (
            <div className="grid gap-4 lg:grid-cols-2">
              {divs.map(([id, d]) => (
                <Table key={id} title={d.ko} rows={withGb(all.filter((r) => r.div === Number(id))).map((r) => ({ ...r }))} showExtra />
              ))}
            </div>
          ),
        },
        {
          key: "league", label: "AL·NL",
          node: (
            <div className="grid gap-4 lg:grid-cols-2">
              {[103, 104].map((lg) => (
                <Table key={lg} title={MLB_LEAGUE_KO[lg]} rows={withGb(all.filter((r) => r.league === lg))} showExtra />
              ))}
            </div>
          ),
        },
        { key: "all", label: "전체", node: <Table rows={withGb(all).map((r) => ({ ...r, mark: undefined }))} showExtra /> },
      ]}
    />
  );
}

async function tsView(league: "KBO" | "NPB") {
  const rows = await fetchBaseballTable(league);
  if (rows.length === 0) return null;
  const teams = await prisma.team.findMany({ where: { id: { in: rows.map((r) => r.ourTeamId) } }, select: { id: true, name: true, logoUrl: true } });
  const tm = new Map(teams.map((t) => [t.id, t]));
  const toRow = (r: (typeof rows)[number]): Row => {
    const t = tm.get(r.ourTeamId);
    return {
      key: String(r.ourTeamId), teamId: r.ourTeamId,
      name: t ? toKoreanTeamName(t.name, league) || t.name : `팀 ${r.ourTeamId}`,
      logo: t?.logoUrl ?? null,
      w: r.wins, l: r.losses, d: r.draws,
      pct: r.wins + r.losses > 0 ? r.wins / (r.wins + r.losses) : 0,
      gb: "-",
    };
  };
  // 포스트시즌권 — KBO 상위 5팀(와일드카드 결정전 포함), NPB 리그별 상위 3팀(클라이맥스 시리즈)
  const poCut = league === "KBO" ? 5 : 3;
  const mark = (list: Row[]) => list.map((r, i) => ({ ...r, mark: i < poCut ? ("po" as const) : undefined }));
  if (league === "KBO") return <Table rows={mark(withGb(rows.map(toRow)))} />;
  const groups = [...new Set(rows.map((r) => r.division))].sort((a, b) => npbDivisionKo(a).localeCompare(npbDivisionKo(b)));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((g) => (
        <Table key={g} title={`${npbDivisionKo(g) || g} 리그`} rows={mark(withGb(rows.filter((r) => r.division === g).map(toRow)))} />
      ))}
    </div>
  );
}

export default async function BaseballStandingsTable({ league }: { league: "MLB" | "KBO" | "NPB" }) {
  const body = league === "MLB" ? await mlbView() : await tsView(league);
  if (!body) {
    return <p className="py-12 text-center text-sm text-neutral-500">순위 데이터 수집 중입니다. 잠시 후 다시 확인해주세요.</p>;
  }
  return (
    <div className="space-y-2">
      {body}
      <p className="text-[11px] text-neutral-400 break-keep">
        승률 = 승 ÷ (승 + 패), 무승부 제외 ·{" "}
        {league === "MLB" ? (
          <>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">초록</span> 지구 1위 ·{" "}
            <span className="font-semibold text-amber-600 dark:text-amber-400">주황</span> 리그별 와일드카드 3장 · MLB 공식 기록
          </>
        ) : (
          <>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">초록</span>{" "}
            {league === "KBO" ? "포스트시즌 진출권(상위 5팀)" : "리그별 클라이맥스 시리즈 진출권(상위 3팀)"} · TheSports 공식 기록
          </>
        )}
      </p>
    </div>
  );
}
