// UFC 파이터 상세 — MmaFighter(신체·전적·국적·전투이력) 바이오 + 최근 경기. id=Team(UFC).id(teamId).
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { GOOGLE_NOINDEX } from "@/lib/seo-robots";
import { athleteLd, breadcrumbLd, jsonLdScript } from "@/lib/seo/jsonld";
import { toKoreanTeamName } from "@/lib/team-names";
import { toUfcFighterKo } from "@/lib/sports/ufc-fighter-names";
import AmbientGlow from "@/components/AmbientGlow";

export const revalidate = 3600; // 파이터 프로필은 주간 갱신 → 1시간 캐시로 충분

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
      age: true, citizenship: true, koRecord: true, subRecord: true, fightHistory: true,
    },
  },
} as const;

type FightRow = { d: string; r: string | null; o: string | null; m: string | null; rd: number | null; c: string | null };
function parseHistory(s: string | null | undefined): FightRow[] {
  if (!s) return [];
  try {
    return JSON.parse(s) as FightRow[];
  } catch {
    return [];
  }
}

// 받침 유무로 조사 선택 (한글 음절만; 그 외는 모음형)
function josa(w: string, batchim: string, none: string): string {
  const c = w.charCodeAt(w.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0 ? batchim : none;
  return none;
}

async function getFighter(teamId: number) {
  return prisma.team.findUnique({ where: { id: teamId }, select: { league: true, ...FIGHTER_SELECT } });
}

function view(t: NonNullable<Awaited<ReturnType<typeof getFighter>>>) {
  const f = t.mmaFighter;
  return {
    ko: f?.nameKo ?? toKoreanTeamName(t.name, "UFC"),
    en: t.name,
    photo: f?.headshot ?? f?.photo ?? t.logoUrl ?? null, // ESPN 헤드샷 우선(안정적) → api-sports → 로고
    flag: f?.flagUrl ?? null,
    record: f?.record ?? null,
    nickname: f?.nickname ?? null,
    category: f?.category ?? null,
    categoryKo: f?.category ? WEIGHT_CLASS_KO[f.category] ?? f.category : null,
    height: f?.height ?? null,
    weight: f?.weight ?? null,
    reach: f?.reach ?? null,
    stance: f?.stance ?? null,
    gym: f?.gym ?? null,
    age: f?.age ?? null,
    citizenship: f?.citizenship ?? null,
    koRecord: f?.koRecord ?? null,
    subRecord: f?.subRecord ?? null,
    history: parseHistory(f?.fightHistory),
    hasFighter: !!f,
  };
}

// 데이터 조립형 소개 문단 (위키 서사 복사 아님). 있는 값만 이어붙임.
function buildAbout(f: ReturnType<typeof view>): string {
  const role = f.categoryKo ? `UFC ${f.categoryKo} 파이터` : "UFC 파이터";
  const parts = [`${f.ko}${josa(f.ko, "은", "는")} ${role}이다.`];
  if (f.record) parts.push(`전적은 ${f.record}이다.`);
  const finishes = Number(f.koRecord?.match(/^(\d+)/)?.[1] ?? 0) + Number(f.subRecord?.match(/^(\d+)/)?.[1] ?? 0);
  if (finishes > 0) parts.push(`KO·서브미션으로 통산 ${finishes}승을 거뒀다.`);
  return parts.join(" ");
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return { title: "UFC 파이터" };
  const t = await getFighter(id);
  if (!t || t.league !== "UFC") return { title: "UFC 파이터" };
  const f = view(t);
  const title = `${f.ko}${f.nickname ? ` '${f.nickname}'` : ""} — UFC${f.categoryKo ? ` ${f.categoryKo}` : ""} 파이터 프로필`;
  const description = `${f.ko}${f.categoryKo ? ` (${f.categoryKo})` : ""} UFC 파이터. 전적 ${f.record ?? "—"}, 신체·리치·스탠스와 최근 경기 이력을 한눈에.`;
  // 전적·체급·이력 전부 없는 얇은 프로필은 구글 색인 제외(빙 등은 유지)
  const thin = !f.record && !f.category && f.history.length === 0;
  return {
    title,
    description,
    keywords: [f.ko, `${f.ko} 전적`, `${f.ko} UFC`, "UFC 파이터", "MMA 선수"],
    openGraph: { title, description, type: "profile", ...(f.photo ? { images: [{ url: f.photo }] } : {}) },
    alternates: { canonical: `/ufc/fighters/${id}` },
    ...(thin && { robots: GOOGLE_NOINDEX }),
  };
}

const kstDate = (d: Date) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }).format(d);

export default async function UfcFighterPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();
  const t = await getFighter(id);
  if (!t || t.league !== "UFC") notFound();
  const f = view(t);

  // 이 파이터가 포함된 UFC 경기 (상호 링크 — /live/ufc/{matchId})
  const matches = await prisma.match.findMany({
    where: { league: "UFC", OR: [{ homeTeamId: id }, { awayTeamId: id }] },
    orderBy: { startTime: "desc" },
    take: 8,
    select: {
      id: true, startTime: true, status: true, homeScore: true, awayScore: true, homeTeamId: true,
      homeTeam: { select: { name: true, mmaFighter: { select: { nameKo: true } } } },
      awayTeam: { select: { name: true, mmaFighter: { select: { nameKo: true } } } },
    },
  });

  const aboutText = buildAbout(f);
  const personLd = athleteLd({
    name: f.ko,
    path: `/ufc/fighters/${id}`,
    image: f.photo,
    nationality: f.citizenship,
    height: f.height,
    weight: f.weight,
    jobTitle: f.categoryKo ? `UFC ${f.categoryKo} 파이터` : "UFC 파이터",
    description: aboutText,
  });
  const crumbLd = breadcrumbLd([
    { name: "홈", path: "/" }, { name: "UFC 랭킹", path: "/rankings/ufc" }, { name: f.ko, path: `/ufc/fighters/${id}` },
  ]);

  // Tale of the Tape 바이오 — 값 있는 항목만
  const bio: [string, string][] = [];
  if (f.categoryKo) bio.push(["체급", f.categoryKo]);
  if (f.age != null) bio.push(["나이", `${f.age}세`]);
  if (f.height) bio.push(["신장", f.height]);
  if (f.weight) bio.push(["체중", f.weight]);
  const reachNum = f.reach?.match(/[\d.]+/)?.[0];
  if (reachNum) bio.push(["리치", `${reachNum}"`]);
  if (f.stance) bio.push(["스탠스", f.stance]);
  if (f.gym) bio.push(["소속 짐", f.gym]);
  if (f.koRecord) bio.push(["KO/TKO", f.koRecord]);
  if (f.subRecord) bio.push(["서브미션", f.subRecord]);

  return (
    <main className="relative max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(personLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbLd) }} />
      <AmbientGlow />

      {/* 상단 경로 */}
      <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
        <Link href="/scores?sport=mma" className="hover:underline">UFC</Link>
        <span>›</span>
        <Link href="/rankings/ufc" className="hover:underline">랭킹</Link>
        <span>›</span>
        <span className="text-neutral-600 dark:text-neutral-300">{f.ko}</span>
      </div>

      {/* 헤더 */}
      <header className="flex items-center gap-4 flex-wrap">
        {f.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.photo} alt={f.ko} className="w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-full bg-white ring-2 ring-neutral-200 dark:ring-white/10" />
        ) : (
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-neutral-100 dark:bg-neutral-900 inline-flex items-center justify-center text-3xl font-bold text-neutral-400">
            {f.ko.slice(0, 1)}
          </div>
        )}
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{f.ko}</h1>
            {f.flag && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.flag} alt="" className="h-5 w-7 object-contain" />
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {f.categoryKo && (
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300">
                {f.categoryKo}
              </span>
            )}
            {f.record && (
              <span className="px-2 py-0.5 rounded-md text-xs font-bold tabular-nums bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                {f.record}
              </span>
            )}
            {f.nickname && <span className="text-sm italic text-neutral-500">&lsquo;{f.nickname}&rsquo;</span>}
          </div>
        </div>
      </header>

      {/* 소개 — 데이터 조립형 (AI 검색 인용·GEO) */}
      <section className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
        <h2 className="sr-only">{f.ko} 소개</h2>
        <p>{aboutText}</p>
      </section>

      {/* Tale of the Tape */}
      {bio.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">신체·전적</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            {bio.map(([label, v]) => (
              <div key={label} className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
                <div className="text-[11px] text-neutral-400">{label}</div>
                <div className="mt-0.5 font-bold tabular-nums">{v}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 최근 경기 이력 (ESPN fightHistory) */}
      {f.history.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">최근 경기 이력</h2>
          <div className="space-y-1.5">
            {f.history.map((h, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg ring-1 ring-black/5 dark:ring-white/10 px-3 py-2 text-sm">
                <span
                  className={`font-black w-4 shrink-0 ${
                    h.r === "W" ? "text-emerald-600 dark:text-emerald-400" : h.r === "L" ? "text-rose-600 dark:text-rose-400" : "text-neutral-400"
                  }`}
                >
                  {h.r ?? "-"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-neutral-700 dark:text-neutral-200">{toUfcFighterKo(h.o)}</div>
                  <div className="text-xs text-neutral-400 truncate">
                    {[h.m, h.rd ? `R${h.rd}` : null, h.c, h.d].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* scorebase 커버 경기 (상호 링크) */}
      {matches.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">경기 일정·결과</h2>
          <div className="space-y-1.5">
            {matches.map((m) => {
              const opp = m.homeTeamId === id ? m.awayTeam : m.homeTeam;
              const oppKo = opp.mmaFighter?.nameKo ?? toKoreanTeamName(opp.name, "UFC");
              const finished = m.status === "FINISHED";
              return (
                <Link
                  key={m.id}
                  href={`/live/ufc/${m.id}`}
                  className="flex items-center gap-2 rounded-lg ring-1 ring-black/5 dark:ring-white/10 px-3 py-2 text-sm transition hover:ring-black/15 dark:hover:ring-white/20"
                >
                  <span className="text-xs text-neutral-400 tabular-nums w-24 shrink-0">{kstDate(m.startTime)}</span>
                  <span className="min-w-0 flex-1 truncate">vs {oppKo}</span>
                  <span className="shrink-0 text-xs font-semibold text-neutral-500">{finished ? "종료" : "예정"}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <p className="text-[11px] text-neutral-400">
        데이터: ESPN·api-sports · 신체·전적은 주기적으로 갱신됩니다. 한글 표기가 없는 파이터는 영문으로 표시됩니다.
      </p>
    </main>
  );
}
