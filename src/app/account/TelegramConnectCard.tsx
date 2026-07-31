// 텔레그램 경기 알림 연결 카드 (마이페이지) — 기존 ⭐ 즐겨찾기(localStorage)를
// 연결 시 서버(UserTeamFollow·UserMatchFollow)로 동기화해 디스패처가 읽게 한다. (docs/telegram-alerts)
"use client";

import { useCallback, useEffect, useState } from "react";
import { useFavoriteTeams } from "@/components/scores/useFavoriteTeams";
import { useFavorites } from "@/components/scores/useFavorites";
import { canPushFavorites } from "@/components/scores/fav-account-sync";

/** 마이페이지에서 켜고 끄는 알림 종류. 순서가 화면 순서다. */
const ALERT_ITEMS = [
  {
    field: "alertKickoff",
    label: "곧 시작",
    desc: "킥오프 30분 전에 AI 픽과 함께",
    sample: "⚽ 곧 시작 (21:00) · 토트넘 vs 첼시 — AI 픽: 토트넘 승 62%",
  },
  {
    field: "alertLineup",
    label: "선발 라인업",
    desc: "확정 선발 11명이 발표되면 (축구만)",
    sample: "📋 선발 라인업 (21:00) · 토트넘 4-3-3 · 첼시 4-2-3-1",
  },
  {
    field: "alertGoal",
    label: "골",
    desc: "즐겨찾기 경기에서 골이 터질 때마다 (축구만)",
    sample: "⚽ 골! 토트넘 1 - 0 첼시",
  },
  {
    field: "alertFinal",
    label: "경기 종료",
    desc: "최종 스코어",
    sample: "⏱ 종료 · 토트넘 2 - 1 첼시",
  },
  {
    field: "alertFollowPick",
    label: "팔로우한 분석가 픽",
    desc: "팔로우 중인 분석가가 새 픽을 올릴 때",
    sample: "📌 팔로우한 분석가 새 픽 · 홍길동 — 픽: 토트넘 승",
  },
] as const;

const ODDS_ITEMS = [
  {
    field: "alertOddsDrop",
    label: "배당 하락 ▼",
    desc: "즐겨찾기 경기 — 그쪽으로 돈이 몰리는 중",
  },
  {
    field: "alertOddsRise",
    label: "배당 상승 ▲",
    desc: "즐겨찾기 경기 — 시장이 기대를 낮추는 중",
  },
  {
    field: "alertOddsAll",
    label: "오늘의 배당 급변 (전 경기)",
    desc: "즐겨찾기와 무관하게 크게 움직인 경기를 매일 밤 9시에 묶어서",
  },
] as const;

type AlertField =
  | (typeof ALERT_ITEMS)[number]["field"]
  | (typeof ODDS_ITEMS)[number]["field"];

type Settings = Record<AlertField, boolean>;

export default function TelegramConnectCard() {
  const { teams, mounted } = useFavoriteTeams();
  const { ids: matchIds, mounted: matchMounted } = useFavorites();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  // 서버에 현재 즐겨찾기 팀·경기 동기화 (연결된 회원만 의미 있음)
  const syncFavorites = useCallback(async () => {
    // 로컬이 현재 계정 소유일 때만 — 계정 전환 pull 완료 전 레이스로 서버를 덮지 않게.
    if (!canPushFavorites()) return;
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
      .then((d: Partial<Settings> | null) => {
        if (!d) return;
        setSettings({
          alertKickoff: !!d.alertKickoff,
          alertLineup: !!d.alertLineup,
          alertGoal: !!d.alertGoal,
          alertFinal: !!d.alertFinal,
          alertFollowPick: !!d.alertFollowPick,
          alertOddsDrop: !!d.alertOddsDrop,
          alertOddsRise: !!d.alertOddsRise,
          alertOddsAll: !!d.alertOddsAll,
        });
      })
      .catch(() => {});
  }, [connected]);

  // 체크박스는 낙관적 반영 — 저장 실패 시 되돌린다.
  const saveSetting = async (field: AlertField, value: boolean) => {
    setSettings((s) => (s ? { ...s, [field]: value } : s));
    try {
      const r = await fetch("/api/telegram/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!r.ok) setSettings((s) => (s ? { ...s, [field]: !value } : s));
    } catch {
      setSettings((s) => (s ? { ...s, [field]: !value } : s));
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
            개를 챙겨보고 있습니다. 팀은 팀 페이지, 경기는 스코어의 ⭐로 추가·제거하세요.
          </p>
          {mounted && matchMounted && followCount === 0 && matchCount === 0 && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              즐겨찾기가 하나도 없어 보낼 알림이 없습니다. 팀이나 경기를 ⭐로 추가해 주세요.
            </p>
          )}

          <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/10">
            <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              받을 알림 고르기
            </p>
            <p className="text-[11px] text-neutral-500 mb-3">
              끄면 그 종류만 안 옵니다. 아래 알림은 모두 즐겨찾기한 팀·경기에 대해서만 보냅니다.
            </p>

            {settings === null ? (
              <p className="text-xs text-neutral-500">설정을 불러오는 중…</p>
            ) : (
              <>
                <div className="flex flex-col gap-2.5">
                  {ALERT_ITEMS.map((item) => (
                    <label key={item.field} className="flex gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings[item.field]}
                        onChange={(e) => saveSetting(item.field, e.target.checked)}
                        className="mt-0.5 w-4 h-4 shrink-0 rounded accent-[#229ED9]"
                      />
                      <span className="min-w-0">
                        <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                          {item.label}
                        </span>
                        <span className="block text-xs text-neutral-500">{item.desc}</span>
                        {settings[item.field] && (
                          <span className="mt-1 block rounded-lg bg-neutral-100 dark:bg-white/[0.06] px-2 py-1 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
                            {item.sample}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>

                <p className="mt-4 mb-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  배당 변동
                </p>
                <div className="flex flex-col gap-2.5">
                  {ODDS_ITEMS.map((item) => (
                    <label key={item.field} className="flex gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings[item.field]}
                        onChange={(e) => saveSetting(item.field, e.target.checked)}
                        className="mt-0.5 w-4 h-4 shrink-0 rounded accent-[#229ED9]"
                      />
                      <span className="min-w-0">
                        <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                          {item.label}
                        </span>
                        <span className="block text-xs text-neutral-500">{item.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {(settings.alertOddsDrop || settings.alertOddsRise) &&
                  !settings.alertOddsAll && (
                    <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                      즐겨찾기한 리그가 비시즌이면 배당 자체가 안 들어와 알림이 오지 않습니다.
                      전 경기 급변을 함께 켜두면 그 기간에도 받아볼 수 있습니다.
                    </p>
                  )}
              </>
            )}
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
            텔레그램을 연결하면 즐겨찾기(⭐) 팀·경기의 <strong>시작 임박·AI 픽·선발 라인업·골·종료 결과·배당 변동</strong>을 채팅으로 받아볼 수 있습니다. 어떤 알림을 받을지는 연결 후 하나씩 고를 수 있고, 무료입니다.
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
