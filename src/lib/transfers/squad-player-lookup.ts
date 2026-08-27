// af 이적 목록의 선수 이름 → 그 팀 공식 스쿼드의 ts 선수 id.
//
// 왜 필요한가. 이적 목록의 링크는 ts-af-player-map 으로 만드는데, 그 맵에는 **DB 행이 없는
// 낡은 ts id** 가 섞여 있다 (2026-08-27 M. Godts af 340153 → l7oqdehl0yv9r51, 실제 정본은
// dn1m1gh3lzj4moe). 같은 선수에 ts id 가 여럿 부여되며 생기는 유령 페이지 계열이다.
// 영입 선수는 그 팀 공식 명단에 들어와 있으므로, 살아 있는 id 를 거기서 집는다.
//
// af 는 이름을 축약해서 준다("M. Godts") — 성으로 맞춘다. 대신 **명단에서 유일할 때만**
// 쓴다. 성만으로는 동성 선수를 잘못 가리킬 수 있고, 잘못된 선수 페이지로 보내는 것은
// 링크가 없는 것보다 나쁘다.

export interface SquadMember {
  id: string;
  name: string;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 마지막 토큰 = 성. af("M. Godts")·ts("Mika Godts") 양쪽에서 같은 값이 나온다. */
function surname(s: string): string {
  const parts = normalize(s).split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** 성이 명단에서 유일하게 일치하는 선수의 ts id. 없거나 둘 이상이면 null. */
export function squadTsIdByName(
  squad: SquadMember[] | undefined | null,
  playerName: string,
): string | null {
  if (!squad || squad.length === 0) return null;
  const target = surname(playerName);
  // 너무 짧은 성은 오매칭 위험이 커 쓰지 않는다.
  if (target.length < 4) return null;
  const hits = squad.filter((m) => surname(m.name) === target);
  return hits.length === 1 ? hits[0].id : null;
}
