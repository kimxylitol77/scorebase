// 즐겨찾기 전용 사운드 — ⭐ 내 경기 섹션의 자체 토글 (FavoriteMatches 컴포넌트).
//
// 동작:
// - LiveSoundToggle (전체 매치 사운드, /scores 헤더) 와 별개 동작
// - 켜지면 LiveScoresBar 의 점수 감지 useEffect 가 useFavorites().ids 와
//   매치 id 매칭 → 일치 매치만 chime. 다른 매치는 무시.
// - 우선순위: favOnly 가 ON 이면 전체 사운드 ON 여부 무관, fav 매치만.
//   favOnly OFF + 전체 ON 이면 모든 매치. 둘 다 OFF 면 침묵.

export const FAV_SOUND_STORAGE_KEY = "scorebase-fav-sound";
export const FAV_SOUND_CHANGE_EVENT = "scorebase-fav-sound-change";
