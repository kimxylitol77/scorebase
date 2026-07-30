"use client";
// /lab 회원 전용 본체 — 손잡이 슬라이더·즉석 백테스트(클라이언트 재채점)·경기 시뮬·봇 저장/목록.
// 피처 벡터는 /api/bot-backtest 1회 로드 후 손잡이 변경마다 member-bot.ts 순수함수로 재채점한다.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  SlidersHorizontal,
  LineChart,
  Dices,
  Bot,
  Save,
  Trash2,
  Power,
  RotateCcw,
  Share2,
  Send,
} from "lucide-react";
import {
  DEFAULT_KNOBS,
  featureFromTuple,
  scoreBacktest,
  type BotFeature,
  type BotFeatureTuple,
  type BotKnobs,
  type BotLeagueConfig,
} from "@/lib/predict/member-bot";
import { KNOB_METAS, KNOB_PRESETS } from "./knobs-meta";

// ── 서버(page.tsx)와 공유하는 직렬화 타입 ──

export interface LabMatch {
  id: number;
  league: string;
  home: string;
  away: string;
  startKst: string;
}

export interface LabBot {
  id: string;
  name: string;
  league: string;
  knobs: BotKnobs;
  backtestCache: {
    n?: number;
    acc?: number;
    vsModel?: number;
    savedAt?: string;
  } | null;
  isActive: boolean;
  notifyTelegram: boolean;
}

/** 오늘 내 봇 픽 — cron 이 생성한 미시작 경기 픽 (page.tsx 서버 조회) */
export interface LabBotPick {
  botId: string;
  matchId: number;
  pick: string;
  prob: number;
  league: string;
  home: string;
  away: string;
  startMs: number;
  startKst: string;
}

const MAX_BOTS = 3;

const LEAGUE_KO: Record<string, string> = {
  EPL: "EPL", LALIGA: "라리가", BUNDESLIGA: "분데스리가", SERIE_A: "세리에 A",
  LIGUE_1: "리그 1", MLS: "MLS", UCL: "UCL", UEL: "UEL", WORLD_CUP: "월드컵",
  K_LEAGUE_1: "K리그1", CLUB_WORLD_CUP: "클럽 월드컵",
  KBO: "KBO", MLB: "MLB", NPB: "NPB", NBA: "NBA", NHL: "NHL",
};
const leagueKo = (lg: string) => LEAGUE_KO[lg] ?? lg;

// ── 백테스트 응답 ──

interface BtLeagueRes {
  league: string;
  drawWeight: number;
  drawSensitivity: number;
  marketW0: number;
  n: number;
  modelAcc: number | null;
  matches: BotFeatureTuple[];
}

interface BtSet {
  cfg: BotLeagueConfig;
  features: BotFeature[];
  n: number;
  modelAcc: number | null;
}

interface SimRes {
  ok: boolean;
  n: number;
  used: { home: number; draw: number; away: number };
  custom?: boolean;
  outcomes: { home: number; draw: number; away: number };
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const knobPct = (v: number) => Math.round(v * 100);

export default function LabClient({
  matches,
  initialBots,
  todayPicks,
  preselectMatchId,
  telegramLinked,
}: {
  matches: LabMatch[];
  initialBots: LabBot[];
  todayPicks: LabBotPick[];
  preselectMatchId: number | null;
  telegramLinked: boolean;
}) {
  const [knobs, setKnobs] = useState<BotKnobs>({ ...DEFAULT_KNOBS });

  // ── 백테스트 피처 1회 로드 ──
  const [sets, setSets] = useState<BtSet[] | null>(null);
  const [btError, setBtError] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/bot-backtest?days=365")
      .then((r) => r.json())
      .then((j: { ok: boolean; leagues?: BtLeagueRes[] }) => {
        if (!alive) return;
        if (!j.ok || !j.leagues) throw new Error("load failed");
        setSets(
          j.leagues.map((L) => ({
            cfg: {
              league: L.league,
              drawWeight: L.drawWeight,
              drawSensitivity: L.drawSensitivity,
              marketW0: L.marketW0,
            },
            features: L.matches.map(featureFromTuple),
            n: L.n,
            modelAcc: L.modelAcc,
          })),
        );
      })
      .catch(() => alive && setBtError(true));
    return () => {
      alive = false;
    };
  }, []);

  // ── 리그 필터 + 즉석 재채점 ──
  const [leagueFilter, setLeagueFilter] = useState<string>("ALL");
  const filterOptions = useMemo(() => {
    if (!sets) return [];
    return sets
      .filter((s) => s.n >= 30)
      .sort((a, b) => b.n - a.n)
      .slice(0, 10)
      .map((s) => s.cfg.league);
  }, [sets]);

  const score = useMemo(() => {
    if (!sets) return null;
    const target =
      leagueFilter === "ALL" ? sets : sets.filter((s) => s.cfg.league === leagueFilter);
    return scoreBacktest(target, knobs);
  }, [sets, knobs, leagueFilter]);

  const modelAcc = useMemo(() => {
    if (!sets) return null;
    const target =
      leagueFilter === "ALL" ? sets : sets.filter((s) => s.cfg.league === leagueFilter);
    let n = 0;
    let hits = 0;
    for (const s of target) {
      if (s.modelAcc == null) continue;
      n += s.n;
      hits += s.modelAcc * s.n;
    }
    return n > 0 ? hits / n : null;
  }, [sets, leagueFilter]);

  const vsModel =
    score && modelAcc != null && score.total.n > 0
      ? (score.total.acc - modelAcc) * 100
      : null;

  // ── 경기 시뮬 ──
  const [simMatchId, setSimMatchId] = useState<number | "">(
    preselectMatchId != null && matches.some((m) => m.id === preselectMatchId)
      ? preselectMatchId
      : "",
  );
  const [simPhase, setSimPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [simRes, setSimRes] = useState<SimRes | null>(null);
  const simMatch = matches.find((m) => m.id === simMatchId) ?? null;

  async function runSim() {
    if (simMatchId === "") return;
    setSimPhase("running");
    setSimRes(null);
    try {
      const q = new URLSearchParams({
        matchId: String(simMatchId),
        kElo: String(knobPct(knobs.elo)),
        kForm: String(knobPct(knobs.form)),
        kHome: String(knobPct(knobs.home)),
        kMarket: String(knobPct(knobs.market)),
        kUnderdog: String(knobPct(knobs.underdog)),
      });
      const r = await fetch(`/api/match-sim?${q.toString()}`);
      const j = (await r.json()) as SimRes;
      if (!r.ok || !j.ok) throw new Error("sim failed");
      setSimRes(j);
      setSimPhase("done");
    } catch {
      setSimPhase("error");
    }
  }

  // ── 봇 저장·목록 ──
  const [bots, setBots] = useState<LabBot[]>(initialBots);
  const [botName, setBotName] = useState("");
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const selectedBot = bots.find((b) => b.id === selectedBotId) ?? null;

  const backtestSummary =
    score && score.total.n > 0
      ? {
          n: score.total.n,
          hits: score.total.hits,
          acc: score.total.acc,
          brier: score.total.brier,
          ...(vsModel != null ? { vsModel } : {}),
        }
      : undefined;

  async function saveBot() {
    const name = botName.trim();
    if (!name) {
      setMsg("봇 이름을 입력하세요.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const isUpdate = selectedBot != null;
      const r = await fetch("/api/member-bot", {
        method: isUpdate ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          isUpdate
            ? { id: selectedBot.id, name, knobs, backtest: backtestSummary }
            : { name, knobs, league: leagueFilter, backtest: backtestSummary },
        ),
      });
      const j = (await r.json()) as { ok: boolean; bot?: LabBot & { knobs: BotKnobs }; error?: string };
      if (!r.ok || !j.ok || !j.bot) {
        setMsg(j.error ?? "저장에 실패했습니다.");
        return;
      }
      const saved: LabBot = {
        id: j.bot.id,
        name: j.bot.name,
        league: j.bot.league,
        knobs: j.bot.knobs,
        backtestCache: j.bot.backtestCache ?? null,
        isActive: j.bot.isActive,
        notifyTelegram: j.bot.notifyTelegram ?? false,
      };
      setBots((prev) =>
        isUpdate ? prev.map((b) => (b.id === saved.id ? saved : b)) : [...prev, saved],
      );
      setSelectedBotId(saved.id);
      setMsg(isUpdate ? "봇을 업데이트했습니다." : "봇을 저장했습니다.");
    } catch {
      setMsg("저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleBot(bot: LabBot) {
    setBusy(true);
    try {
      const r = await fetch("/api/member-bot", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: bot.id, isActive: !bot.isActive }),
      });
      const j = (await r.json()) as { ok: boolean };
      if (j.ok) {
        setBots((prev) =>
          prev.map((b) => (b.id === bot.id ? { ...b, isActive: !bot.isActive } : b)),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  // 텔레그램 하루 픽 요약 on/off. 미연결 회원은 버튼 대신 연결 안내를 띄운다.
  async function toggleNotify(bot: LabBot) {
    if (!telegramLinked) {
      setMsg("텔레그램을 먼저 연결해 주세요. 마이페이지에서 연결할 수 있습니다.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/member-bot", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: bot.id, notifyTelegram: !bot.notifyTelegram }),
      });
      const j = (await r.json()) as { ok: boolean };
      if (j.ok) {
        setBots((prev) =>
          prev.map((b) => (b.id === bot.id ? { ...b, notifyTelegram: !bot.notifyTelegram } : b)),
        );
        setMsg(bot.notifyTelegram ? "텔레그램 알림을 껐습니다." : "이 봇의 하루 픽 요약을 텔레그램으로 보내드립니다.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteBot(bot: LabBot) {
    if (!window.confirm(`'${bot.name}' 봇을 삭제할까요?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/member-bot?id=${encodeURIComponent(bot.id)}`, {
        method: "DELETE",
      });
      const j = (await r.json()) as { ok: boolean };
      if (j.ok) {
        setBots((prev) => prev.filter((b) => b.id !== bot.id));
        if (selectedBotId === bot.id) {
          setSelectedBotId(null);
          setBotName("");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function loadBot(bot: LabBot) {
    setKnobs({ ...bot.knobs });
    setSelectedBotId(bot.id);
    setBotName(bot.name);
    if (bot.league !== "ALL" && filterOptions.includes(bot.league)) {
      setLeagueFilter(bot.league);
    }
    setMsg(null);
  }

  const card =
    "rounded-[1.5rem] bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] sm:rounded-[2rem] sm:p-6 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none";
  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
      active
        ? "bg-violet-600 text-white"
        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/15"
    }`;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── 손잡이 ── */}
        <section className={card}>
          <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white">
            <SlidersHorizontal className="h-4 w-4 text-violet-500" aria-hidden /> 손잡이
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {KNOB_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setKnobs({ ...p.knobs });
                  setMsg(null);
                }}
                className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15"
              >
                {p.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setKnobs({ ...DEFAULT_KNOBS })}
              className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-semibold text-zinc-400 transition hover:text-zinc-600 dark:text-white/35 dark:hover:text-white/60"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> 초기화
            </button>
          </div>
          <div className="mt-4 space-y-4">
            {KNOB_METAS.map((meta) => (
              <div key={meta.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-800 dark:text-white/85">
                    {meta.label}
                  </span>
                  <span
                    className={`text-xs font-bold tabular-nums ${
                      knobPct(knobs[meta.key]) === 100
                        ? "text-zinc-400 dark:text-white/35"
                        : "text-violet-600 dark:text-violet-400"
                    }`}
                  >
                    {knobPct(knobs[meta.key])}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={5}
                  value={knobPct(knobs[meta.key])}
                  onChange={(e) =>
                    setKnobs((prev) => ({
                      ...prev,
                      [meta.key]: Number(e.target.value) / 100,
                    }))
                  }
                  className="mt-1 w-full accent-violet-500"
                  aria-label={meta.label}
                />
                <p className="text-[11px] leading-relaxed text-zinc-400 break-keep dark:text-white/35">
                  {meta.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 즉석 백테스트 ── */}
        <section className={card}>
          <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white">
            <LineChart className="h-4 w-4 text-violet-500" aria-hidden /> 즉석 백테스트
          </h2>
          {btError && (
            <p className="mt-3 text-sm text-zinc-500 dark:text-white/50">
              백테스트 데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.
            </p>
          )}
          {!btError && !sets && (
            <p className="mt-3 text-sm text-zinc-500 dark:text-white/50">
              최근 1년 경기 데이터를 불러오는 중입니다.
            </p>
          )}
          {sets && score && (
            <>
              <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
                <button type="button" onClick={() => setLeagueFilter("ALL")} className={chip(leagueFilter === "ALL")}>
                  전체
                </button>
                {filterOptions.map((lg) => (
                  <button key={lg} type="button" onClick={() => setLeagueFilter(lg)} className={chip(leagueFilter === lg)}>
                    {leagueKo(lg)}
                  </button>
                ))}
              </div>
              {score.total.n === 0 ? (
                <p className="mt-4 text-sm text-zinc-500 dark:text-white/50">
                  이 리그는 채점 가능한 표본이 없습니다.
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-white/35">
                      내 봇 적중률
                    </div>
                    <div className="mt-0.5 text-2xl font-black tabular-nums text-zinc-900 dark:text-white">
                      {pct(score.total.acc)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-white/35">
                      표본
                    </div>
                    <div className="mt-0.5 text-2xl font-black tabular-nums text-zinc-900 dark:text-white">
                      {score.total.n.toLocaleString()}
                      <span className="text-sm font-semibold text-zinc-400 dark:text-white/40">경기</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-white/35">
                      우리 모델 대비
                    </div>
                    <div
                      className={`mt-0.5 text-2xl font-black tabular-nums ${
                        vsModel == null
                          ? "text-zinc-400 dark:text-white/40"
                          : vsModel > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : vsModel < 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-zinc-900 dark:text-white"
                      }`}
                    >
                      {vsModel == null
                        ? "—"
                        : `${vsModel > 0 ? "+" : ""}${vsModel.toFixed(1)}%p`}
                    </div>
                    {modelAcc != null && (
                      <div className="text-[11px] tabular-nums text-zinc-400 dark:text-white/35">
                        모델 {pct(modelAcc)}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <p className="mt-3 border-t border-black/5 pt-2 text-[11px] leading-relaxed text-zinc-500 dark:border-white/10 dark:text-white/45">
                과거 성적이 미래 적중을 보장하지 않습니다. 최근 1년, 우리 모델이 채점한 종료 경기
                기준이며 손잡이를 움직이면 즉시 재계산됩니다.
              </p>
            </>
          )}
        </section>
      </div>

      {/* ── 경기 시뮬 ── */}
      <section className={card}>
        <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white">
          <Dices className="h-4 w-4 text-violet-500" aria-hidden /> 내 손잡이로 경기 시뮬
        </h2>
        <p className="mt-1 text-[13px] text-zinc-500 break-keep dark:text-white/50">
          예정 경기 하나를 골라 지금 손잡이 값으로 5,000회 주사위를 던집니다.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={simMatchId === "" ? "" : String(simMatchId)}
            onChange={(e) => {
              setSimMatchId(e.target.value === "" ? "" : Number(e.target.value));
              setSimPhase("idle");
              setSimRes(null);
            }}
            className="min-w-0 max-w-full flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
            aria-label="시뮬 대상 경기"
          >
            <option value="">경기를 선택하세요</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                [{leagueKo(m.league)}] {m.home} vs {m.away} — {m.startKst}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={runSim}
            disabled={simMatchId === "" || simPhase === "running"}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-white/80"
          >
            {simPhase === "running" ? "시뮬 중" : "5,000회 시뮬"}
          </button>
        </div>
        {matches.length === 0 && (
          <p className="mt-2 text-[13px] text-zinc-500 dark:text-white/50">
            지금은 시뮬 가능한 예정 경기가 없습니다.
          </p>
        )}
        {simPhase === "error" && (
          <p className="mt-3 text-sm text-zinc-600 dark:text-white/55">
            시뮬 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}
        {simPhase === "done" && simRes && simMatch && (
          <div className="mt-4 space-y-2">
            <SimBar
              label={`${simMatch.home} 승`}
              count={simRes.outcomes.home}
              n={simRes.n}
              color="bg-blue-500"
            />
            {simRes.outcomes.draw > 0 && (
              <SimBar label="무승부·연장 구간" count={simRes.outcomes.draw} n={simRes.n} color="bg-neutral-400" />
            )}
            <SimBar
              label={`${simMatch.away} 승`}
              count={simRes.outcomes.away}
              n={simRes.n}
              color="bg-rose-500"
            />
            <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-white/45">
              {simRes.custom
                ? "내 손잡이로 재계산한 확률로 던진 결과입니다."
                : "손잡이가 전부 100%라 우리 모델 확률 그대로 던졌습니다."}
            </p>
          </div>
        )}
      </section>

      {/* ── 봇 저장·내 봇 ── */}
      <section className={card}>
        <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white">
          <Bot className="h-4 w-4 text-violet-500" aria-hidden /> 내 봇
          <span className="text-xs font-semibold text-zinc-400 dark:text-white/35">
            {bots.length}/{MAX_BOTS}
          </span>
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            maxLength={20}
            placeholder="봇 이름 (1~20자)"
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 dark:border-white/15 dark:bg-zinc-900 dark:text-white dark:placeholder:text-white/30"
          />
          <button
            type="button"
            onClick={saveBot}
            disabled={busy || (selectedBot == null && bots.length >= MAX_BOTS)}
            className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-500 disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" aria-hidden />
            {selectedBot ? `'${selectedBot.name}' 업데이트` : "현재 손잡이로 저장"}
          </button>
          {selectedBot && (
            <button
              type="button"
              onClick={() => {
                setSelectedBotId(null);
                setBotName("");
                setMsg(null);
              }}
              className="text-xs font-semibold text-zinc-400 underline underline-offset-2 hover:text-zinc-600 dark:text-white/35 dark:hover:text-white/60"
            >
              새 봇으로
            </button>
          )}
        </div>
        {selectedBot == null && bots.length >= MAX_BOTS && (
          <p className="mt-2 text-[13px] text-zinc-500 dark:text-white/50">
            봇은 계정당 최대 {MAX_BOTS}개입니다. 기존 봇을 삭제하거나 불러와서 업데이트하세요.
          </p>
        )}
        {msg && <p className="mt-2 text-[13px] text-zinc-600 dark:text-white/60">{msg}</p>}

        {bots.length > 0 && (
          <ul className="mt-4 space-y-2">
            {bots.map((b) => (
              <li
                key={b.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-2.5 ring-1 ${
                  selectedBotId === b.id
                    ? "bg-violet-500/[0.06] ring-violet-500/25"
                    : "bg-zinc-50 ring-black/5 dark:bg-white/[0.03] dark:ring-white/10"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-zinc-900 dark:text-white">
                      {b.name}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        b.isActive
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "bg-zinc-200 text-zinc-500 dark:bg-white/10 dark:text-white/40"
                      }`}
                    >
                      {b.isActive ? "활성" : "쉬는 중"}
                    </span>
                  </div>
                  <div className="text-[11px] tabular-nums text-zinc-500 dark:text-white/45">
                    {KNOB_METAS.map((k) => `${k.label} ${knobPct(b.knobs[k.key])}%`).join(" · ")}
                    {b.backtestCache?.acc != null && (
                      <> · 저장 시점 적중률 {pct(b.backtestCache.acc)}</>
                    )}
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => loadBot(b)}
                    className="rounded-full bg-zinc-200 px-2.5 py-1 text-[11px] font-bold text-zinc-700 transition hover:bg-zinc-300 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                  >
                    불러오기
                  </button>
                  <Link
                    href={`/community/new?bot=${encodeURIComponent(b.id)}`}
                    title="게시판에 공유"
                    className="rounded-full p-1.5 text-zinc-400 transition hover:text-zinc-700 dark:text-white/35 dark:hover:text-white/70"
                  >
                    <Share2 className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleNotify(b)}
                    disabled={busy}
                    title={
                      !telegramLinked
                        ? "텔레그램 연결 후 사용할 수 있습니다"
                        : b.notifyTelegram
                          ? "텔레그램 알림 끄기"
                          : "하루 픽 요약을 텔레그램으로 받기"
                    }
                    className={`rounded-full p-1.5 transition disabled:opacity-40 ${
                      b.notifyTelegram
                        ? "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                        : "text-zinc-400 hover:text-zinc-700 dark:text-white/35 dark:hover:text-white/70"
                    }`}
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleBot(b)}
                    disabled={busy}
                    title={b.isActive ? "비활성으로 전환" : "활성으로 전환"}
                    className="rounded-full p-1.5 text-zinc-400 transition hover:text-zinc-700 disabled:opacity-40 dark:text-white/35 dark:hover:text-white/70"
                  >
                    <Power className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteBot(b)}
                    disabled={busy}
                    title="삭제"
                    className="rounded-full p-1.5 text-zinc-400 transition hover:text-rose-600 disabled:opacity-40 dark:text-white/35 dark:hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <BotTodayPicks
                  picks={todayPicks.filter((p) => p.botId === b.id)}
                  isActive={b.isActive}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** 봇 카드 하단 "오늘 내 봇 픽" — cron 생성 픽을 회원이 눈으로 확인하는 최소 UI */
function BotTodayPicks({ picks, isActive }: { picks: LabBotPick[]; isActive: boolean }) {
  if (picks.length === 0) {
    if (!isActive) return null;
    return (
      <p className="w-full border-t border-black/5 pt-1.5 text-[11px] text-zinc-400 dark:border-white/10 dark:text-white/35">
        오늘 내 봇 픽 — 아직 없음 (매일 2회 자동 생성, 예정 경기에 저장 예측이 있어야 합니다)
      </p>
    );
  }
  return (
    <div className="w-full border-t border-black/5 pt-1.5 dark:border-white/10">
      <div className="text-[11px] font-semibold text-zinc-500 dark:text-white/45">
        오늘 내 봇 픽 {picks.length}건
      </div>
      <ul className="mt-1 space-y-0.5">
        {picks.map((p) => (
          <li
            key={`${p.botId}-${p.matchId}`}
            className="text-[11px] tabular-nums text-zinc-600 dark:text-white/55"
          >
            [{leagueKo(p.league)}] {p.home} vs {p.away} —{" "}
            <span className="font-bold text-zinc-900 dark:text-white">
              {p.pick === "HOME" ? `${p.home} 승` : p.pick === "AWAY" ? `${p.away} 승` : "무승부"}
            </span>{" "}
            {pct(p.prob)} · {p.startKst}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SimBar({
  label,
  count,
  n,
  color,
}: {
  label: string;
  count: number;
  n: number;
  color: string;
}) {
  const p = (count / n) * 100;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 truncate font-semibold text-zinc-700 dark:text-white/80">
        {label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${p}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right tabular-nums text-zinc-500 dark:text-white/45">
        <span className="font-bold text-zinc-900 dark:text-white">{p.toFixed(1)}%</span> ·{" "}
        {count.toLocaleString()}회
      </span>
    </div>
  );
}
