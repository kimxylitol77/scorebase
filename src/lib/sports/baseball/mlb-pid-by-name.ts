// MLB 선수 이름 → MLB 번호 — ESPN 문자중계·경기 헤더처럼 이름만 주는 곳을 박스스코어 번호로 선수 페이지에 잇는다.

type NamedPlayer = { pid: number; name: string };

/**
 * 영문 이름과 한글 표시 이름을 둘 다 키로 쓴다(중계는 한글, 헤더는 소스에 따라 영문).
 * 같은 이름이 서로 다른 번호에 붙으면 그 이름은 빼 둔다 — 틀린 선수 페이지로 보내느니 링크를 안 건다.
 */
export function mlbPidByName(players: NamedPlayer[], nameKoBy?: Record<number, string>): Record<string, number> {
  const out: Record<string, number> = {};
  const ambiguous = new Set<string>();
  const add = (raw: string | undefined, pid: number) => {
    const key = raw?.trim();
    if (!key || ambiguous.has(key)) return;
    if (out[key] != null && out[key] !== pid) {
      delete out[key];
      ambiguous.add(key);
      return;
    }
    out[key] = pid;
  };
  for (const p of players) {
    add(p.name, p.pid);
    add(nameKoBy?.[p.pid], p.pid);
  }
  return out;
}
