// UFC(MMA) 매치 상세 — 두 파이터 대결 헤더 + Tale of the Tape + 배당.
// 데이터: Match(The Odds 일정/배당) + MmaFighter(api-sports 체급·신체·별명 + ESPN 전적·국기·헤드샷).
// 파이터=Team(league="UFC") 1:1 MmaFighter. /scores UFC 카드 클릭 → /live/ufc/{Match.id}.
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { toUfcFighterKo } from "@/lib/sports/ufc-fighter-names";

export const dynamic = "force-dynamic";

const WEIGHT_CLASS_KO: Record<string, string> = {
  Strawweight: "스트로급",
  Flyweight: "플라이급",
  Bantamweight: "밴텀급",
  Featherweight: "페더급",
  Lightweight: "라이트급",
  Welterweight: "웰터급",
  Middleweight: "미들급",
  "Light Heavyweight": "라이트헤비급",
  Heavyweight: "헤비급",
  "Women's Strawweight": "여자 스트로급",
  "Women's Flyweight": "여자 플라이급",
  "Women's Bantamweight": "여자 밴텀급",
  "Women's Featherweight": "여자 페더급",
  Catchweight: "캐치웨이트",
};

const FIGHTER_SELECT = {
  name: true,
  logoUrl: true,
  mmaFighter: {
    select: {
      nameKo: true, nickname: true, category: true, height: true, weight: true,
      reach: true, stance: true, gym: true, record: true, headshot: true, flagUrl: true, photo: true,
      age: true, koRecord: true, subRecord: true, fightHistory: true,
    },
  },
} as const;

type FighterTeam = {
  name: string;
  logoUrl: string | null;
  mmaFighter: {
    nameKo: string | null; nickname: string | null; category: string | null;
    height: string | null; weight: string | null; reach: string | null; stance: string | null;
    gym: string | null; record: string | null; headshot: string | null; flagUrl: string | null; photo: string | null;
    age: number | null; koRecord: string | null; subRecord: string | null; fightHistory: string | null;
  } | null;
};

type FightRow = { d: string; r: string | null; o: string | null; m: string | null; rd: number | null; c: string | null };
function parseHistory(s: string | null | undefined): FightRow[] {
  if (!s) return [];
  try {
    return JSON.parse(s) as FightRow[];
  } catch {
    return [];
  }
}

function view(team: FighterTeam) {
  const f = team.mmaFighter;
  return {
    ko: f?.nameKo ?? toKoreanTeamName(team.name, "UFC"),
    photo: f?.headshot ?? f?.photo ?? team.logoUrl ?? null, // ESPN 헤드샷 우선(안정적) → api-sports → 로고
    flag: f?.flagUrl ?? null,
    record: f?.record ?? null,
    nickname: f?.nickname ?? null,
    category: f?.category ?? null,
    height: f?.height ?? null,
    weight: f?.weight ?? null,
    reach: f?.reach ?? null,
    stance: f?.stance ?? null,
    gym: f?.gym ?? null,
    age: f?.age ?? null,
    koRecord: f?.koRecord ?? null,
    subRecord: f?.subRecord ?? null,
    history: parseHistory(f?.fightHistory),
  };
}

// The Odds API raw(h2h) → 머니라인 최고 배당
function bestOdds(raw: string | null, homeName: string, awayName: string) {
  if (!raw) return null;
  try {
    const ev = JSON.parse(raw) as {
      bookmakers?: Array<{ markets?: Array<{ key?: string; outcomes?: Array<{ name?: string; price?: number }> }> }>;
    };
    const bms = ev.bookmakers ?? [];
    let h = 0, a = 0;
    for (const bm of bms) {
      const h2h = (bm.markets ?? []).find((mk) => mk.key === "h2h");
      if (!h2h) continue;
      const ho = h2h.outcomes?.find((o) => o.name === homeName)?.price;
      const ao = h2h.outcomes?.find((o) => o.name === awayName)?.price;
      if (ho) h = Math.max(h, ho);
      if (ao) a = Math.max(a, ao);
    }
    return h && a ? { home: h, away: a, count: bms.length } : null;
  } catch {
    return null;
  }
}

// ── UFC AI 분석 (머니라인 배당 역산 + 전적·피니시·리치·폼) ──
function recWins(r: string | null): number | null {
  const m = r?.match(/^(\d+)-(\d+)/);
  return m ? Number(m[1]) : null;
}
function finishCount(ko: string | null, sub: string | null): number {
  return Number(ko?.match(/^(\d+)/)?.[1] ?? 0) + Number(sub?.match(/^(\d+)/)?.[1] ?? 0);
}
function reachNum(r: string | null): number | null {
  const m = r?.match(/[\d.]+/);
  return m ? Number(m[0]) : null;
}

type Analysis = { homeProb: number; awayProb: number; favoredKo: string; favProb: number; reasons: string[] };
function mmaAnalysis(
  home: ReturnType<typeof view>,
  away: ReturnType<typeof view>,
  odds: { home: number; away: number } | null,
): Analysis | null {
  if (!odds) return null;
  const ih = 1 / odds.home;
  const ia = 1 / odds.away;
  const sum = ih + ia;
  const homeProb = Math.round((ih / sum) * 100); // 마진 제거 정규화
  const awayProb = 100 - homeProb;
  const homeFav = homeProb >= awayProb;
  const fav = homeFav ? home : away;
  const dog = homeFav ? away : home;
  const reasons: string[] = [];
  const fw = recWins(fav.record);
  const dw = recWins(dog.record);
  if (fw != null && dw != null && fw > dw) reasons.push(`${fav.ko} 전적 우위 (${fav.record} vs ${dog.record})`);
  const ff = finishCount(fav.koRecord, fav.subRecord);
  const df = finishCount(dog.koRecord, dog.subRecord);
  if (ff > df && ff > 0) reasons.push(`${fav.ko} 피니시 능력 우위 (KO+서브 ${ff}회)`);
  else if (df > ff && df > 0) reasons.push(`${dog.ko} 도 피니시 위협 (KO+서브 ${df}회)`);
  const fr = reachNum(fav.reach);
  const dr = reachNum(dog.reach);
  if (fr != null && dr != null && Math.abs(fr - dr) >= 2)
    reasons.push(`${fr > dr ? fav.ko : dog.ko} 리치 우위 (${Math.max(fr, dr)}\" vs ${Math.min(fr, dr)}\")`);
  const fform = fav.history.slice(0, 3).filter((h) => h.r === "W").length;
  if (fform === 3) reasons.push(`${fav.ko} 최근 3연승 상승세`);
  return { homeProb, awayProb, favoredKo: fav.ko, favProb: Math.max(homeProb, awayProb), reasons: reasons.slice(0, 4) };
}

async function getMatch(id: number) {
  return prisma.match.findUnique({
    where: { id },
    select: {
      id: true, league: true, status: true, startTime: true, homeScore: true, awayScore: true, raw: true,
      homeTeam: { select: FIGHTER_SELECT },
      awayTeam: { select: FIGHTER_SELECT },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return { title: "UFC 경기 — 스코어베이스" };
  const m = await getMatch(id);
  if (!m || m.league !== "UFC") return { title: "UFC 경기 — 스코어베이스" };
  const h = view(m.homeTeam).ko;
  const a = view(m.awayTeam).ko;
  return {
    title: `${h} vs ${a} — UFC 분석 | 스코어베이스`,
    description: `${h} vs ${a} UFC 경기. 전적·체급·신체 비교(Tale of the Tape)와 머니라인 배당.`,
  };
}

const kstLabel = (d: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
  }).format(d);

function Headshot({ url, name }: { url: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-full bg-white ring-2 ring-neutral-200 dark:ring-white/10" loading="lazy" />;
  }
  return (
    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-neutral-100 dark:bg-neutral-900 inline-flex items-center justify-center text-2xl font-bold text-neutral-400">
      {name.slice(0, 1)}
    </div>
  );
}

function FighterCol({ f }: { f: ReturnType<typeof view> }) {
  return (
    <div className="flex flex-col items-center text-center gap-1.5">
      <Headshot url={f.photo} name={f.ko} />
      {f.flag && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={f.flag} alt="" className="h-4 w-6 object-contain" loading="lazy" />
      )}
      <div className="font-bold text-sm leading-tight">{f.ko}</div>
      {f.nickname && <div className="text-[11px] italic text-neutral-500">&lsquo;{f.nickname}&rsquo;</div>}
      {f.record && <div className="text-xs font-semibold tabular-nums text-neutral-600 dark:text-neutral-300">{f.record}</div>}
    </div>
  );
}

function FightHistoryCol({ f }: { f: ReturnType<typeof view> }) {
  if (f.history.length === 0) {
    return <div className="text-center text-[11px] text-neutral-400 pt-4">{f.ko}<br />경기 이력 없음</div>;
  }
  return (
    <div>
      <h3 className="text-xs font-bold mb-2 truncate text-center">{f.ko}</h3>
      <div className="space-y-1.5">
        {f.history.map((h, i) => (
          <div key={i} className="flex items-start gap-1.5 text-[11px]">
            <span
              className={`font-black w-3.5 shrink-0 ${
                h.r === "W" ? "text-emerald-600 dark:text-emerald-400" : h.r === "L" ? "text-rose-600 dark:text-rose-400" : "text-neutral-400"
              }`}
            >
              {h.r ?? "-"}
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold text-neutral-700 dark:text-neutral-200">{toUfcFighterKo(h.o)}</div>
              <div className="text-neutral-400 truncate">
                {[h.m, h.rd ? `R${h.rd}` : null, h.d].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function UfcMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();
  const m = await getMatch(id);
  if (!m || m.league !== "UFC") notFound();

  const home = view(m.homeTeam);
  const away = view(m.awayTeam);
  const odds = bestOdds(m.raw, m.homeTeam.name, m.awayTeam.name);
  const analysis = mmaAnalysis(home, away, odds);
  const isFinished = m.status === "FINISHED";
  const category = home.category ?? away.category;
  const catKo = category ? (WEIGHT_CLASS_KO[category] ?? category) : null;

  const tale = (
    [
      ["전적", home.record, away.record],
      ["(T)KO 승-패", home.koRecord, away.koRecord],
      ["서브미션 승-패", home.subRecord, away.subRecord],
      ["나이", home.age != null ? `${home.age}세` : null, away.age != null ? `${away.age}세` : null],
      ["신장", home.height, away.height],
      ["체중", home.weight, away.weight],
      ["리치", home.reach, away.reach],
      ["스탠스", home.stance, away.stance],
      ["소속", home.gym, away.gym],
    ] as Array<[string, string | null, string | null]>
  ).filter(([, h, a]) => h || a);

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 space-y-5">
      <Link href="/scores?sport=mma" className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
        ← UFC 경기 목록
      </Link>

      {/* 대결 헤더 */}
      <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-5">
        <div className="text-center mb-4">
          {catKo && (
            <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              {catKo}
            </span>
          )}
          <div className="text-[11px] text-neutral-400 mt-0.5">{kstLabel(m.startTime)} KST</div>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          <FighterCol f={home} />
          <div className="flex flex-col items-center justify-center pt-7">
            {isFinished && m.homeScore != null && m.awayScore != null ? (
              <div className="text-xl font-black tabular-nums">{m.homeScore}:{m.awayScore}</div>
            ) : (
              <div className="text-base font-bold text-neutral-300 dark:text-neutral-600">VS</div>
            )}
          </div>
          <FighterCol f={away} />
        </div>
      </div>

      {/* AI 분석 — 배당 역산 승률 + 전적·통계 근거 */}
      {analysis && (
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-5">
          <h2 className="text-center text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">AI 분석</h2>
          <div className="flex items-center gap-2 text-xs font-bold mb-2">
            <span className="w-9 text-right tabular-nums text-blue-600 dark:text-blue-400">{analysis.homeProb}%</span>
            <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800 flex">
              <div style={{ width: `${analysis.homeProb}%` }} className="bg-blue-500" />
              <div style={{ width: `${analysis.awayProb}%` }} className="bg-rose-500" />
            </div>
            <span className="w-9 tabular-nums text-rose-600 dark:text-rose-400">{analysis.awayProb}%</span>
          </div>
          <div className="text-center text-sm font-bold mb-2">
            예상 우세: {analysis.favoredKo} <span className="text-neutral-400">({analysis.favProb}%)</span>
          </div>
          {analysis.reasons.length > 0 && (
            <ul className="text-[12px] text-neutral-500 dark:text-neutral-400 space-y-0.5 list-disc list-inside">
              {analysis.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-neutral-400 mt-2.5 text-center">머니라인 배당 역산 + 전적·통계 기반 (참고용)</p>
        </div>
      )}

      {/* Tale of the Tape */}
      {tale.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-5">
          <h2 className="text-center text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">Tale of the Tape</h2>
          <div className="space-y-2">
            {tale.map(([label, h, a]) => (
              <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
                <span className="text-right font-semibold tabular-nums">{h ?? "—"}</span>
                <span className="text-[10px] uppercase tracking-wider text-neutral-400 w-12 text-center">{label}</span>
                <span className="text-left font-semibold tabular-nums">{a ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 머니라인 배당 */}
      {odds && (
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-5">
          <h2 className="text-center text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">
            머니라인 · 최고 배당 ({odds.count}개사)
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-neutral-50 dark:bg-white/5 p-3 text-center">
              <div className="text-xs text-neutral-500 truncate">{home.ko}</div>
              <div className="text-lg font-black tabular-nums">{odds.home.toFixed(2)}</div>
            </div>
            <div className="rounded-xl bg-neutral-50 dark:bg-white/5 p-3 text-center">
              <div className="text-xs text-neutral-500 truncate">{away.ko}</div>
              <div className="text-lg font-black tabular-nums">{odds.away.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* 최근 경기 (Fight History) — ESPN athlete events */}
      {(home.history.length > 0 || away.history.length > 0) && (
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-5">
          <h2 className="text-center text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">최근 경기 (Fight History)</h2>
          <div className="grid grid-cols-2 gap-4">
            <FightHistoryCol f={home} />
            <FightHistoryCol f={away} />
          </div>
        </div>
      )}

      {tale.length === 0 && !odds && home.history.length === 0 && away.history.length === 0 && (
        <p className="text-center text-sm text-neutral-400 py-8">
          아직 상세 데이터가 준비되지 않았습니다. 경기가 다가오면 전적·신체·배당이 채워집니다.
        </p>
      )}
    </div>
  );
}
