// 감독 한글 이름 정본 적용 — 영문 이름 하나에 한글 표기 하나. 감독 데이터 파일 네 개가 이 표기를 따른다.
// 파일 입출력은 scripts/sync-coach-names.ts, 여기는 순수 함수(테스트 대상).
interface Named { name?: string | null; nameKo?: string | null }

export interface CoachFiles {
  /** ts 팀 id → 현직 감독 */
  teamCoaches: Record<string, Named>;
  /** ts 감독 id → 이름·사진 */
  coachPhotos: Record<string, Named>;
  /** ts 감독 id → 한글 이름(국가대표) */
  coachNames: Record<string, string>;
  /** ts 감독 id → 경력. 영문 이름이 없어 coachPhotos 로 찾는다 */
  coachCareers: Record<string, { nameKo?: string | null }>;
}

const hasKo = (s?: string | null): s is string => !!s && /[가-힣]/.test(s);
const key = (s: string) => s.trim();

/** 정본에 없는 감독을 파일에서 받아들인다. 먼저 본 표기가 정본이 된다(팀 감독 → 사진 → 국가대표 → 경력). 돌려주는 값은 새로 들어온 수. */
export function absorbInto(canon: Record<string, string>, f: CoachFiles): number {
  let added = 0;
  const take = (name?: string | null, ko?: string | null) => {
    if (!name || !hasKo(ko) || hasKo(name) || canon[key(name)]) return;
    canon[key(name)] = ko;
    added++;
  };
  for (const c of Object.values(f.teamCoaches)) take(c?.name, c?.nameKo);
  for (const c of Object.values(f.coachPhotos)) take(c?.name, c?.nameKo);
  for (const [id, ko] of Object.entries(f.coachNames)) take(f.coachPhotos[id]?.name, ko);
  for (const [id, c] of Object.entries(f.coachCareers)) take(f.coachPhotos[id]?.name, c?.nameKo);
  return added;
}

/** 정본 표기로 파일 값을 덮는다(제자리 수정). 돌려주는 값은 파일별로 바뀐 수. */
export function applyCanon(canon: Record<string, string>, f: CoachFiles): Record<keyof CoachFiles, number> {
  const n = { teamCoaches: 0, coachPhotos: 0, coachNames: 0, coachCareers: 0 };
  const want = (name?: string | null) => (name ? canon[key(name)] : undefined);
  for (const c of Object.values(f.teamCoaches)) {
    const ko = want(c?.name);
    if (ko && c.nameKo !== ko) { c.nameKo = ko; n.teamCoaches++; }
  }
  for (const c of Object.values(f.coachPhotos)) {
    const ko = want(c?.name);
    if (ko && c.nameKo !== ko) { c.nameKo = ko; n.coachPhotos++; }
  }
  for (const id of Object.keys(f.coachNames)) {
    const ko = want(f.coachPhotos[id]?.name);
    if (ko && f.coachNames[id] !== ko) { f.coachNames[id] = ko; n.coachNames++; }
  }
  for (const [id, c] of Object.entries(f.coachCareers)) {
    const ko = want(f.coachPhotos[id]?.name);
    // 경력 파일은 한글 이름이 이미 있는 항목만 맞춘다 — 없는 칸을 새로 채우는 건 빌더의 일
    if (ko && hasKo(c?.nameKo) && c.nameKo !== ko) { c.nameKo = ko; n.coachCareers++; }
  }
  return n;
}
