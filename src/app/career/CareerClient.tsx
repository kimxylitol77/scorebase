"use client";
// 커리어 게임 본체 — 상태·진행을 전부 브라우저에서 처리한다 (서버 호출 없음)
import { useCallback, useMemo, useState } from "react";
import {
  advance, applyEvent, leagueLabel, makeRng, nextDecision, startCareer, summarize,
} from "@/lib/career/engine";
import { loadClubs } from "@/lib/career/clubs";
import { NATIONS, NATION_BY_CODE } from "@/lib/career/nations";
import { buildShareParams } from "@/lib/career/share";
import type { CareerState, Club, Decision, Position } from "@/lib/career/types";

const POSITIONS: { code: Position; label: string }[] = [
  { code: "GK", label: "골키퍼" },
  { code: "DF", label: "수비수" },
  { code: "MF", label: "미드필더" },
  { code: "FW", label: "공격수" },
];

/** 연표에 미리 깔아두는 나이 칸 — 채워질 자리가 보여야 끝까지 가고 싶어진다 */
const AGE_SLOTS = [16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38];

function money(v: number): string {
  if (v >= 1) return `€${v.toFixed(v >= 10 ? 0 : 1)}M`;
  return `€${Math.round(v * 1000)}K`;
}

function ovrTone(ovr: number): string {
  if (ovr >= 85) return "bg-amber-400 text-amber-950";
  if (ovr >= 75) return "bg-emerald-500 text-white";
  if (ovr >= 65) return "bg-sky-500 text-white";
  return "bg-neutral-400 text-white dark:bg-neutral-600";
}

function Logo({ club, size = 28 }: { club: Club; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={club.g}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

export default function CareerClient() {
  const [nation, setNation] = useState("KOR");
  const [position, setPosition] = useState<Position>("MF");
  const [state, setState] = useState<CareerState | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rng, setRng] = useState<(() => number) | null>(null);
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    let pool = clubs;
    if (!pool) {
      setLoading(true);
      try {
        pool = await loadClubs();
        setClubs(pool);
      } catch {
        setError("구단 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    const r = makeRng(Math.floor(Math.random() * 2 ** 31));
    const s = startCareer(nation, position, r);
    setRng(() => r);
    setState(s);
    setMessage(null);
    setDecision(nextDecision(s, pool, r));
  }, [nation, position, clubs]);

  const reset = useCallback(() => {
    setState(null);
    setDecision(null);
    setMessage(null);
    setRng(null);
  }, []);

  const chooseClub = useCallback(
    (club: Club, retireNow: boolean) => {
      if (!state || !rng) return;
      if (retireNow) {
        setState({ ...state, retired: true });
        setDecision(null);
        return;
      }
      const next = advance(state, club, rng);
      setState(next);
      setMessage(null);
      setDecision(next.retired || !clubs ? null : nextDecision(next, clubs, rng));
    },
    [state, rng, clubs],
  );

  const chooseEvent = useCallback(
    (optionId: string) => {
      if (!state || !rng) return;
      const { state: next, message: msg } = applyEvent(state, optionId, rng);
      setState(next);
      setMessage(msg);
      if (clubs) setDecision(nextDecision(next, clubs, rng, false));
    },
    [state, rng, clubs],
  );

  if (!state) {
    return (
      <SetupScreen
        nation={nation}
        position={position}
        onNation={setNation}
        onPosition={setPosition}
        onStart={start}
        loading={loading}
        error={error}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PlayerCard state={state} />
      <Timeline state={state} />
      {message && (
        <p className="rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-700 dark:bg-neutral-800/70 dark:text-neutral-200">
          {message}
        </p>
      )}
      {state.retired ? (
        <RetiredCard state={state} onReset={reset} />
      ) : (
        decision && (
          <DecisionPanel decision={decision} onClub={chooseClub} onEvent={chooseEvent} />
        )
      )}
    </div>
  );
}

function SetupScreen({
  nation, position, onNation, onPosition, onStart, loading, error,
}: {
  nation: string;
  position: Position;
  onNation: (v: string) => void;
  onPosition: (v: Position) => void;
  onStart: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div>
      <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
        미니게임
      </span>
      <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">
        축구선수 인생 살아보기
      </h1>
      <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
        16세 유스 입단부터 은퇴까지, 두 시즌씩 건너뛰며 커리어를 만듭니다. 어디로 갈지는 당신이 고릅니다.
        회원가입은 필요 없습니다.
      </p>

      <h2 className="mt-7 text-sm font-semibold text-neutral-900 dark:text-white">국적</h2>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        고른 나라의 리그에서 커리어가 시작됩니다.
      </p>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {NATIONS.map((n) => (
          <button
            key={n.code}
            type="button"
            onClick={() => onNation(n.code)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs transition ${
              nation === n.code
                ? "bg-rose-500 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            }`}
          >
            <span aria-hidden>{n.flag}</span>
            <span className="truncate">{n.label}</span>
          </button>
        ))}
      </div>

      <h2 className="mt-7 text-sm font-semibold text-neutral-900 dark:text-white">포지션</h2>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        {POSITIONS.map((p) => (
          <button
            key={p.code}
            type="button"
            onClick={() => onPosition(p.code)}
            className={`rounded-lg px-2 py-2.5 text-xs font-medium transition ${
              position === p.code
                ? "bg-rose-500 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-5 rounded-lg bg-rose-500/10 px-3 py-2.5 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onStart}
        disabled={loading}
        className="mt-7 w-full rounded-xl bg-neutral-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {loading ? "불러오는 중…" : "커리어 시작"}
      </button>
    </div>
  );
}

function PlayerCard({ state }: { state: CareerState }) {
  const nat = NATION_BY_CODE[state.nation];
  const pos = POSITIONS.find((p) => p.code === state.position);
  return (
    <div className="rounded-2xl bg-neutral-100 p-4 dark:bg-neutral-800/60">
      <div className="flex items-center gap-3">
        <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl text-xl font-bold ${ovrTone(state.ovr)}`}>
          {state.ovr}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <span aria-hidden>{nat?.flag}</span>
            <span>{nat?.label}</span>
            <span className="text-neutral-300 dark:text-neutral-600">·</span>
            <span>{pos?.label}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            {state.club && <Logo club={state.club} size={22} />}
            <span className="truncate text-lg font-semibold text-neutral-900 dark:text-white">
              {state.club ? state.club.n : "무소속"}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">{state.age}세</div>
          <div className="text-base font-semibold text-neutral-900 dark:text-white">
            {money(state.value)}
          </div>
        </div>
      </div>
      {state.caps > 0 && (
        <p className="mt-3 border-t border-neutral-200 pt-2.5 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          대표팀 {state.caps}경기 {state.capGoals}골
        </p>
      )}
    </div>
  );
}

function Timeline({ state }: { state: CareerState }) {
  const byAge = useMemo(
    () => new Map(state.history.map((s) => [s.age, s])),
    [state.history],
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-700">
      <div className="grid grid-cols-[2.6rem_1fr_2.2rem_2.6rem_2.2rem_2.2rem] gap-1 bg-neutral-100 px-3 py-1.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
        <span>나이</span>
        <span>소속</span>
        <span className="text-right">OVR</span>
        <span className="text-right">경기</span>
        <span className="text-right">골</span>
        <span className="text-right">도움</span>
      </div>
      {AGE_SLOTS.map((age) => {
        const s = byAge.get(age);
        const current = !state.retired && state.age === age;
        return (
          <div
            key={age}
            className={`grid grid-cols-[2.6rem_1fr_2.2rem_2.6rem_2.2rem_2.2rem] items-center gap-1 border-t border-neutral-100 px-3 py-1.5 text-xs dark:border-neutral-800 ${
              s ? "text-neutral-900 dark:text-white" : "text-neutral-300 dark:text-neutral-600"
            }`}
          >
            <span className="font-medium">{age}</span>
            {s ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <Logo club={s.club} size={16} />
                <span className="truncate">{s.club.n}</span>
                {s.titles > 0 && <span className="shrink-0 text-amber-500" aria-label="우승">★</span>}
              </span>
            ) : (
              <span className="truncate">{current ? "진행 중…" : ""}</span>
            )}
            <span className="text-right tabular-nums">{s ? s.ovr : ""}</span>
            <span className="text-right tabular-nums">{s ? s.apps : ""}</span>
            <span className="text-right tabular-nums">{s ? s.goals : ""}</span>
            <span className="text-right tabular-nums">{s ? s.assists : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

function DecisionPanel({
  decision, onClub, onEvent,
}: {
  decision: Decision;
  onClub: (club: Club, retire: boolean) => void;
  onEvent: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-700">
      <h2 className="text-base font-semibold text-neutral-900 dark:text-white">{decision.title}</h2>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{decision.desc}</p>

      {decision.kind === "club" ? (
        <div className="mt-3.5 grid gap-2 sm:grid-cols-3">
          {decision.options.map((o, i) => (
            <button
              key={`${o.club.n}-${o.retire ? "r" : i}`}
              type="button"
              onClick={() => onClub(o.club, !!o.retire)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-4 text-center transition hover:border-rose-400 hover:bg-rose-50 dark:border-neutral-700 dark:hover:border-rose-500 dark:hover:bg-rose-500/10"
            >
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                {o.retire ? "여기서 마무리" : o.stay ? "잔류" : decision.youth ? "입단" : "이적"}
              </span>
              {o.retire ? (
                <span className="text-sm font-semibold text-neutral-900 dark:text-white">은퇴한다</span>
              ) : (
                <>
                  <Logo club={o.club} size={40} />
                  <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                    {o.club.n}
                  </span>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    {leagueLabel(o.club.l)}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3.5 grid gap-2 sm:grid-cols-2">
          {decision.options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onEvent(o.id)}
              className="rounded-xl border border-neutral-200 p-3.5 text-left transition hover:border-rose-400 hover:bg-rose-50 dark:border-neutral-700 dark:hover:border-rose-500 dark:hover:bg-rose-500/10"
            >
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">{o.label}</span>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{o.desc}</p>
              {o.odds && (
                <div className="mt-2.5 space-y-1">
                  <div className="flex items-center justify-between rounded bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                    <span>{o.odds.good}</span>
                    <span className="font-semibold tabular-nums">{o.odds.goodPct}%</span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-rose-500/10 px-2 py-1 text-[11px] text-rose-700 dark:text-rose-300">
                    <span>{o.odds.bad}</span>
                    <span className="font-semibold tabular-nums">{o.odds.badPct}%</span>
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RetiredCard({ state, onReset }: { state: CareerState; onReset: () => void }) {
  const sum = summarize(state);
  const [shared, setShared] = useState<"idle" | "copied" | "failed">("idle");

  // 결과는 서버에 저장하지 않는다 — 공유 링크 자체가 기록이다
  const share = async () => {
    const url = `${window.location.origin}/career/result?${buildShareParams(state, sum).toString()}`;
    const text = `축구선수 인생 살아보기 — 통산 ${sum.apps}경기 ${sum.goals}골, 최고 능력치 ${sum.peakOvr}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "내 축구 커리어", text, url });
        return;
      } catch {
        // 사용자가 공유창을 닫은 경우 — 링크 복사로 넘어간다
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared("copied");
      window.setTimeout(() => setShared("idle"), 2000);
    } catch {
      setShared("failed");
    }
  };

  const stats: [string, string][] = [
    ["통산 경기", String(sum.apps)],
    ["골", String(sum.goals)],
    ["도움", String(sum.assists)],
    ["우승", String(sum.titles)],
    ["최고 능력치", String(sum.peakOvr)],
    ["최고 몸값", money(sum.peakValue)],
    ["거쳐간 구단", `${sum.clubs}팀`],
    ["대표팀", `${state.caps}경기`],
  ];
  return (
    <div className="rounded-2xl border border-neutral-200 p-5 text-center dark:border-neutral-700">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">커리어가 끝났습니다</h2>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {sum.seasons}시즌을 뛰었습니다.
      </p>
      <dl className="mt-4 grid grid-cols-4 gap-y-3.5">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10px] text-neutral-500 dark:text-neutral-400">{k}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-neutral-900 dark:text-white">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={share}
          className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-600"
        >
          {shared === "copied" ? "링크 복사됨" : shared === "failed" ? "복사 실패" : "결과 공유하기"}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          다시 살아보기
        </button>
      </div>
    </div>
  );
}
