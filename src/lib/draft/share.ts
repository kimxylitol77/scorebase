// 드래프트 결과 "게시판에 올리기" 프리필 — 결과를 DB 에서 다시 읽어 글로 만든다.
// 수치는 전부 서버 재조회라 링크를 조작해도 가짜 점수가 들어가지 않는다.
import "server-only";
import { RING_TITLE, rankLabel, seasonLabel, signed, slotLabels } from "./labels";
import { MODES, playPath, resultPath } from "./modes";
import { recordLabel } from "./season";
import { getDraftResult } from "./service";

export async function buildDraftShareText(id: string): Promise<{ title: string; content: string } | null> {
  const r = await getDraftResult(id).catch(() => null);
  if (!r) return null;
  const cfg = MODES[r.mode];
  const league = cfg.label;
  const SLOT_LABELS = slotLabels(r.mode);
  const record = recordLabel(r.season, cfg.draws);
  const s = r.snapshot.score;
  const rows = [...r.snapshot.picks]
    .sort((a, b) => (a.slot < 0 ? 9 : a.slot) - (b.slot < 0 ? 9 : b.slot))
    .map((p) => {
      const st = p.stats!;
      return `| ${p.slot >= 0 ? SLOT_LABELS[p.slot] : "자리 없음"} | **${p.name}** | ${seasonLabel(r.mode, p.season)} ${p.teamName} | ${signed(st.off)} | ${signed(st.def)} | ${signed(st.total)} |`;
    });
  const content = [
    `[![${league} 블라인드 드래프트 결과](/api/og/draft?id=${r.id})](${resultPath(r.id)})`,
    "",
    `**${league} 블라인드 드래프트** — 시즌 ${record} · ${signed(r.total)}점 · ${RING_TITLE[r.rings]} · ${rankLabel(r.percentile)}`,
    "",
    `| 자리 | 선수 | 시즌·팀 | ${cfg.offLabel} | ${cfg.defLabel} | 합계 |`,
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    `보너스 ${signed(s.bonus)} — 풀 라인업 ${signed(s.full)} · 균형 ${signed(s.balance)} · 내구성 ${signed(s.durability)} · ${cfg.lockdownLabel} ${signed(s.lockdown)}`,
    "",
    "한마디는 아래에 적어 주세요.",
    "",
    "",
    `결과 보기 → https://www.scorebase.kr${resultPath(r.id)}`,
    `나도 해보기 → https://www.scorebase.kr${playPath(r.mode)}`,
  ].join("\n");
  return {
    title: `[블라인드 드래프트] ${league} ${record} · ${RING_TITLE[r.rings]} — ${r.snapshot.picks.map((p) => p.name).join("·")}`.slice(0, 90),
    content,
  };
}
