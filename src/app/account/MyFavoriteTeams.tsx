// 마이페이지 즐겨찾기 팀 목록 — 로고·이름 표시 + 개별/전체 해제.
// 팀 자체는 localStorage(useFavoriteTeams)가 정본이고, 여기서 바꾸면 서버(UserTeamFollow)에도
// 동기화해 텔레그램 알림 대상이 즉시 따라오게 한다.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import TeamBadge from "@/components/TeamBadge";
import { useFavoriteTeams } from "@/components/scores/useFavoriteTeams";
import { canPushFavorites } from "@/components/scores/fav-account-sync";

interface TeamInfo {
  id: number;
  name: string;
  league: string;
  logoUrl: string | null;
}

export default function MyFavoriteTeams() {
  const { teams, remove, clear, healTeams, mounted } = useFavoriteTeams();
  const [info, setInfo] = useState<Record<number, TeamInfo>>({});

  const ids = teams.map((t) => t.id);
  const idKey = ids.join(",");

  // 로고·한글명은 서버에서 — localStorage 에 id 만 있는 구 형식도 여기서 이름을 되찾는다.
  useEffect(() => {
    if (!mounted || idKey === "") return;
    let alive = true;
    fetch(`/api/teams/by-ids?ids=${idKey}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { teams?: TeamInfo[] } | null) => {
        if (!alive || !d?.teams) return;
        setInfo(Object.fromEntries(d.teams.map((t) => [t.id, t])));
        healTeams(d.teams);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mounted, idKey, healTeams]);

  // 서버 팔로우 동기화 — 로컬이 현재 계정 소유일 때만 (비로그인·계정 전환 직후 차단).
  const syncServer = useCallback((nextIds: number[]) => {
    if (!canPushFavorites()) return;
    fetch("/api/favorites/teams", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamIds: nextIds }),
    }).catch(() => {});
  }, []);

  const handleRemove = (id: number) => {
    remove(id);
    syncServer(ids.filter((x) => x !== id));
  };

  const handleClear = () => {
    if (!confirm("즐겨찾기 팀을 모두 해제할까요?")) return;
    clear();
    syncServer([]);
  };

  return (
    <section className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900/40 p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Star className="h-4 w-4 text-amber-400" fill="currentColor" aria-hidden />
          즐겨찾기 팀
          {mounted && teams.length > 0 && (
            <span className="text-neutral-400 font-normal">{teams.length}</span>
          )}
        </h2>
        {mounted && teams.length > 0 && (
          <button
            onClick={handleClear}
            className="text-xs font-medium text-neutral-400 hover:text-rose-500 transition-colors"
          >
            전체 해제
          </button>
        )}
      </div>

      {!mounted ? (
        <p className="text-sm text-neutral-500">불러오는 중…</p>
      ) : teams.length === 0 ? (
        <p className="text-sm text-neutral-500 leading-relaxed">
          아직 즐겨찾기한 팀이 없습니다.{" "}
          <Link href="/scores" className="text-blue-600 dark:text-blue-400 hover:underline">
            팀 페이지
          </Link>
          에서 ⭐를 눌러 추가하면 경기 시작·종료 알림을 받을 수 있습니다.
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {teams.map((t) => {
              const meta = info[t.id];
              const label = meta?.name || t.name || `팀 #${t.id}`;
              const league = meta?.league || t.league;
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-2.5 rounded-2xl bg-neutral-50 dark:bg-white/[0.04] px-3 py-2"
                >
                  <TeamBadge logoUrl={meta?.logoUrl ?? null} size={22} className="shrink-0 rounded-sm" />
                  <Link
                    href={`/teams/${t.id}`}
                    prefetch={false}
                    className="flex-1 truncate text-sm font-medium hover:underline"
                  >
                    {label}
                  </Link>
                  {league && (
                    <span className="shrink-0 text-[10px] font-medium text-neutral-400">{league}</span>
                  )}
                  <button
                    onClick={() => handleRemove(t.id)}
                    className="shrink-0 text-[11px] text-neutral-400 hover:text-rose-500 transition-colors"
                    aria-label={`${label} 즐겨찾기 해제`}
                  >
                    해제
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-neutral-400 leading-relaxed">
            즐겨찾기 팀의 경기 시작·종료가 텔레그램으로 발송됩니다. 팀 추가는 팀 페이지의 ⭐로 하세요.
          </p>
        </>
      )}
    </section>
  );
}
