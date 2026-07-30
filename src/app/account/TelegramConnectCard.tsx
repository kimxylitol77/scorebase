// 텔레그램 경기 알림 연결 카드 (마이페이지) — 기존 ⭐ 즐겨찾기(localStorage)를
// 연결 시 서버(UserTeamFollow·UserMatchFollow)로 동기화해 디스패처가 읽게 한다. (docs/telegram-alerts)
"use client";

import { useCallback, useEffect, useState } from "react";
import { useFavoriteTeams } from "@/components/scores/useFavoriteTeams";
import { useFavorites } from "@/components/scores/useFavorites";

export default function TelegramConnectCard() {
  const { teams, mounted } = useFavoriteTeams();
  const { ids: matchIds, mounted: matchMounted } = useFavorites();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [oddsDrop, setOddsDrop] = useState(false);
  const [oddsRise, setOddsRise] = useState(false);

  // 서버에 현재 즐겨찾기 팀·경기 동기화 (연결된 회원만 의미 있음)
  const syncFavorites = useCallback(async () => {
    const put = (url: string, body: unknown) =>
      fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    try {
      await Promise.all([
        put("/api/favorites/teams", { teamIds: teams.map((t) => t.id) }),
        put("/api/favorites/matches", { matchIds: [...matchIds] }),
      ]);
    } catch {
      /* 무시 — 다음 방문 때 재동기화 */
    }
  }, [teams, matchIds]);

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/telegram/link", { method: "GET" });
      if (r.status === 401) { setConnected(null); return; }
      const d = (await r.json()) as { connected?: boolean };
      setConnected(!!d.connected);
      return !!d.connected;
    } catch {
      setConnected(null);
    }
  }, []);

  // 최초: 연결 상태 확인 → 연결됐으면 즐겨찾기 동기화 + 알림 설정 로드
  useEffect(() => {
    if (!mounted) return;
    // 마운트 시 서버 연결 상태 조회. setState 는 await fetch 이후라 실제로 동기 호출이 아니다(룰이 async 경계를 못 따라감).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshStatus();
  }, [mounted, refreshStatus]);

  useEffect(() => {
    if (!connected || !matchMounted) return;
    syncFavorites();
  }, [connected, matchMounted, syncFavorites]);

  useEffect(() => {
    if (!connected) return;
    fetch("/api/telegram/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { alertOddsDrop?: boolean; alertOddsRise?: boolean } | null) => {
        if (!d) return;
        setOddsDrop(!!d.alertOddsDrop);
        setOddsRise(!!d.alertOddsRise);
      })
      .catch(() => {});
  }, [connected]);

  // 체크박스는 낙관적 반영 — 저장 실패 시 되돌린다.
  const saveOddsSetting = async (field: "alertOddsDrop" | "alertOddsRise", value: boolean) => {
    const setter = field === "alertOddsDrop" ? setOddsDrop : setOddsRise;
    setter(value);
    try {
      const r = await fetch("/api/telegram/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!r.ok) setter(!value);
    } catch {
      setter(!value);
    }
  };

  const handleConnect = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/telegram/link", { method: "POST" });
      const d = (await r.json()) as { url?: string };
      if (d.url) {
        window.open(d.url, "_blank", "noopener");
        setWaiting(true);
        // 봇 /start 완료를 폴링으로 감지 (최대 ~40초)
        let tries = 0;
        const iv = setInterval(async () => {
          tries += 1;
          const ok = await refreshStatus();
          if (ok || tries >= 13) {
            clearInterval(iv);
            setWaiting(false);
            if (ok) await syncFavorites();
          }
        }, 3000);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await fetch("/api/telegram/link", { method: "DELETE" });
      setConnected(false);
    } finally {
      setBusy(false);
    }
  };

  const followCount = teams.length;
  const matchCount = matchIds.size;

  return (
    <section className="rounded-3xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <span aria-hidden>📨</span> 텔레그램 경기 알림
        </h2>
        {connected && (
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">연결됨</span>
        )}
      </div>

      {connected === null ? (
        <p className="text-sm text-neutral-500">불러오는 중…</p>
      ) : connected ? (
        <>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
            즐겨찾기 팀{" "}
            <span className="font-bold text-neutral-900 dark:text-white">{mounted ? followCount : 0}</span>
            개 · 경기{" "}
            <span className="font-bold text-neutral-900 dark:text-white">{matchMounted ? matchCount : 0}</span>
            개의 시작·종료를 텔레그램으로 보내드립니다. 팀은 팀 페이지, 경기는 스코어의 ⭐로 추가·제거하세요.
          </p>
          {mounted && matchMounted && followCount === 0 && matchCount === 0 && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              즐겨찾기가 하나도 없어 보낼 알림이 없습니다. 팀이나 경기를 ⭐로 추가해 주세요.
            </p>
          )}

          <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/10">
            <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
              배당 변동 알림
              <span className="ml-1.5 font-normal text-neutral-500">즐겨찾기 팀·경기 한정</span>
            </p>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={oddsDrop}
                  onChange={(e) => saveOddsSetting("alertOddsDrop", e.target.checked)}
                  className="w-4 h-4 rounded accent-[#229ED9]"
                />
                <span className="text-neutral-700 dark:text-neutral-300">
                  <span className="font-semibold text-rose-600 dark:text-rose-400">▼ 하락</span>
                  <span className="ml-1.5 text-xs text-neutral-500">배당이 내려감 — 그쪽으로 돈이 몰리는 중</span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={oddsRise}
                  onChange={(e) => saveOddsSetting("alertOddsRise", e.target.checked)}
                  className="w-4 h-4 rounded accent-[#229ED9]"
                />
                <span className="text-neutral-700 dark:text-neutral-300">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">▲ 상승</span>
                  <span className="ml-1.5 text-xs text-neutral-500">배당이 올라감 — 시장이 기대를 낮추는 중</span>
                </span>
              </label>
            </div>
          </div>

          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="mt-4 px-4 py-2 rounded-2xl bg-neutral-100 dark:bg-white/[0.06] hover:bg-neutral-200 dark:hover:bg-white/[0.1] text-sm font-medium transition disabled:opacity-50"
          >
            연결 해제
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
            텔레그램을 연결하면 즐겨찾기(⭐) 팀·경기의 <strong>경기 시작 임박·AI 픽·종료 결과·배당 변동</strong>을 채팅으로 받아볼 수 있습니다. 무료입니다.
          </p>
          <button
            onClick={handleConnect}
            disabled={busy || waiting}
            className="mt-4 px-4 py-2 rounded-2xl bg-[#229ED9] text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-50"
          >
            {waiting ? "봇에서 시작을 눌러주세요…" : "텔레그램 연결"}
          </button>
          {waiting && (
            <button
              onClick={refreshStatus}
              className="mt-2 ml-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              연결 확인
            </button>
          )}
        </>
      )}
    </section>
  );
}
