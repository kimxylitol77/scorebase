// F1 드라이버 상세 — ESPN core 프로필 + 챔피언십 시즌 요약 + 그랑프리별 레이스 결과.
// 통산 커리어 스탯은 ESPN 미제공(404)이라 이번 시즌 중심. 순위표·/scores F1 카드 이름 클릭으로 진입.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AmbientGlow from "@/components/AmbientGlow";
import { fetchF1Championship, fetchF1DriverDetail } from "@/lib/sports/espn-f1";
import { SITE_URL } from "@/lib/site-url";

export const revalidate = 1800;

const YEAR = String(new Date().getFullYear());

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const d = await fetchF1DriverDetail(id, YEAR);
  if (!d) return { title: "F1 드라이버" };
  const name = d.nameKo ?? d.name;
  return {
    title: `${name} — F1 드라이버 프로필·${YEAR} 시즌 그랑프리 성적`,
    description: `${name}(${d.name}) 프로필과 ${YEAR} 시즌 성적. 챔피언십 순위·포인트·우승, 그랑프리별 레이스 순위와 기록${d.teamKo ? `, 소속팀 ${d.teamKo}` : ""}까지 한눈에 — 스코어베이스 F1.`,
    keywords: [name, d.name, `${name} 성적`, "F1 드라이버", "포뮬러1", d.teamKo ?? ""].filter(Boolean),
    alternates: { canonical: `${SITE_URL}/rankings/f1/${id}` },
  };
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
function kstDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${WEEKDAY_KO[d.getUTCDay()]})`;
}

function age(birthIso: string): number {
  const b = new Date(birthIso);
  const now = new Date();
  let n = now.getUTCFullYear() - b.getUTCFullYear();
  if (
    now.getUTCMonth() < b.getUTCMonth() ||
    (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())
  )
    n -= 1;
  return n;
}

export default async function F1DriverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [driver, championship] = await Promise.all([
    fetchF1DriverDetail(id, YEAR),
    fetchF1Championship(YEAR),
  ]);
  if (!driver) notFound();

  const standing = championship.drivers.find((d) => d.athleteId === id) ?? null;
  const name = driver.nameKo ?? driver.name;

  const playedRaces = driver.races.filter((r) => r.played);
  const podiums = playedRaces.filter((r) => r.place != null && r.place <= 3).length;
  const bestPlace = playedRaces.reduce<number | null>(
    (best, r) => (r.place != null && (best === null || r.place < best) ? r.place : best),
    null,
  );

  const seasonStats: { label: string; value: string }[] = [
    standing ? { label: "챔피언십 순위", value: `${standing.rank}위` } : null,
    standing ? { label: "포인트", value: String(standing.points) } : null,
    standing ? { label: "우승", value: String(standing.wins) } : null,
    playedRaces.length > 0 ? { label: "포디움", value: String(podiums) } : null,
    bestPlace != null ? { label: "최고 순위", value: `${bestPlace}위` } : null,
    standing && standing.dnf > 0 ? { label: "DNF", value: String(standing.dnf) } : null,
  ].filter((x): x is { label: string; value: string } => x !== null);

  const profile: { label: string; value: string }[] = [
    driver.countryKo || driver.countryEn
      ? { label: "국적", value: driver.countryKo ?? driver.countryEn! }
      : null,
    driver.birthDate
      ? {
          label: "생년월일",
          value: `${new Date(driver.birthDate).getUTCFullYear()}. ${new Date(driver.birthDate).getUTCMonth() + 1}. ${new Date(driver.birthDate).getUTCDate()}. (만 ${age(driver.birthDate)}세)`,
        }
      : null,
    driver.teamKo ? { label: "소속팀", value: driver.teamKo } : null,
    driver.carNumber ? { label: "차 번호", value: `#${driver.carNumber}` } : null,
    driver.engine ? { label: "엔진", value: driver.engine } : null,
    driver.tire ? { label: "타이어", value: driver.tire } : null,
  ].filter((x): x is { label: string; value: string } => x !== null);

  return (
    <main className="relative max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />

      <nav className="text-[12px] text-neutral-500">
        <Link href="/rankings/f1" className="hover:underline">F1 챔피언십 순위</Link>
        <span className="mx-1.5 text-neutral-300 dark:text-neutral-700">/</span>
        <span>{name}</span>
      </nav>

      {/* 헤더 — 사진 + 이름 + 팀 + 챔피언십 현황 */}
      <header className="flex items-start gap-4">
        {driver.headshot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={driver.headshot}
            alt={name}
            className="w-20 h-20 shrink-0 rounded-2xl object-cover bg-neutral-100 dark:bg-neutral-800"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {driver.flag && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={driver.flag} alt="" className="w-6 h-4 object-cover rounded-[2px]" />
            )}
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight break-keep">{name}</h1>
            {driver.carNumber && (
              <span className="text-sm font-bold text-neutral-400">#{driver.carNumber}</span>
            )}
          </div>
          {driver.nameKo && <p className="mt-0.5 text-sm text-neutral-500">{driver.name}</p>}
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {driver.teamKo && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[12px] font-semibold text-neutral-700 dark:bg-white/[0.06] dark:text-neutral-300">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: driver.teamColor ?? "#9ca3af" }}
                  aria-hidden
                />
                {driver.teamKo}
              </span>
            )}
            {standing && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-[12px] font-bold text-rose-600 dark:text-rose-400">
                챔피언십 {standing.rank}위 · {standing.points}포인트
              </span>
            )}
          </p>
        </div>
      </header>

      {/* 프로필 */}
      {profile.length > 0 && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="mb-3 text-sm font-bold tracking-tight">프로필</h2>
          <dl className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {profile.map((p) => (
              <div key={p.label} className="flex items-center justify-between py-2 text-sm">
                <dt className="text-neutral-500">{p.label}</dt>
                <dd className="font-semibold text-neutral-800 dark:text-neutral-200">{p.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* 시즌 요약 */}
      {seasonStats.length > 0 && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="mb-3 text-sm font-bold tracking-tight">{YEAR} 시즌</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {seasonStats.map((s) => (
              <div key={s.label} className="rounded-xl bg-neutral-50 px-3 py-2.5 dark:bg-white/[0.04]">
                <dt className="text-[11px] text-neutral-500">{s.label}</dt>
                <dd className="mt-0.5 text-lg font-black tabular-nums text-neutral-900 dark:text-white">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* 그랑프리별 결과 */}
      {driver.races.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <div className="grid grid-cols-[36px_1fr_64px_44px_44px] sm:grid-cols-[40px_1fr_72px_52px_56px_88px] items-center gap-2 border-b border-neutral-100 px-3 sm:px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:border-neutral-800">
            <span className="text-center">R</span>
            <span>그랑프리</span>
            <span className="text-center">날짜</span>
            <span className="text-center">순위</span>
            <span className="text-center">Pts</span>
            <span className="hidden sm:block text-right">기록</span>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {driver.races.map((r) => (
              <li
                key={r.eventId}
                className={`grid grid-cols-[36px_1fr_64px_44px_44px] sm:grid-cols-[40px_1fr_72px_52px_56px_88px] items-center gap-2 px-3 sm:px-4 py-2.5 text-[13px] ${!r.played ? "opacity-55" : ""}`}
              >
                <span className="text-center text-[11px] font-bold tabular-nums text-neutral-400">{r.round}</span>
                <span className="truncate font-medium text-neutral-800 dark:text-neutral-200">{r.name}</span>
                <span className="text-center text-[11px] tabular-nums text-neutral-500">{kstDate(r.date)}</span>
                {r.played ? (
                  <>
                    <span
                      className={`text-center font-bold tabular-nums ${
                        r.place === 1
                          ? "text-amber-500"
                          : r.place != null && r.place <= 3
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-neutral-700 dark:text-neutral-300"
                      }`}
                    >
                      {r.place ?? "—"}
                    </span>
                    <span className={`text-center tabular-nums ${r.points ? "font-semibold text-neutral-800 dark:text-neutral-200" : "text-neutral-400"}`}>
                      {r.points ?? "—"}
                    </span>
                    <span className="hidden sm:block text-right text-[11px] tabular-nums text-neutral-500">
                      {r.record ?? "—"}
                    </span>
                  </>
                ) : (
                  // 지난 라운드인데 결과가 없으면(ESPN 데이터 갭) 단정 없이 "—" 표시
                  <span className="col-span-2 sm:col-span-3 text-center text-[11px] text-neutral-400">
                    {/* 서버 컴포넌트 — 요청(또는 revalidate)마다 1회 렌더라 순수성 규칙 대상이 아니다. */}
                    {/* eslint-disable-next-line react-hooks/purity */}
                    {new Date(r.date).getTime() < Date.now() ? "—" : "예정"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href="/rankings/f1"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          ← 챔피언십 순위 전체
        </Link>
        <Link
          href="/scores?sport=f1"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          🏎️ F1 그랑프리 일정·결과
        </Link>
      </div>

      <footer className="text-[11px] text-neutral-400 leading-relaxed">
        레이스 순위·기록은 결승 기준이며 공식 결과 반영까지 시간이 걸릴 수 있습니다. 날짜는 그랑프리 주간 시작일(KST).
        ESPN 이 통산 커리어 통계를 제공하지 않아 이번 시즌 성적 중심으로 표시합니다. 데이터 출처 ESPN.
      </footer>
    </main>
  );
}
