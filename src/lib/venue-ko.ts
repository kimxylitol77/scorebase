// 구장·도시 한글 표기 사전 — 한국(K리그) 구장 우선. 미등록은 원문 그대로 반환.
// 소비처: /teams 클럽 정보 홈구장, /live 경기 정보 카드. 키 = ts 영문 구장/도시명.

export const VENUE_KO: Record<string, string> = {
  "Seoul World Cup Stadium": "서울월드컵경기장",
  "Gwangju World Cup Stadium": "광주월드컵경기장",
  "Ansan Wa Stadium": "안산 와스타디움",
  "Incheon Football Stadium": "인천축구전용경기장",
  "Gwangyang Football Stadium": "광양축구전용구장",
  "Mokdong Stadium": "목동종합운동장",
  "Daejeon World Cup Stadium": "대전월드컵경기장",
  "Cheonan Baekseok Stadium": "천안 백석 스타디움",
  "Anyang Stadium": "안양종합운동장",
  "Jeonju World Cup Stadium": "전주월드컵경기장",
  "Changwon Football Center": "창원축구센터",
  "Yi Sun-sin Stadium": "이순신종합운동장",
  "Tancheon Sports Complex": "탄천종합운동장",
  "Gangneung Stadium": "강릉종합운동장",
  "Pohang Steel Yard": "포항스틸야드",
  "Ulsan Munsu Football Stadium": "울산문수축구경기장",
  "Busan Gudeok Stadium": "부산구덕운동장",
  "Bucheon Stadium": "부천종합운동장",
  "Suwon World Cup Stadium": "수원월드컵경기장",
  "Suwon Civic Stadium": "수원종합운동장",
};

export const CITY_KO: Record<string, string> = {
  Seoul: "서울", Gwangju: "광주", Ansan: "안산", Incheon: "인천", Gwangyang: "광양",
  Daejeon: "대전", Cheonan: "천안", Anyang: "안양", Jeonju: "전주", Changwon: "창원",
  "Asan South Chungcheong": "아산", Seongnam: "성남", Gangneung: "강릉", Pohang: "포항",
  Ulsan: "울산", Busan: "부산", Bucheon: "부천", Suwon: "수원", Gimcheon: "김천",
  Jeju: "제주", Gimpo: "김포", Gimhae: "김해", Paju: "파주", Cheongju: "청주", Hwaseong: "화성",
};

export const venueKo = (name?: string | null): string | null | undefined =>
  name ? VENUE_KO[name] ?? name : name;
export const cityKo = (city?: string | null): string | null | undefined =>
  city ? CITY_KO[city] ?? city : city;
