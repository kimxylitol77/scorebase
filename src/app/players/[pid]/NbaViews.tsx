// NBA 선수 상세 — 축구·야구식 4탭(개요/시즌기록/경기/스플릿).
// 기본정보 BALLDONTLIE · 통계/시즌별/스플릿/수상 ESPN(athlete API) · 연봉/생일/출생지 TheSports.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { fetchNbaPlayer } from "@/lib/sports/balldontlie";
import {
  fetchNbaEspnStats,
  fetchNbaEspnSeasons,
  fetchNbaEspnSplits,
  fetchNbaEspnAwards,
  type NbaSeasonRow,
  type NbaSplits,
  type NbaSplitRow,
} from "@/lib/sports/espn-nba-player";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { lookupNbaPlayer } from "@/lib/sports/nba-players";
import PlayerTabs from "./PlayerTabs";

/* ---------- 공통 헬퍼 ---------- */

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg px-3 py-2 ${
        accent
          ? "bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30"
          : "bg-neutral-50 dark:bg-neutral-900"
      }`}
    >
      <div className="text-[10px] text-neutral-500">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

const n1 = (x: number) => x.toFixed(1);
const pc = (x: number) => `${x.toFixed(1)}%`; // ESPN % 는 이미 0~100

// NBA 선수 연봉(USD) → "$52.6M · ₩726억". TheSports player.salary.
function fmtUsdKrw(usd: number): string {
  const eok = (usd * 1380) / 1e8;
  const krw = eok >= 10000 ? `${(eok / 10000).toFixed(2)}조` : `${Math.round(eok).toLocaleString()}억`;
  return `$${(usd / 1e6).toFixed(1)}M · ₩${krw}`;
}

// teamSlug("los-angeles-lakers") → 한글 팀명(없으면 title-case 영문).
function slugToTeam(slug: string): string {
  if (!slug) return "—";
  const full = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return toKoreanTeamName(full) || full;
}

type Tab = { key: string; label: string; content: ReactNode };
const tabsOf = (arr: (Tab | false | null | undefined)[]): Tab[] =>
  arr.filter((t): t is Tab => Boolean(t));

const hasNbaSplits = (s: NbaSplits): boolean =>
  Boolean(s.home || s.away || s.wins || s.losses || s.byMonth.length > 0);

/* ---------- 시즌기록 탭 ---------- */

function Th({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <th className={`px-2.5 py-2 text-right font-medium whitespace-nowrap ${accent ? "text-blue-600 dark:text-blue-400" : ""}`}>
      {children}
    </th>
  );
}
function Td({ children, accent, muted }: { children: ReactNode; accent?: boolean; muted?: boolean }) {
  return (
    <td className={`px-2.5 py-2 text-right tabular-nums whitespace-nowrap ${accent ? "font-bold" : ""} ${muted ? "text-neutral-400" : ""}`}>
      {children}
    </td>
  );
}

function SeasonCells({ r }: { r: NbaSeasonRow }) {
  return (
    <>
      <Td muted>{r.gp || "—"}</Td>
      <Td muted>{n1(r.min)}</Td>
      <Td accent>{n1(r.pts)}</Td>
      <Td>{n1(r.reb)}</Td>
      <Td>{n1(r.ast)}</Td>
      <Td muted>{n1(r.stl)}</Td>
      <Td muted>{n1(r.blk)}</Td>
      <Td>{pc(r.fgPct)}</Td>
      <Td>{pc(r.fg3Pct)}</Td>
      <Td muted>{pc(r.ftPct)}</Td>
    </>
  );
}

function NbaSeasonTable({ rows, career }: { rows: NbaSeasonRow[]; career: NbaSeasonRow | null }) {
  if (rows.length === 0) return <p className="text-sm text-neutral-500">시즌 기록이 없습니다.</p>;
  const ordered = rows.slice().reverse(); // 최신 시즌이 위로
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium sticky left-0 bg-neutral-50 dark:bg-neutral-900">시즌</th>
            <th className="px-2.5 py-2 text-left font-medium whitespace-nowrap">팀</th>
            <Th>GP</Th>
            <Th>MIN</Th>
            <Th accent>PTS</Th>
            <Th>REB</Th>
            <Th>AST</Th>
            <Th>STL</Th>
            <Th>BLK</Th>
            <Th>FG%</Th>
            <Th>3P%</Th>
            <Th>FT%</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {ordered.map((r, i) => (
            <tr key={`${r.year}-${r.teamSlug}-${i}`}>
              <td className="px-3 py-2 text-left font-semibold tabular-nums sticky left-0 bg-white dark:bg-neutral-950">{r.label}</td>
              <td className="px-2.5 py-2 text-left text-xs text-neutral-500 whitespace-nowrap max-w-[140px] truncate">{slugToTeam(r.teamSlug)}</td>
              <SeasonCells r={r} />
            </tr>
          ))}
          {career && (
            <tr className="bg-neutral-50 dark:bg-neutral-900/50 font-semibold">
              <td className="px-3 py-2 text-left sticky left-0 bg-neutral-50 dark:bg-neutral-900/50">통산</td>
              <td className="px-2.5 py-2 text-left text-xs text-neutral-400">평균</td>
              <SeasonCells r={career} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 스플릿 탭 ---------- */

function SplitCard({ row }: { row: NbaSplitRow | null }) {
  if (!row) return null;
  const cells = [
    { k: "PTS", val: n1(row.pts) },
    { k: "REB", val: n1(row.reb) },
    { k: "AST", val: n1(row.ast) },
  ];
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3.5">
      <div className="text-xs font-bold text-neutral-500 mb-2.5">
        {row.label} <span className="font-normal text-neutral-400">{row.gp}경기</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {cells.map((c, i) => (
          <div key={c.k}>
            <div className="text-[10px] text-neutral-400">{c.k}</div>
            <div className={`text-base font-black tabular-nums ${i === 0 ? "text-blue-600 dark:text-blue-400" : ""}`}>{c.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NbaSplitsView({ splits }: { splits: NbaSplits }) {
  const hasHA = splits.home || splits.away;
  const hasWL = splits.wins || splits.losses;
  return (
    <div className="space-y-5">
      {hasHA && (
        <div>
          <div className="text-xs font-bold text-neutral-500 mb-2">홈 / 원정</div>
          <div className="grid grid-cols-2 gap-3">
            <SplitCard row={splits.home} />
            <SplitCard row={splits.away} />
          </div>
        </div>
      )}
      {hasWL && (
        <div>
          <div className="text-xs font-bold text-neutral-500 mb-2">승 / 패</div>
          <div className="grid grid-cols-2 gap-3">
            <SplitCard row={splits.wins} />
            <SplitCard row={splits.losses} />
          </div>
        </div>
      )}
      {splits.byMonth.length > 0 && (
        <div>
          <div className="text-xs font-bold text-neutral-500 mb-2">월별 추이</div>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">월</th>
                  <th className="px-3 py-2 text-right font-medium">PTS</th>
                  <th className="px-3 py-2 text-right font-medium">REB</th>
                  <th className="px-3 py-2 text-right font-medium">AST</th>
                  <th className="px-3 py-2 text-right font-medium">FG%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {splits.byMonth.map((r) => (
                  <tr key={r.label}>
                    <td className="px-3 py-2 text-left font-semibold">{r.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{n1(r.pts)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{n1(r.reb)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{n1(r.ast)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{pc(r.fgPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 경기 탭 ---------- */

type RecentGame = Awaited<ReturnType<typeof fetchNbaEspnStats>>["recent"][number];

function NbaRecentGames({ games }: { games: RecentGame[] }) {
  if (games.length === 0) return <p className="text-sm text-neutral-500">경기 기록이 없습니다.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">일자</th>
            <th className="text-left px-2 py-2 font-medium">매치</th>
            <th className="text-right px-2 py-2 font-medium">MIN</th>
            <th className="text-right px-2 py-2 font-medium">PTS</th>
            <th className="text-right px-2 py-2 font-medium">REB</th>
            <th className="text-right px-2 py-2 font-medium">AST</th>
            <th className="text-right px-2 py-2 font-medium">STL</th>
            <th className="text-right px-3 py-2 font-medium">BLK</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {games.map((g) => (
            <tr key={g.id}>
              <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">{g.game?.date?.slice(0, 10) ?? "—"}</td>
              <td className="px-2 py-2 truncate">
                {g.game ? `${g.game.visitorTeam.abbr} ${g.game.visitorTeamScore} - ${g.game.homeTeamScore} ${g.game.homeTeam.abbr}` : "—"}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{g.min}</td>
              <td className="px-2 py-2 text-right tabular-nums font-semibold">{g.pts}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.reb}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.ast}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.stl}</td>
              <td className="px-3 py-2 text-right tabular-nums">{g.blk}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================
 * 메인 뷰
 * ==========================================================*/

export async function NbaPlayerView({ pid }: { pid: string }) {
  const id = Number(pid);
  if (!Number.isFinite(id)) notFound();
  const now = new Date();
  const m = now.getUTCMonth() + 1;
  const season = m >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

  const profile = await fetchNbaPlayer(id);
  if (!profile) notFound();
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const nameKo = toKoreanPlayerName(fullName) || fullName;
  const teamKo = profile.team ? toKoreanTeamName(profile.team.fullName) || profile.team.fullName : "";
  const tsp = lookupNbaPlayer(fullName); // ESPN headshot + TheSports 프로필
  const photo = tsp?.photo;
  const espnId = tsp?.espnId;

  // 통계는 BDL plan 401 → 무료 ESPN(시즌평균·시즌별·스플릿·수상)으로 우회.
  const [{ avg, recent }, { seasons, career }, splits, awards] = await Promise.all([
    espnId ? fetchNbaEspnStats(espnId) : Promise.resolve({ avg: null, recent: [] }),
    espnId ? fetchNbaEspnSeasons(espnId) : Promise.resolve({ seasons: [], career: null }),
    espnId ? fetchNbaEspnSplits(espnId) : Promise.resolve(null),
    espnId ? fetchNbaEspnAwards(espnId) : Promise.resolve([]),
  ]);

  const birth = tsp?.birthday ? new Date(tsp.birthday * 1000) : null;
  const age = birth ? Math.floor((Date.now() - birth.getTime()) / 31557600000) : null;
  const birthStr = birth
    ? `${birth.getUTCFullYear()}.${String(birth.getUTCMonth() + 1).padStart(2, "0")}.${String(birth.getUTCDate()).padStart(2, "0")}`
    : null;

  const overview = (
    <>
      {avg ? (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
            {season} 시즌 평균 ({avg.gamesPlayed}경기)
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="PTS" value={avg.pts.toFixed(1)} accent />
            <Stat label="REB" value={avg.reb.toFixed(1)} accent />
            <Stat label="AST" value={avg.ast.toFixed(1)} accent />
            <Stat label="STL" value={avg.stl.toFixed(1)} />
            <Stat label="BLK" value={avg.blk.toFixed(1)} />
            <Stat label="MIN" value={avg.min} />
            <Stat label="FG%" value={(avg.fgPct * 100).toFixed(1)} />
            <Stat label="3P%" value={(avg.fg3Pct * 100).toFixed(1)} />
            <Stat label="FT%" value={(avg.ftPct * 100).toFixed(1)} />
            <Stat label="TO" value={avg.turnover.toFixed(1)} />
          </div>
        </section>
      ) : (
        <p className="text-sm text-neutral-500">{season} 시즌 통계가 없습니다.</p>
      )}

      {career && (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">통산 평균</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="PTS" value={n1(career.pts)} accent />
            <Stat label="REB" value={n1(career.reb)} accent />
            <Stat label="AST" value={n1(career.ast)} accent />
            <Stat label="STL" value={n1(career.stl)} />
            <Stat label="BLK" value={n1(career.blk)} />
            <Stat label="GP" value={String(career.gp)} />
            <Stat label="FG%" value={pc(career.fgPct)} />
            <Stat label="3P%" value={pc(career.fg3Pct)} />
            <Stat label="FT%" value={pc(career.ftPct)} />
          </div>
        </section>
      )}

      {awards.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">수상 이력</h2>
          <div className="flex flex-wrap gap-2">
            {awards.map((a) => (
              <span
                key={a.name}
                className="px-2.5 py-1 rounded-md text-sm border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300"
              >
                {a.name}
                {a.count && a.count !== "1x" ? ` ${a.count}` : ""}
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header className="space-y-3">
        <Link href="/leagues/NBA" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          ← NBA
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={nameKo} className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 object-cover object-top" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 flex items-center justify-center text-2xl font-bold text-neutral-400">
              {profile.firstName[0]}
              {profile.lastName[0]}
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{nameKo}</h1>
              {profile.position && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {profile.position}
                </span>
              )}
              {profile.jerseyNumber && <span className="text-sm text-neutral-500">#{profile.jerseyNumber}</span>}
              {age != null && <span className="text-sm text-neutral-500">{age}세</span>}
            </div>
            <div className="text-sm text-neutral-500">
              {teamKo ? `${teamKo} · ` : ""}
              {profile.height ? `${profile.height} · ` : ""}
              {profile.weight ? `${profile.weight} lbs` : ""}
              {profile.country ? ` · ${profile.country}` : ""}
              {tsp?.city ? ` · 출생 ${tsp.city}` : ""}
            </div>
            {tsp?.salary ? (
              <div className="text-sm">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">연봉 {fmtUsdKrw(tsp.salary)}</span>
                {tsp.careerAge ? <span className="text-neutral-400"> · NBA {tsp.careerAge}년차</span> : null}
              </div>
            ) : null}
            <div className="text-[11px] text-neutral-400">
              BALLDONTLIE · ESPN · TheSports · {season} 시즌
              {profile.draftYear ? ` · ${profile.draftYear} 드래프트 ${profile.draftRound}R ${profile.draftNumber}순위` : ""}
              {birthStr ? ` · ${birthStr} 생` : ""}
            </div>
          </div>
        </div>
      </header>

      <PlayerTabs
        tabs={tabsOf([
          { key: "overview", label: "개요", content: overview },
          seasons.length > 0 && {
            key: "seasons",
            label: "시즌기록",
            content: <NbaSeasonTable rows={seasons} career={career} />,
          },
          recent.length > 0 && {
            key: "games",
            label: "경기",
            content: <NbaRecentGames games={recent} />,
          },
          splits && hasNbaSplits(splits) && {
            key: "splits",
            label: "스플릿",
            content: <NbaSplitsView splits={splits} />,
          },
        ])}
      />

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 데이터 출처: 기본정보 BALLDONTLIE · 통계·시즌별·스플릿·수상 ESPN · 연봉·생일·출생지 TheSports.
      </p>
    </article>
  );
}
