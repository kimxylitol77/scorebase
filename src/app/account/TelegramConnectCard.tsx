// 텔레그램 경기 알림 연결 카드 (마이페이지) — 기존 ⭐ 팀 즐겨찾기(localStorage)를
// 연결 시 서버(UserTeamFollow)로 동기화해 디스패처가 읽게 한다. (docs/telegram-alerts)
"use client";

import { useCallback, useEffect, useState } from "react";
import { useFavoriteTeams } from "@/components/scores/useFavoriteTeams";

export default function TelegramConnectCard() {
  const { teams, mounted } = useFavoriteTeams();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  // 서버에 현재 즐겨찾기 팀 동기화 (연결된 회원만 의미 있음)
  const syncTeams = useCallback(async () => {
    try {
      await fetch("/api/favorites/teams", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamIds: teams.map((t) => t.id) }),
      });
    } catch {
      /* 무시 — 다음 방문 때 재동기화 */
    }
  }, [teams]);

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

  // 최초: 연결 상태 확인 → 연결됐으면 팀 동기화
  useEffect(() => {
    if (!mounted) return;
    refreshStatus();
  }, [mounted, refreshStatus]);

  useEffect(() => {
    if (connected) syncTeams();
  }, [connected, syncTeams]);

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
            if (ok) await syncTeams();
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
            개의 경기 시작·종료를 텔레그램으로 보내드립니다. 알림 팀은 팀 페이지의 ⭐로 추가·제거하세요.
          </p>
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
            텔레그램을 연결하면 즐겨찾기(⭐) 팀의 <strong>경기 시작 임박·AI 픽·종료 결과</strong>를 채팅으로 받아볼 수 있습니다. 무료입니다.
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
