// UFC(MMA) 매치 상세 — 두 파이터 대결 헤더 + Tale of the Tape + 배당.
// 데이터: Match(The Odds 일정/배당) + MmaFighter(api-sports 체급·신체·별명 + ESPN 전적·국기·헤드샷).
// 파이터=Team(league="UFC") 1:1 MmaFighter. /scores UFC 카드 클릭 → /live/ufc/{Match.id}.
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";

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
  } | null;
};

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

export default async function UfcMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();
  const m = await getMatch(id);
  if (!m || m.league !== "UFC") notFound();

  const home = view(m.homeTeam);
  const away = view(m.awayTeam);
  const odds = bestOdds(m.raw, m.homeTeam.name, m.awayTeam.name);
  const isFinished = m.status === "FINISHED";
  const category = home.category ?? away.category;
  const catKo = category ? (WEIGHT_CLASS_KO[category] ?? category) : null;

  const tale = (
    [
      ["전적", home.record, away.record],
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

      {tale.length === 0 && !odds && (
        <p className="text-center text-sm text-neutral-400 py-8">
          아직 상세 데이터가 준비되지 않았습니다. 경기가 다가오면 전적·신체·배당이 채워집니다.
        </p>
      )}
    </div>
  );
}
