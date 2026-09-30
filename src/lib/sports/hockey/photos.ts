// 하키 선수 사진·선수 페이지 링크 (서버 전용) — ts player_id 기준. 큰 json 을 읽으므로 클라이언트 컴포넌트에서 import 하지 말 것.
// NHL: ts id → 영문명(nhl-live-names) → data/nhl-players.json(NHL 공식 id·mugs) 이름 매칭 → /players/{nhlId}?league=NHL.
// KHL·유럽: khl-players 프로필 photo, 링크는 ts id 그대로 /players/{tsId}?league=.
import nhlRaw from "../../../../data/nhl-players.json";
import { nhlPlayerInfo } from "@/lib/sports/nhl-live-names";
import { khlPlayerInfo } from "@/lib/sports/khl-players";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type NhlHit = { id: string; photo?: string };
let nhlByName: Map<string, NhlHit> | null = null;
// 애칭 폴백 키 "성|이름 첫 글자" — ts 는 Nicholas Paul·Christopher Tanev, NHL 은 Nick·Chris. 같은 키가 둘 이상이면 null(오매칭 방지)
let nhlByInitial: Map<string, NhlHit | null> | null = null;
const initialKey = (n: string) => {
  const parts = norm(n).split(/\s+/);
  return parts.length >= 2 ? `${parts.slice(1).join(" ")}|${parts[0][0]}` : null;
};
function nhlByEn(en: string): NhlHit | null {
  if (!nhlByName || !nhlByInitial) {
    nhlByName = new Map();
    nhlByInitial = new Map();
    for (const [id, p] of Object.entries(nhlRaw as Record<string, { name?: string; photo?: string }>)) {
      if (!p.name) continue;
      nhlByName.set(norm(p.name), { id, photo: p.photo });
      const k = initialKey(p.name);
      if (k) nhlByInitial.set(k, nhlByInitial.has(k) ? null : { id, photo: p.photo });
    }
  }
  const exact = nhlByName.get(norm(en));
  if (exact) return exact;
  const k = initialKey(en);
  return k ? nhlByInitial.get(k) ?? null : null;
}
function nhlOf(tsId: string) {
  const en = nhlPlayerInfo(tsId)?.en;
  return en ? nhlByEn(en) : null;
}

export function hockeyPlayerPhoto(tsId: string | undefined | null, league: string): string | null {
  if (!tsId) return null;
  if (league === "NHL") return nhlOf(tsId)?.photo ?? null;
  return khlPlayerInfo(tsId)?.photo ?? null;
}

/** 선수 상세 링크 — NHL 은 공식 id 로 매칭된 선수만, ts 선수 페이지 리그(KHL·유럽)는 ts id. 없으면 null(링크 없이 이름만) */
export function hockeyPlayerHref(tsId: string | undefined | null, league: string, tsPlayerLeague: boolean): string | null {
  if (!tsId) return null;
  if (league === "NHL") {
    const n = nhlOf(tsId);
    return n ? `/players/${n.id}?league=NHL` : null;
  }
  return tsPlayerLeague ? `/players/${tsId}?league=${league}` : null;
}
