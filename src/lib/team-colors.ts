// 팀별 brand 컬러 — 매치 카드 좌측 액센트 / 팀 페이지 배경 그라디언트 등.
// 매핑 누락 시 null (호출자가 fallback 처리).
// 키: 우리 DB Team.name (영문 또는 매핑된 한글) 또는 toKoreanTeamName 결과.

const RAW: Record<string, string> = {
  // EPL
  "Manchester City": "#6CABDD",
  "맨체스터 시티": "#6CABDD",
  "Manchester United": "#DA291C",
  "맨체스터 유나이티드": "#DA291C",
  "Liverpool": "#C8102E",
  "리버풀": "#C8102E",
  "Arsenal": "#EF0107",
  "아스널": "#EF0107",
  "Chelsea": "#034694",
  "첼시": "#034694",
  "Tottenham": "#132257",
  "토트넘": "#132257",
  "Newcastle": "#241F20",
  "뉴캐슬": "#241F20",
  "Aston Villa": "#670E36",
  "아스톤 빌라": "#670E36",
  "West Ham": "#7A263A",
  "웨스트햄": "#7A263A",
  "브라이턴": "#0057B8",
  "Brighton & Hove Albion": "#0057B8",
  "Brentford": "#E30613",
  "Crystal Palace": "#1B458F",
  "Everton": "#003399",
  "Fulham": "#000000",
  "Wolves": "#FDB913",
  "노팅엄 포리스트": "#DD0000",

  // LALIGA
  "Real Madrid": "#FEBE10",
  "레알 마드리드": "#FEBE10",
  "Barcelona": "#A50044",
  "FC Barcelona": "#A50044",
  "바르셀로나": "#A50044",
  "Atletico Madrid": "#CB3524",
  "Atlético Madrid": "#CB3524",
  "아틀레티코 마드리드": "#CB3524",
  "Athletic Club": "#EE2523",
  "Real Sociedad": "#0067B1",
  "레알 소시에다드": "#0067B1",
  "Sevilla": "#D4011D",
  "Real Betis": "#0BB363",
  "Valencia": "#FF7B00",
  "Villarreal": "#FFE667",
  "Girona": "#CD2534",

  // BUNDESLIGA
  "Bayern Munich": "#DC052D",
  "바이에른 뮌헨": "#DC052D",
  "Borussia Dortmund": "#FDE100",
  "도르트문트": "#FDE100",
  "RB Leipzig": "#DD0741",
  "RB 라이프치히": "#DD0741",
  "Bayer Leverkusen": "#E32219",
  "레버쿠젠": "#E32219",
  "Eintracht Frankfurt": "#000000",
  "프랑크푸르트": "#000000",
  "VfB Stuttgart": "#E32219",
  "슈투트가르트": "#E32219",
  "Hoffenheim": "#1961B5",
  "호펜하임": "#1961B5",
  "Mainz": "#C3141E",
  "마인츠": "#C3141E",
  "함부르크": "#005CA9",
  "쾰른": "#ED1C24",

  // SERIE A
  "Juventus": "#000000",
  "유벤투스": "#000000",
  "Inter": "#0068A8",
  "Inter Milan": "#0068A8",
  "인테르": "#0068A8",
  "AC Milan": "#FB090B",
  "Milan": "#FB090B",
  "AC 밀란": "#FB090B",
  "Napoli": "#12A0D7",
  "나폴리": "#12A0D7",
  "Roma": "#8E1F2F",
  "AS Roma": "#8E1F2F",
  "로마": "#8E1F2F",
  "Lazio": "#87CEEB",
  "라치오": "#87CEEB",
  "Atalanta": "#1565C0",
  "Fiorentina": "#592884",

  // LIGUE 1
  "Paris Saint Germain": "#004170",
  "PSG": "#004170",
  "파리 생제르맹": "#004170",
  "Marseille": "#2FAEE0",
  "마르세유": "#2FAEE0",
  "Lyon": "#001E60",
  "Monaco": "#E2231A",
  "Lille": "#E01E1E",
  "Nice": "#000000",

  // K LEAGUE 1
  "FC 서울": "#C8102E",
  "전북 현대": "#177245",
  "포항 스틸러스": "#C8102E",
  "울산 HD": "#005EB8",
  "수원 삼성": "#005CB9",
  "대구 FC": "#0C2C5A",
  "광주 FC": "#FFB81C",
  "강원 FC": "#FF6B00",
  "제주 SK": "#F58220",
  "대전 하나": "#7A2A8C",
  "인천 유나이티드": "#005AAB",
  "김천 상무": "#1F4C8F",

  // J1
  "Urawa Red Diamonds": "#C8102E",
  "우라와 레드 다이아몬즈": "#C8102E",
  "우라와": "#C8102E",
  "FC Tokyo": "#0D2A50",
  "FC 도쿄": "#0D2A50",
  "Yokohama F. Marinos": "#0033A0",
  "요코하마 F. 마리노스": "#0033A0",
  "Kashima Antlers": "#A91E22",
  "카시마 앤틀러스": "#A91E22",
  "Kashiwa Reysol": "#FFC60A",
  "카시와 레이솔": "#FFC60A",
  "Vissel Kobe": "#86142E",
  "비셀 고베": "#86142E",
  "Gamba Osaka": "#005CA2",
  "감바 오사카": "#005CA2",
  "Cerezo Osaka": "#C72030",
  "세레소 오사카": "#C72030",
  "Kawasaki Frontale": "#003F8E",
  "가와사키 프론탈레": "#003F8E",
  "Sanfrecce Hiroshima": "#5318AB",
  "산프레체 히로시마": "#5318AB",
  "Nagoya Grampus": "#E40000",
  "나고야 그램퍼스": "#E40000",

  // SAUDI PL
  "Al Hilal": "#0048B8",
  "알 힐랄": "#0048B8",
  "Al Nassr": "#FFCC00",
  "알 나스르": "#FFCC00",
  "Al Ittihad": "#FAB81B",
  "알 이티하드": "#FAB81B",
  "Al Ahli": "#008C44",
  "알 아흘리": "#008C44",

  // 에레디비시
  "Ajax": "#D2122E",
  "아약스": "#D2122E",
  "PSV Eindhoven": "#ED1C24",
  "PSV 아인트호벤": "#ED1C24",
  "Feyenoord": "#E60026",
  "페예노르트": "#E60026",

  // 포르투갈
  "Porto": "#1A4480",
  "포르투": "#1A4480",
  "Benfica": "#DA0000",
  "벤피카": "#DA0000",
  "Sporting CP": "#008057",
  "스포르팅": "#008057",
  "Braga": "#A4282A",
  "브라가": "#A4282A",

  // 터키
  "Galatasaray": "#FCB52D",
  "갈라타사라이": "#FCB52D",
  "Fenerbahce": "#0B449C",
  "페네르바체": "#0B449C",
  "Besiktas": "#000000",
  "베식타시": "#000000",
  "Trabzonspor": "#7B0E11",
  "트라브존스포르": "#7B0E11",

  // 벨기에
  "Club Brugge": "#0A4D8C",
  "클럽 브뤼헤": "#0A4D8C",
  "Anderlecht": "#592884",
  "안데를레흐트": "#592884",
  "Genk": "#1B5DAB",
  "헹크": "#1B5DAB",

  // 스코틀랜드
  "Celtic": "#018749",
  "셀틱": "#018749",
  "Rangers": "#00529F",
  "레인저스": "#00529F",
  "Hearts": "#7D2128",
  "하츠": "#7D2128",

  // 그리스
  "Olympiacos": "#B22227",
  "올림피아코스": "#B22227",
  "Panathinaikos": "#016138",
  "파나티나이코스": "#016138",
  "PAOK": "#000000",
  "AEK Athens": "#FFD800",

  // 브라질 빅 클럽
  "Flamengo": "#C8102E",
  "플라멩구": "#C8102E",
  "Palmeiras": "#006437",
  "팔메이라스": "#006437",
  "Sao Paulo": "#E40000",
  "상파울루": "#E40000",
  "Corinthians": "#000000",
  "코린치안스": "#000000",
  "Santos": "#FFFFFF",
  "산토스": "#000000",
  "Botafogo": "#000000",
  "보타포구": "#000000",
  "Fluminense": "#860D0E",
  "플루미넨세": "#860D0E",
  "Internacional": "#E5051D",
  "인테르나시오나우": "#E5051D",
  "Atletico-MG": "#000000",
  "아틀레치쿠 미네이루": "#000000",

  // 멕시코
  "Club America": "#001D5A",
  "클럽 아메리카": "#001D5A",
  "Cruz Azul": "#003DA5",
  "크루스 아술": "#003DA5",
  "Chivas Guadalajara": "#C8102E",
  "차바스": "#C8102E",
  "Tigres UANL": "#FFCD00",
  "티그레스": "#FFCD00",
  "Monterrey": "#003DA5",
  "몬테레이": "#003DA5",
};

/** 팀명 → brand 컬러 hex (없으면 hash 기반 자동 생성).
 *  매핑이 있는 메이저 팀(EPL·LALIGA 등)은 진짜 brand 색,
 *  없는 팀은 팀명 해시 → HSL 자동 색상 (같은 팀명은 항상 같은 색).
 *  채도 60%·명도 45% 로 너무 흐릿하지도 너무 형광스럽지도 않게 유지.
 */
export function teamColor(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  const brand = RAW[trimmed];
  if (brand) return brand;
  // hash → HSL
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  // 명도 55% · 채도 70% — 다크/라이트 배경 모두에서 잘 보임
  return `hsl(${hue}, 70%, 55%)`;
}
