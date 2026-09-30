// 하키 선수 사진 (서버 전용) — ts player_id → 사진 URL. 큰 json 을 읽으므로 클라이언트 컴포넌트에서 import 하지 말 것.
// NHL: ts id → 영문명(nhl-live-names) → data/nhl-players.json(NHL 공식 mugs) 이름 매칭. KHL·유럽: khl-players 프로필 photo.
import nhlRaw from "../../../../data/nhl-players.json";
import { nhlPlayerInfo } from "@/lib/sports/nhl-live-names";
import { khlPlayerInfo } from "@/lib/sports/khl-players";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

let nhlByName: Map<string, string> | null = null;
function nhlPhotoByName(en: string): string | null {
  if (!nhlByName) {
    nhlByName = new Map();
    for (const p of Object.values(nhlRaw as Record<string, { name?: string; photo?: string }>)) {
      if (p.name && p.photo) nhlByName.set(norm(p.name), p.photo);
    }
  }
  return nhlByName.get(norm(en)) ?? null;
}

export function hockeyPlayerPhoto(tsId: string | undefined | null, league: string): string | null {
  if (!tsId) return null;
  if (league === "NHL") {
    const en = nhlPlayerInfo(tsId)?.en;
    return en ? nhlPhotoByName(en) : null;
  }
  return khlPlayerInfo(tsId)?.photo ?? null;
}
