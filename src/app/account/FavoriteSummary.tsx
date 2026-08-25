// 마이페이지 즐겨찾기 경기 목록 — 팀·스코어·상태 표시 + 개별/전체 해제.
// 경기 자체는 localStorage(useFavorites)가 정본이고, 여기서 바꾸면 서버(UserMatchFollow)에도
// 동기화해 텔레그램 알림 대상이 즉시 따라온다. (즐겨찾기 팀 카드와 같은 구조)
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useFavorites, readFavMeta } from "@/components/scores/useFavorites";
import { canPushFavorites } from "@/components/scores/fav-account-sync";
import { postponedLabel } from "@/lib/sports/sport-leagues";

interface MatchInfo {
  id: number;
  league: string;
  externalId: string;
  status: string;
  startTime: string;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
}

/** UTC ISO → KST "M/D HH:MM". */
function kst(iso: string): string {
  const k = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  LIVE: { text: "진행 중", cls: "text-rose-600 dark:text-rose-400" },
  FINISHED: { text: "종료", cls: "text-neutral-400" },
  // POSTPONED 는 종목마다 부르는 말이 달라 여기서 고정하지 않고 아래에서 league 로 정한다.
  POSTPONED: { text: "", cls: "text-amber-600 dark:text-amber-400" },
};

export default function FavoriteSummary() {
  const { ids, toggle, clear, mounted } = useFavorites();
  const [info, setInfo] = useState<Record<string, MatchInfo>>({});

  const idKey = [...ids].join(",");

  useEffect(() => {
    if (!mounted || idKey === "") return;
    let alive = true;
    fetch(`/api/matches/by-ids?ids=${idKey}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { matches?: MatchInfo[] } | null) => {
        if (!alive || !d?.matches) return;
        setInfo(Object.fromEntries(d.matches.map((m) => [String(m.id), m])));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mounted, idKey]);

  // 서버 팔로우 동기화 — 로컬이 현재 계정 소유일 때만 (비로그인·계정 전환 직후 차단).
  const syncServer = useCallback((nextIds: string[]) => {
    if (!canPushFavorites()) return;
    fetch("/api/favorites/matches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchIds: nextIds }),
    }).catch(() => {});
  }, []);

  const handleRemove = (id: string) => {
    toggle(id);
    syncServer([...ids].filter((x) => x !== id));
  };

  const handleClear = () => {
    if (!confirm("즐겨찾기 경기를 모두 해제할까요?")) return;
    clear();
    syncServer([]);
  };

  // DB 에 없는 경기(ESPN 전용 종목 등)는 별표 당시 스냅샷으로라도 이름을 보여준다.
  const meta = mounted ? readFavMeta() : {};
  const list = [...ids];

  return (
    <section id="favorites" className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900/40 p-6 scroll-mt-20">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <span aria-hidden>⭐</span> 즐겨찾기 경기
          {mounted && list.length > 0 && (
            <span className="text-neutral-400 font-normal">{list.length}</span>
          )}
        </h2>
        {mounted && list.length > 0 ? (
          <button
            onClick={handleClear}
            className="text-xs font-medium text-neutral-400 hover:text-rose-500 transition-colors"
          >
            전체 해제
          </button>
        ) : (
          <Link
            href="/scores"
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            스코어로 →
          </Link>
        )}
      </div>

      {!mounted ? (
        <p className="text-sm text-neutral-500">불러오는 중…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-neutral-500 leading-relaxed">
          아직 즐겨찾기한 경기가 없습니다.{" "}
          <Link href="/scores" className="text-blue-600 dark:text-blue-400 hover:underline">
            스코어
          </Link>
          에서 경기의 ⭐를 눌러 추가해 보세요.
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {list.map((id) => {
              const m = info[id];
              const snap = meta[id];
              const home = m?.homeName ?? snap?.homeName ?? "?";
              const away = m?.awayName ?? snap?.awayName ?? "?";
              const league = m?.league ?? snap?.league ?? "";
              const base = STATUS_LABEL[m?.status ?? ""];
              const badge = base
                ? { ...base, text: base.text || postponedLabel(league) }
                : base;
              const scored = m && m.homeScore != null && m.awayScore != null;
              const href = m ? `/live/${m.league}/${m.externalId}` : (snap?.href ?? "/scores");
              return (
                <li
                  key={id}
                  className="flex items-center gap-2.5 rounded-2xl bg-neutral-50 dark:bg-white/[0.04] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={href}
                      prefetch={false}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {home} <span className="text-neutral-400">vs</span> {away}
                      {scored && (
                        <span className="ml-1.5 font-bold tabular-nums">
                          {m.homeScore}-{m.awayScore}
                        </span>
                      )}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-neutral-400">
                      {league && <span className="font-medium">{league}</span>}
                      {m && <span>{kst(m.startTime)}</span>}
                      {badge && <span className={`font-semibold ${badge.cls}`}>{badge.text}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(id)}
                    className="shrink-0 text-[11px] text-neutral-400 hover:text-rose-500 transition-colors"
                    aria-label={`${home} vs ${away} 즐겨찾기 해제`}
                  >
                    해제
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-neutral-400 leading-relaxed">
            즐겨찾기 경기의 시작·종료가 텔레그램으로 발송됩니다. 경기 추가는 스코어의 ⭐로 하세요.
          </p>
        </>
      )}
    </section>
  );
}
