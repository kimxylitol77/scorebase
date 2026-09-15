"use client";
// /lab 조건식 시스템 빌더 — 픽 방향·리그·조건(최대 5개)을 조합하면 최근 1년 백테스트(적중률·플랫 ROI·모델 기준선)와
// 앞으로 48시간 안에 조건에 걸리는 경기를 즉석으로 보여준다. 피처는 /api/rule-backtest 1회 로드, 재채점은 rule-system.ts 순수함수.
// 저장은 /api/member-bot(body.rules) — 손잡이 봇과 같은 테이블이라 매일 픽·채점·리더보드·/picks 랭킹이 그대로 따라온다.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Filter, Plus, Trash2, Sparkles, Save, Power, Share2, Pencil } from "lucide-react";
import type { LabBotPick } from "./LabClient";
import RoiCard from "@/components/predictions/RoiCard";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import {
  MAX_CONDS,
  RULE_FIELDS,
  RULE_MIN_N,
  matchesRules,
  ruleFeatureFromTuple,
  scoreRuleSystem,
  type RuleCond,
  type RuleFeature,
  type RuleFeatureTuple,
  type RuleFieldKey,
  type RuleSide,
  type RuleSystem,
  describeRuleSystem,
} from "@/lib/predict/rule-system";

/** 서버(page.tsx)가 내려주는 저장된 조건식 시스템 */
export interface LabRuleSystem {
  id: string;
  name: string;
  system: RuleSystem;
  backtestCache: { n?: number; acc?: number; roi?: number; modelAcc?: number; savedAt?: string } | null;
  isActive: boolean;
}

interface Payload {
  ok: boolean;
  leagues: Array<{ league: string; n: number; matches: RuleFeatureTuple[] }>;
  upcoming: Array<{ id: number; league: string; home: string; away: string; startTime: string; href: string; f: RuleFeatureTuple }>;
  totalMatches: number;
}

const SIDE_LABEL: Record<RuleSide, string> = { HOME: "홈 승", DRAW: "무승부", AWAY: "원정 승" };
const FIELD_META = Object.fromEntries(RULE_FIELDS.map((f) => [f.key, f])) as Record<RuleFieldKey, (typeof RULE_FIELDS)[number]>;
const GROUPS = Array.from(new Set(RULE_FIELDS.map((f) => f.group)));

/** 시작점 예시 — 빈 화면보다 고쳐 쓸 조건이 낫다 */
const PRESETS: Array<{ name: string; system: RuleSystem }> = [
  { name: "기세 탄 원정 언더독", system: { side: "AWAY", league: "ALL", conds: [{ field: "oddsAway", op: ">=", value: 2 }, { field: "aWin5", op: ">=", value: 60 }] } },
  { name: "모델이 시장보다 홈을 높게", system: { side: "HOME", league: "ALL", conds: [{ field: "edgeHome", op: ">=", value: 5 }] } },
  { name: "돈이 몰린 홈 인기팀", system: { side: "HOME", league: "ALL", conds: [{ field: "moveHome", op: ">=", value: 3 }, { field: "oddsHome", op: "<=", value: 2.2 }] } },
];

const fmtVal = (k: RuleFieldKey, v: number | null) => {
  if (v == null) return "—";
  const m = FIELD_META[k];
  const s = m.step >= 1 ? Math.round(v).toString() : v.toFixed(2);
  return `${s}${m.unit}`;
};
const kst = (iso: string) => {
  const k = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
};

const MAX_SYSTEMS = 3;

export default function RuleBuilderClient({ initialSystems, todayPicks }: { initialSystems: LabRuleSystem[]; todayPicks: LabBotPick[] }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [system, setSystem] = useState<RuleSystem>(PRESETS[0].system);
  const [saved, setSaved] = useState<LabRuleSystem[]>(initialSystems);
  /** 수정 중인 저장 시스템 id — null 이면 새로 저장 */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/rule-backtest")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: Payload) => alive && setData(j))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const sets = useMemo(
    () => (data ? data.leagues.map((l) => ({ league: l.league, features: l.matches.map(ruleFeatureFromTuple) })) : []),
    [data],
  );
  const score = useMemo(() => (sets.length ? scoreRuleSystem(sets, system) : null), [sets, system]);
  const upcoming = useMemo(() => {
    if (!data) return [];
    return data.upcoming
      .map((u) => ({ ...u, feat: ruleFeatureFromTuple(u.f) as RuleFeature }))
      .filter((u) => (system.league === "ALL" || u.league === system.league) && matchesRules(u.feat, system.conds));
  }, [data, system]);

  const setCond = (i: number, patch: Partial<RuleCond>) =>
    setSystem((s) => ({ ...s, conds: s.conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const addCond = () =>
    setSystem((s) => (s.conds.length >= MAX_CONDS ? s : { ...s, conds: [...s.conds, { field: "oddsHome", op: ">=", value: 1.5 }] }));
  const removeCond = (i: number) => setSystem((s) => ({ ...s, conds: s.conds.filter((_, j) => j !== i) }));

  const leagueOptions = data ? data.leagues.map((l) => l.league) : [];

  const backtestSummary = score
    ? { n: score.total.n, hits: score.total.hits, acc: score.total.acc, roi: score.total.roi.roi, modelAcc: score.total.modelN ? score.total.modelHits / score.total.modelN : undefined }
    : undefined;

  async function save() {
    const nm = name.trim();
    if (!nm) return setMsg("이름을 1~20자로 적어 주세요.");
    setBusy(true);
    setMsg(null);
    try {
      const isUpdate = !!editingId;
      const r = await fetch("/api/member-bot", {
        method: isUpdate ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(isUpdate ? { id: editingId } : {}),
          name: nm,
          league: system.league,
          rules: { side: system.side, conds: system.conds },
          backtest: backtestSummary,
        }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string; bot?: { id: string; name: string; league: string; backtestCache: LabRuleSystem["backtestCache"]; isActive: boolean } };
      if (!j.ok || !j.bot) return setMsg(j.error ?? "저장에 실패했습니다.");
      const row: LabRuleSystem = { id: j.bot.id, name: j.bot.name, system: { ...system, league: j.bot.league }, backtestCache: j.bot.backtestCache, isActive: j.bot.isActive };
      setSaved((list) => (isUpdate ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row]));
      setEditingId(row.id);
      setMsg(isUpdate ? "수정했습니다. 다음 픽 생성부터 반영됩니다." : "저장했습니다. 다음 픽 생성(13:30·01:30) 부터 매일 조건에 걸리는 경기를 픽하고, /picks 랭킹에도 오릅니다.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleActive(row: LabRuleSystem) {
    const r = await fetch("/api/member-bot", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: row.id, isActive: !row.isActive }) });
    const j = (await r.json()) as { ok: boolean };
    if (j.ok) setSaved((list) => list.map((x) => (x.id === row.id ? { ...x, isActive: !x.isActive } : x)));
  }
  async function remove(row: LabRuleSystem) {
    if (!confirm(`「${row.name}」을 삭제할까요? 픽 기록도 함께 지워집니다.`)) return;
    const r = await fetch(`/api/member-bot?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
    const j = (await r.json()) as { ok: boolean };
    if (j.ok) {
      setSaved((list) => list.filter((x) => x.id !== row.id));
      if (editingId === row.id) {
        setEditingId(null);
        setName("");
      }
    }
  }
  function loadForEdit(row: LabRuleSystem) {
    setSystem(row.system);
    setName(row.name);
    setEditingId(row.id);
    setMsg(null);
  }
  function startNew() {
    setEditingId(null);
    setName("");
    setMsg(null);
  }
  const thin = !score || score.total.n < RULE_MIN_N;
  const topLeagues = score ? Object.entries(score.byLeague).sort((a, b) => b[1].n - a[1].n).slice(0, 8) : [];

  return (
    <section className="rounded-[1.5rem] bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] sm:rounded-[2rem] sm:p-6 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-500/20 dark:text-sky-300">
          <Filter className="h-3 w-3" aria-hidden /> 조건식 시스템
        </span>
        <h2 className="text-base font-bold text-zinc-900 dark:text-white">조건을 쌓아 경기를 고르는 시스템</h2>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400 break-keep">
        손잡이 봇이 「어떻게 계산할까」라면 이건 「어떤 경기만 고를까」입니다. 배당·시장 변동·모델 차이·팀 폼 조건을 겹쳐 놓으면 최근 1년 실제 경기에서 그 조건에 걸린 경기의 적중률과 1유닛 수익률, 그리고 앞으로 48시간 안에 걸리는 경기를 바로 보여줍니다.
      </p>

      {/* 프리셋 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => setSystem(p.system)}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:border-sky-400 hover:text-sky-700 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-sky-300"
          >
            <Sparkles className="h-3 w-3" aria-hidden /> {p.name}
          </button>
        ))}
      </div>

      {/* 방향·리그 */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] text-neutral-600 dark:text-neutral-300">
          <span className="mb-1 block font-semibold">픽 방향</span>
          <div className="flex gap-1.5">
            {(["HOME", "DRAW", "AWAY"] as RuleSide[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSystem((x) => ({ ...x, side: s }))}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold ring-1 ${
                  system.side === s ? "bg-sky-600 text-white ring-sky-600" : "bg-white text-neutral-600 ring-neutral-200 dark:bg-white/[0.04] dark:text-neutral-300 dark:ring-neutral-700"
                }`}
              >
                {SIDE_LABEL[s]}
              </button>
            ))}
          </div>
        </label>
        <label className="text-[12px] text-neutral-600 dark:text-neutral-300">
          <span className="mb-1 block font-semibold">리그</span>
          <select
            value={system.league}
            onChange={(e) => setSystem((x) => ({ ...x, league: e.target.value }))}
            className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[12px] dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="ALL">전체 리그</option>
            {leagueOptions.map((lg) => (
              <option key={lg} value={lg}>{LEAGUE_DISPLAY[lg] ?? lg}</option>
            ))}
          </select>
        </label>
      </div>

      {/* 조건 */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">조건 (모두 만족해야 선택)</span>
          <button
            type="button"
            onClick={addCond}
            disabled={system.conds.length >= MAX_CONDS}
            className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            <Plus className="h-3 w-3" aria-hidden /> 조건 추가 ({system.conds.length}/{MAX_CONDS})
          </button>
        </div>
        {system.conds.length === 0 && <p className="text-[12px] text-neutral-400">조건이 없으면 리그의 모든 경기가 선택됩니다.</p>}
        {system.conds.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-neutral-200 p-2 dark:border-neutral-700">
            <select
              value={c.field}
              onChange={(e) => {
                const field = e.target.value as RuleFieldKey;
                setCond(i, { field });
              }}
              className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[12px] dark:border-neutral-700 dark:bg-neutral-900"
            >
              {GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {RULE_FIELDS.filter((f) => f.group === g).map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              value={c.op}
              onChange={(e) => setCond(i, { op: e.target.value as RuleCond["op"] })}
              className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[12px] dark:border-neutral-700 dark:bg-neutral-900"
            >
              <option value=">=">이상</option>
              <option value="<=">이하</option>
            </select>
            <input
              type="number"
              value={c.value}
              step={FIELD_META[c.field].step}
              onChange={(e) => setCond(i, { value: Number(e.target.value) })}
              className="w-24 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[12px] tabular-nums dark:border-neutral-700 dark:bg-neutral-900"
            />
            <span className="text-[11px] text-neutral-400">{FIELD_META[c.field].unit}</span>
            <button type="button" onClick={() => removeCond(i)} aria-label="조건 삭제" className="ml-auto rounded-lg p-1.5 text-neutral-400 hover:bg-rose-500/10 hover:text-rose-600">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
            <p className="w-full text-[10px] text-neutral-400">{FIELD_META[c.field].hint}</p>
          </div>
        ))}
      </div>

      {/* 결과 */}
      <div className="mt-5">
        {error ? (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-[12px] text-rose-600">백테스트 데이터를 불러오지 못했습니다 ({error}).</p>
        ) : !data || !score ? (
          <p className="text-[12px] text-neutral-400">최근 1년 경기 데이터를 불러오는 중…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">최근 1년 백테스트</span>
              <span className="text-[11px] text-neutral-400 tabular-nums">조건에 걸린 경기 {score.total.n} / 전체 {data.totalMatches}</span>
              {thin && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300">
                  표본 부족 — {RULE_MIN_N}경기 미만은 우연일 수 있습니다
                </span>
              )}
            </div>
            <div className={`mt-2 grid gap-3 sm:grid-cols-3 ${thin ? "opacity-60" : ""}`}>
              <div className="rounded-xl bg-neutral-50 p-4 dark:bg-white/[0.04]">
                <p className="text-xs text-neutral-500">{SIDE_LABEL[system.side]} 적중률</p>
                <div className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-white">{score.total.n ? `${(score.total.acc * 100).toFixed(1)}%` : "—"}</div>
                <p className="mt-1 text-[11px] text-neutral-400 tabular-nums">{score.total.hits}/{score.total.n} 경기</p>
              </div>
              <RoiCard label="플랫 유닛 수익률" sub="픽 방향 마감 배당에 매 경기 1유닛" w={score.total.roi} excludedNote={score.total.roi.excluded > 0 ? `배당 없음 ${score.total.roi.excluded}경기 제외` : undefined} />
              <div className="rounded-xl bg-neutral-50 p-4 dark:bg-white/[0.04]">
                <p className="text-xs text-neutral-500">같은 경기에서 우리 모델 픽</p>
                <div className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-white">{score.total.modelN ? `${((score.total.modelHits / score.total.modelN) * 100).toFixed(1)}%` : "—"}</div>
                <p className="mt-1 text-[11px] text-neutral-400 tabular-nums">{score.total.modelHits}/{score.total.modelN} 경기 · 기준선</p>
              </div>
            </div>
            {topLeagues.length > 1 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-[10px] text-neutral-500 dark:border-neutral-800">
                      <th className="py-1.5 pr-2 font-medium">리그</th>
                      <th className="py-1.5 pr-2 text-right font-medium">경기</th>
                      <th className="py-1.5 pr-2 text-right font-medium">적중률</th>
                      <th className="py-1.5 pr-2 text-right font-medium">수익률</th>
                      <th className="py-1.5 text-right font-medium">모델</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topLeagues.map(([lg, s]) => (
                      <tr key={lg} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                        <td className="py-1.5 pr-2">{LEAGUE_DISPLAY[lg] ?? lg}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{s.n}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">{(s.acc * 100).toFixed(0)}%</td>
                        <td className={`py-1.5 pr-2 text-right tabular-nums ${s.roi.roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                          {s.roi.evaluated ? `${s.roi.roi >= 0 ? "+" : ""}${(s.roi.roi * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-neutral-500">{s.modelN ? `${((s.modelHits / s.modelN) * 100).toFixed(0)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 앞으로의 해당 경기 */}
            <div className="mt-5">
              <div className="flex items-baseline gap-2">
                <span className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">앞으로 48시간 안에 조건에 걸리는 경기</span>
                <span className="text-[11px] text-neutral-400 tabular-nums">{upcoming.length}경기</span>
              </div>
              {upcoming.length === 0 ? (
                <p className="mt-1.5 text-[12px] text-neutral-400">지금은 조건에 걸리는 예정 경기가 없습니다. 조건을 느슨하게 하거나 내일 다시 확인해 보세요.</p>
              ) : (
                <ul className="mt-2 divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800/60 dark:border-neutral-800">
                  {upcoming.slice(0, 30).map((u) => (
                    <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[12px]">
                      <span className="w-14 shrink-0 text-[11px] text-neutral-400">{LEAGUE_DISPLAY[u.league] ?? u.league}</span>
                      <span className="w-12 shrink-0 tabular-nums text-neutral-500">{kst(u.startTime)}</span>
                      <Link href={u.href} className="min-w-0 flex-1 truncate font-medium text-neutral-800 hover:underline dark:text-neutral-100">
                        {u.home} <span className="font-normal text-neutral-400">vs</span> {u.away}
                      </Link>
                      <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">{SIDE_LABEL[system.side]}</span>
                      <span className="w-full text-[10px] tabular-nums text-neutral-400 sm:w-auto">
                        {system.conds.map((c) => `${FIELD_META[c.field].label} ${fmtVal(c.field, u.feat.v[c.field])}`).join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
      {/* 저장 — 이름 + 저장/수정. 저장하면 손잡이 봇과 같은 배관(매일 픽·채점·리더보드·/picks 랭킹)을 탄다 */}
      <div className="mt-5 rounded-xl border border-dashed border-neutral-300 p-3 dark:border-neutral-700">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder={editingId ? "시스템 이름" : "새 시스템 이름 (1~20자)"}
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="button"
            onClick={save}
            disabled={busy || !data || (!editingId && saved.length >= MAX_SYSTEMS)}
            className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" aria-hidden /> {editingId ? "수정 저장" : "시스템 저장"}
          </button>
          {editingId && (
            <button type="button" onClick={startNew} className="rounded-lg px-2 py-1.5 text-[12px] text-neutral-500 hover:underline">
              새로 만들기
            </button>
          )}
          <span className="text-[10px] text-neutral-400 tabular-nums">{saved.length}/{MAX_SYSTEMS}</span>
        </div>
        {msg && <p className="mt-2 text-[11px] text-neutral-600 dark:text-neutral-300">{msg}</p>}
        {!editingId && saved.length >= MAX_SYSTEMS && <p className="mt-2 text-[11px] text-neutral-400">계정당 {MAX_SYSTEMS}개까지 저장할 수 있습니다. 기존 시스템을 수정하거나 삭제해 주세요.</p>}
      </div>

      {/* 저장된 시스템 목록 + 오늘 픽 */}
      {saved.length > 0 && (
        <div className="mt-4 space-y-2">
          <span className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">내 조건식 시스템</span>
          {saved.map((row) => {
            const picks = todayPicks.filter((p) => p.botId === row.id);
            const bt = row.backtestCache;
            return (
              <div key={row.id} className={`rounded-xl border p-3 ${editingId === row.id ? "border-sky-400 dark:border-sky-500/60" : "border-neutral-200 dark:border-neutral-700"} ${row.isActive ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13px] font-bold text-neutral-900 dark:text-white">{row.name}</span>
                  <span className="text-[10px] text-neutral-400">{row.system.league === "ALL" ? "전체 리그" : LEAGUE_DISPLAY[row.system.league] ?? row.system.league}</span>
                  {!row.isActive && <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">중지</span>}
                  <span className="ml-auto flex items-center gap-1">
                    <button type="button" onClick={() => loadForEdit(row)} title="불러와서 수정" className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/[0.06]"><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
                    <button type="button" onClick={() => toggleActive(row)} title={row.isActive ? "매일 픽 중지" : "매일 픽 재개"} className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/[0.06]"><Power className="h-3.5 w-3.5" aria-hidden /></button>
                    <Link href={`/community/new?bot=${encodeURIComponent(row.id)}`} title="게시판에 공유" className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/[0.06]"><Share2 className="h-3.5 w-3.5" aria-hidden /></Link>
                    <button type="button" onClick={() => remove(row)} title="삭제" className="rounded-lg p-1.5 text-neutral-400 hover:bg-rose-500/10 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">{describeRuleSystem(row.system)}</p>
                {bt?.n != null && bt.acc != null && (
                  <p className="mt-0.5 text-[10px] tabular-nums text-neutral-400">
                    저장 시점 백테스트 {bt.n}경기 · 적중 {(bt.acc * 100).toFixed(1)}%{bt.roi != null && ` · 수익률 ${bt.roi >= 0 ? "+" : ""}${(bt.roi * 100).toFixed(1)}%`}{bt.modelAcc != null && ` · 같은 경기 모델 ${(bt.modelAcc * 100).toFixed(1)}%`}
                  </p>
                )}
                {picks.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5 text-[11px]">
                    {picks.slice(0, 8).map((p) => (
                      <li key={p.matchId} className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-neutral-400">{LEAGUE_DISPLAY[p.league] ?? p.league}</span>
                        <span className="min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-200">{p.home} vs {p.away}</span>
                        <span className="text-neutral-400 tabular-nums">{p.startKst}</span>
                        <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">{p.pick === "HOME" ? "홈" : p.pick === "AWAY" ? "원정" : "무"}</span>
                      </li>
                    ))}
                    {picks.length > 8 && <li className="text-[10px] text-neutral-400">외 {picks.length - 8}경기</li>}
                  </ul>
                ) : (
                  <p className="mt-1 text-[10px] text-neutral-400">{row.isActive ? "오늘 픽은 다음 생성 시각(13:30·01:30) 이후 표시됩니다." : "중지 상태 — 매일 픽을 만들지 않습니다."}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-[10px] leading-relaxed text-neutral-400">
        백테스트는 마감 배당 기준이라 실제 구매 시점 배당과 다를 수 있고, 조건이 좁을수록 과거에 맞춘 결과일 가능성이 큽니다. 참고용이며 베팅을 권유하지 않습니다.
      </p>
    </section>
  );
}
