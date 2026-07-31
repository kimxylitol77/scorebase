"use client";

import { useEffect, useState } from "react";

interface PresenceStat {
  activeNow: number;
  backgroundNow: number;
  openNow: number;
  scoresNow: number;
  liveNow: number;
  activeTabs: number;
  topPaths: Array<{ path: string; users: number }>;
  pv5m: number;
  pv1m: number;
  fetchedAt: string;
}

const POLL_MS = 15_000;

function PresenceCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: number;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
          : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
      }`}
    >
      <div className="text-xs font-medium text-neutral-500">{label}</div>
      <div className="mt-1 text-3xl font-black tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-neutral-500">{sub}</div>
    </div>
  );
}

export default function LivePresencePanel() {
  const [stat, setStat] = useState<PresenceStat | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      try {
        const res = await fetch("/api/admin/active", { cache: "no-store" });
        if (!res.ok) throw new Error("presence fetch failed");
        const json = (await res.json()) as PresenceStat;
        if (alive) {
          setStat(json);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (document.hidden) return;
      timer = setTimeout(async () => {
        await load();
        schedule();
      }, POLL_MS);
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
      } else {
        void load().then(schedule);
      }
    };

    void load().then(schedule);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative inline-flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <h2 className="text-lg font-bold tracking-tight">실시간 접속</h2>
        <span className="text-xs text-neutral-500">
          30초 heartbeat · 사용자 중복 제거
        </span>
      </div>

      {!stat ? (
        <div className="rounded-xl border border-neutral-200 p-5 text-sm text-neutral-500 dark:border-neutral-800">
          {failed
            ? "실시간 접속 데이터를 불러오지 못했습니다. DB 스키마 반영 여부를 확인하세요."
            : "실시간 접속 데이터를 불러오는 중입니다…"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <PresenceCard
              label="현재 보고 있음"
              value={stat.activeNow}
              sub="90초 내 visible heartbeat"
              accent
            />
            <PresenceCard
              label="열린 사용자"
              value={stat.openNow}
              sub={`백그라운드 ${stat.backgroundNow}명 포함`}
            />
            <PresenceCard
              label="스코어 화면"
              value={stat.scoresNow}
              sub="/ 또는 /scores"
            />
            <PresenceCard
              label="경기 상세"
              value={stat.liveNow}
              sub="/live 화면"
            />
            <PresenceCard
              label="열린 탭"
              value={stat.activeTabs}
              sub="한 사용자의 여러 탭 포함"
            />
            <PresenceCard
              label="최근 5분 PV"
              value={stat.pv5m}
              sub={`최근 1분 ${stat.pv1m}PV`}
            />
          </div>

          {stat.topPaths.length > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
              <div className="mb-2 text-xs font-semibold text-neutral-500">
                현재 보고 있는 화면
              </div>
              <div className="flex flex-wrap gap-2">
                {stat.topPaths.map((row) => (
                  <span
                    key={row.path}
                    className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium dark:bg-neutral-800"
                  >
                    {row.path}{" "}
                    <strong className="tabular-nums">{row.users}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-neutral-500">
            현재 보고 있음은 화면이 보이는 탭의 최근 90초 heartbeat를 sessionId로
            중복 제거한 값입니다. 기존 User-Agent 기반 수치와 직접 비교하지 마세요.
          </p>
        </>
      )}
    </section>
  );
}
