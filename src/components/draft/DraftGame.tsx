"use client";
// 농구 블라인드 드래프트 게임 화면 — 로비에서 시작해 5판을 뽑고 결과 페이지로 보낸다. 수치는 서버가 공개한 것만 받는다.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, Filter, Play, Plus, RefreshCw, Repeat, Search, Shuffle, Zap } from "lucide-react";
import LineupPanel from "@/components/draft/LineupPanel";
import PlayerFace from "@/components/draft/PlayerFace";
import { POS_LABEL, seasonLabel, signed } from "@/lib/draft/labels";
import type { Lifeline } from "@/lib/draft/engine";
import type { CardView, GameView } from "@/lib/draft/view";
import type { DraftMode, Pos } from "@/lib/draft/types";

const LIFELINE_UI: Array<{ kind: Lifeline; label: string; desc: string; Icon: typeof Eye }> = [
  { kind: "redeal", label: "다시 뽑기", desc: "같은 팀에서 새 선수 21명", Icon: Shuffle },
  { kind: "swap", label: "팀 바꾸기", desc: "이 판을 버리고 다른 팀으로", Icon: Repeat },
  { kind: "position", label: "포지션", desc: "고른 포지션 선수만 12명", Icon: Filter },
  { kind: "double", label: "더블 픽", desc: "이 판에서 2명 뽑기", Icon: Plus },
  { kind: "reveal", label: "전체 공개", desc: "이 판의 수치를 모두 보기", Icon: Eye },
  { kind: "flash", label: "시즌 섞기", desc: "같은 선수들, 다른 시즌으로", Icon: Zap },
];

async function call(body: Record<string, unknown>): Promise<{ view?: GameView | null; error?: string }> {
  try {
    const r = await fetch("/api/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return (await r.json()) as { view?: GameView | null; error?: string };
  } catch {
    return { error: "연결이 끊겼습니다. 다시 시도해 주세요" };
  }
}

export default function DraftClient({ mode, modeLabel }: { mode: DraftMode; modeLabel: string }) {
  const router = useRouter();
  const [view, setView] = useState<GameView | null>(null);
  const [saved, setSaved] = useState<GameView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [posOpen, setPosOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    call({ action: "resume", mode }).then((r) => alive && setSaved(r.view ?? null));
    return () => {
      alive = false;
    };
  }, [mode]);

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      if (busy) return;
      setBusy(true);
      setError("");
      const r = await call(body);
      if (r.error) setError(r.error);
      else if (r.view) {
        if (r.view.done) {
          router.push(`/basketball/draft/result/${r.view.id}`);
          return; // 이동 중에는 버튼을 잠근 채로 둔다
        }
        setView(r.view);
        setPosOpen(false);
        if (body.action === "next" || body.action === "start") window.scrollTo({ top: 0, behavior: "smooth" });
      }
      setBusy(false);
    },
    [busy, router],
  );

  if (!view) {
    return (
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => run({ action: "start", mode })}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-rose-600/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-rose-500 disabled:opacity-60"
        >
          <Play className="h-4 w-4" aria-hidden />
          {modeLabel} 드래프트 시작
        </button>
        {saved && (
          <button
            type="button"
            onClick={() => setView(saved)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-neutral-900 ring-1 ring-black/10 transition-all duration-300 hover:-translate-y-0.5 dark:bg-white/[0.06] dark:text-white dark:ring-white/10"
          >
            하던 판 이어하기 ({saved.picks.length}/5)
          </button>
        )}
        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
    );
  }

  const left = 5 - view.picks.length;
  const canLifeline = !view.boardFinished && view.cards.every((c) => !c.picked);
  const lastPick = view.cards.filter((c) => c.picked).at(-1);
  const waitingSecond = view.picksAllowed === 2 && !view.boardFinished && view.cards.some((c) => c.picked);

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0">
        {/* 판 머리 — 몇 번째 판, 어느 구단 */}
        <div className="flex items-center gap-3 rounded-[1.75rem] bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:shadow-none dark:ring-white/10">
          <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: view.team.color }} aria-hidden />
          {view.team.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.team.logo} alt="" className="h-10 w-10 shrink-0 object-contain" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-rose-600 dark:text-rose-400">
              {view.round} / {view.rounds} 판
            </p>
            <h2 className="truncate text-lg font-semibold text-neutral-900 dark:text-white">{view.team.name}</h2>
          </div>
          <div className="shrink-0 text-right lg:hidden">
            <div className="text-xl font-bold tabular-nums text-neutral-900 dark:text-white">{signed(view.score.total)}</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{view.picks.length}/5명</div>
          </div>
        </div>

        {/* 찬스 */}
        <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {LIFELINE_UI.map(({ kind, label, desc, Icon }) => {
            const used = view.used.includes(kind);
            const blocked = used || !canLifeline || busy || (kind === "double" && left < 2);
            return (
              <button
                key={kind}
                type="button"
                title={desc}
                disabled={blocked}
                onClick={() => (kind === "position" ? setPosOpen((v) => !v) : run({ action: "lifeline", gameId: view.id, kind }))}
                className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium ring-1 transition-all duration-300 ${
                  used
                    ? "bg-neutral-100 text-neutral-400 line-through ring-transparent dark:bg-white/[0.02] dark:text-neutral-600"
                    : "bg-white text-neutral-800 ring-black/5 hover:-translate-y-0.5 hover:ring-rose-500/40 disabled:opacity-40 disabled:hover:translate-y-0 dark:bg-white/[0.04] dark:text-neutral-100 dark:ring-white/10"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span className="break-keep">{label}</span>
              </button>
            );
          })}
        </div>
        {posOpen && canLifeline && (
          <div className="mt-2 flex gap-1.5">
            {(["G", "F", "C"] as Pos[]).map((p) => (
              <button
                key={p}
                type="button"
                disabled={busy}
                onClick={() => run({ action: "lifeline", gameId: view.id, kind: "position", pos: p })}
                className="flex-1 rounded-xl bg-amber-400 px-3 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-300"
              >
                {POS_LABEL[p]}
              </button>
            ))}
          </div>
        )}

        {/* 상태 띠 */}
        <div className="mt-3 flex min-h-[3.25rem] items-center justify-between gap-3 rounded-2xl bg-neutral-900 px-4 py-2.5 text-white dark:bg-white/[0.08]">
          <p className="min-w-0 text-sm break-keep">
            {view.boardFinished && lastPick?.stats ? (
              <>
                <b>{lastPick.name}</b> {signed(lastPick.stats.total)} · 이 판 {view.cards.length}명 중 <b>{lastPick.stats.rank}위</b>
              </>
            ) : waitingSecond ? (
              "더블 픽 — 한 명 더 뽑으세요"
            ) : view.sorted ? (
              "전체 공개 — 기여도 순으로 정렬했습니다"
            ) : (
              <>
                이름·시즌·포지션만 보고 한 명을 뽑으세요
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-white/60">
                  <Search className="h-3 w-3" aria-hidden />
                  돋보기 {view.spyLeft}회
                </span>
              </>
            )}
          </p>
          {view.boardFinished && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run({ action: "next", gameId: view.id })}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-300 disabled:opacity-60"
            >
              {left === 0 ? "결과 보기" : "다음 판"}
              {left === 0 ? <ArrowRight className="h-4 w-4" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

        {/* 카드 */}
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {view.cards.map((c) => (
            <Card
              key={c.id}
              c={c}
              mode={view.mode}
              color={view.team.color}
              locked={view.boardFinished || busy}
              canSpy={!view.boardFinished && view.spyLeft > 0 && !busy}
              onPick={() => run({ action: "pick", gameId: view.id, cardId: c.id })}
              onSpy={() => run({ action: "spy", gameId: view.id, cardId: c.id })}
            />
          ))}
        </ul>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <LineupPanel mode={view.mode} picks={view.picks} score={view.score} lockdownAt={view.lockdownAt} />
      </aside>
    </div>
  );
}

function Card({
  c, mode, color, locked, canSpy, onPick, onSpy,
}: {
  c: CardView; mode: DraftMode; color: string; locked: boolean; canSpy: boolean; onPick: () => void; onSpy: () => void;
}) {
  const s = c.stats;
  return (
    <li
      className={`flex flex-col rounded-2xl p-3 ring-1 transition-all duration-300 ${
        c.picked
          ? "bg-amber-50 ring-2 ring-amber-400 dark:bg-amber-400/10"
          : "bg-white ring-black/5 dark:bg-white/[0.04] dark:ring-white/10"
      } ${locked && !c.picked ? "opacity-70" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        <PlayerFace src={c.photo} color={color} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            <span className="tabular-nums">{seasonLabel(mode, c.season)}</span>
            {s?.rank != null && <span className="ml-auto rounded-md bg-neutral-100 px-1.5 text-neutral-500 dark:bg-white/10 dark:text-neutral-300">{s.rank}위</span>}
          </div>
          <div className="text-sm font-semibold leading-tight break-keep text-neutral-900 dark:text-white">{c.name}</div>
          <div className="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-neutral-400">
            {c.pos.map((p) => POS_LABEL[p]).join("·")} · {c.teamName}
          </div>
        </div>
      </div>

      {s ? (
        <>
          <dl className="mt-2.5 grid grid-cols-3 gap-1 text-center">
            {([["공격", s.off], ["수비", s.def], ["합계", s.total]] as const).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-neutral-100 py-1 dark:bg-white/[0.06]">
                <dt className="text-[10px] text-neutral-500 dark:text-neutral-400">{k}</dt>
                <dd className={`text-xs font-semibold tabular-nums ${v < 0 ? "text-rose-600 dark:text-rose-400" : "text-neutral-900 dark:text-white"}`}>{signed(v)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-1.5 text-center text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500">
            {s.pts}점 · {s.reb}리바 · {s.ast}어시
          </p>
        </>
      ) : null}

      {!locked && !c.picked && (
        <div className="mt-2.5 flex gap-1.5">
          {!s && (
            <button
              type="button"
              disabled={!canSpy}
              onClick={onSpy}
              aria-label={`${c.name} 돋보기로 미리 보기`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200 disabled:opacity-30 dark:bg-white/[0.06] dark:text-neutral-300"
            >
              <Search className="h-4 w-4" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={onPick}
            className="h-9 flex-1 rounded-xl bg-neutral-900 text-xs font-semibold text-white transition hover:bg-rose-600 dark:bg-white dark:text-neutral-900 dark:hover:bg-rose-400"
          >
            뽑기
          </button>
        </div>
      )}
    </li>
  );
}
