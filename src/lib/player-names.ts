// 영문 선수명 → 한글 표시명 매핑.
// api-football / ESPN 응답이 영문이라 UI/LLM 입력 시에만 한글로 변환.
// 외래어 표기법 + 한국 스포츠 미디어 굳어진 표기 우선.

import { K_LEAGUE_PLAYER_NAMES_KO } from "./sports/k-league-player-names";
import { J_LEAGUE_PLAYER_NAMES_KO } from "./sports/j-league-player-names";
import { NBA_PLAYER_NAMES_KO } from "./sports/nba-player-names";
import { MLS_PLAYER_NAMES_KO } from "./sports/mls-player-names";

const RAW: Record<string, string> = {
  // ─── EPL — Big 6 + 한국 선수 + 슈퍼스타 ───
  // 아스널
  "Bukayo Saka": "부카요 사카",
  "Martin Ødegaard": "마르틴 외데고르",
  "Martin Odegaard": "마르틴 외데고르",
  "Kai Havertz": "카이 하베르츠",
  "Gabriel Martinelli": "가브리에우 마르치넬리",
  "Gabriel Jesus": "가브리에우 제주스",
  "Declan Rice": "데클런 라이스",
  "William Saliba": "윌리암 살리바",
  "Gabriel Magalhães": "가브리에우 마갈량이스",
  "Gabriel Magalhaes": "가브리에우 마갈량이스",
  "David Raya": "다비드 라야",
  "Mikel Merino": "미켈 메리노",
  "Viktor Gyökeres": "빅토르 요케레스",
  "Viktor Gyokeres": "빅토르 요케레스",
  "Riccardo Calafiori": "리카르도 칼라피오리",
  "Jurriën Timber": "유리언 팀버",
  "Jurrien Timber": "유리언 팀버",
  "J. Timber": "유리언 팀버",
  "Piero Hincapié": "피에로 인카피에",
  "Piero Hincapie": "피에로 인카피에",
  "P. Hincapie": "피에로 인카피에",
  "Leandro Trossard": "레안드로 트로사르",
  "L. Trossard": "레안드로 트로사르",
  "Max Dowman": "맥스 다우먼",
  "M. Dowman": "맥스 다우먼",
  "Cristhian Mosquera": "크리스티안 모스케라",
  "C. Mosquera": "크리스티안 모스케라",
  "Gabriel": "가브리에우 마갈량이스",
  "Ben White": "벤 화이트",
  "Oleksandr Zinchenko": "올렉산드르 진첸코",
  "Jakub Kiwior": "야쿠브 키비오르",
  "Jorginho": "조르지뉴",
  "Thomas Partey": "토마스 파티",
  // 리버풀
  "Mohamed Salah": "모하메드 살라",
  "Virgil van Dijk": "버질 반다이크",
  "Trent Alexander-Arnold": "트렌트 알렉산더아놀드",
  "Alisson Becker": "알리송 베커",
  "Alisson": "알리송",
  "Luis Díaz": "루이스 디아스",
  "Luis Diaz": "루이스 디아스",
  "Cody Gakpo": "코디 학포",
  "Dominik Szoboszlai": "도미니크 소보슬러이",
  "Ryan Gravenberch": "라이언 흐라번베르흐",
  "Alexis Mac Allister": "알렉시스 맥 알리스터",
  "Florian Wirtz": "플로리안 비르츠",
  "Hugo Ekitiké": "위고 에키티케",
  "Hugo Ekitike": "위고 에키티케",
  "Federico Chiesa": "페데리코 키에사",
  // 맨시티
  "Erling Haaland": "엘링 홀란",
  "Kevin De Bruyne": "케빈 더 브라위너",
  "Phil Foden": "필 포든",
  "Bernardo Silva": "베르나르두 실바",
  "Rodri": "로드리",
  "Rúben Dias": "후벤 디아스",
  "Ruben Dias": "후벤 디아스",
  "Jérémy Doku": "제레미 도쿠",
  "Jeremy Doku": "제레미 도쿠",
  "Josko Gvardiol": "요슈코 그바르디올",
  "Joško Gvardiol": "요슈코 그바르디올",
  "Savinho": "사비뉴",
  "Ederson": "에데르송",
  "Omar Marmoush": "오마르 마르무시",
  "Tijjani Reijnders": "테이야니 레이너르스",
  // 맨유
  "Bruno Fernandes": "브루누 페르난드스",
  "Marcus Rashford": "마커스 래시퍼드",
  "Casemiro": "카세미루",
  "Alejandro Garnacho": "알레한드로 가르나초",
  "Rasmus Højlund": "라스무스 회일룬",
  "Rasmus Hojlund": "라스무스 회일룬",
  "André Onana": "앙드레 오나나",
  "Andre Onana": "앙드레 오나나",
  "Matheus Cunha": "마테우스 쿠냐",
  "Bryan Mbeumo": "브라이언 음뵈모",
  "Benjamin Šeško": "벤야민 셰슈코",
  "Benjamin Sesko": "벤야민 셰슈코",
  "Patrick Dorgu": "패트릭 도르구",
  // 첼시
  "Cole Palmer": "콜 파머",
  "Enzo Fernández": "엔소 페르난데스",
  "Enzo Fernandez": "엔소 페르난데스",
  "Moisés Caicedo": "모이세스 카이세도",
  "Moises Caicedo": "모이세스 카이세도",
  "Nicolas Jackson": "니콜라스 잭슨",
  "Pedro Neto": "페드루 네투",
  "Reece James": "리스 제임스",
  "Levi Colwill": "레비 콜윌",
  "João Pedro": "주앙 페드루",
  "Joao Pedro": "주앙 페드루",
  "Estêvão": "에스테방",
  "Estevao": "에스테방",
  "Robert Sánchez": "로베르트 산체스",
  "Robert Sanchez": "로베르트 산체스",
  // 토트넘
  "Son Heung-min": "손흥민",
  "Son Heungmin": "손흥민",
  "Heung-min Son": "손흥민",
  "Heungmin Son": "손흥민",
  "James Maddison": "제임스 매디슨",
  "Cristian Romero": "크리스티안 로메로",
  "Micky van de Ven": "미키 판데벤",
  "Brennan Johnson": "브레넌 존슨",
  "Dejan Kulusevski": "데얀 쿨루셉스키",
  "Yves Bissouma": "이브 비수마",
  "Pape Matar Sarr": "파페 마타르 사르",
  "Mohammed Kudus": "모하메드 쿠두스",
  "Xavi Simons": "샤비 시몬스",
  "Guglielmo Vicario": "굴리엘모 비카리오",
  // 기타 EPL 주요
  "Jarrod Bowen": "재럿 보언",
  "Lucas Paquetá": "루카스 파케타",
  "Lucas Paqueta": "루카스 파케타",
  "Eberechi Eze": "에베레치 에제",
  "Marc Guéhi": "마르크 게이",
  "Marc Guehi": "마르크 게이",
  "Dean Henderson": "딘 헨더슨",
  "Adam Wharton": "애덤 워튼",
  "Borna Sosa": "보르나 소사",
  "Cheick Doucouré": "셰크 두쿠레",
  "Cheick Doucoure": "셰크 두쿠레",
  "Eddie Nketiah": "에디 은케티아",
  "Daniel Muñoz": "다니엘 무뇨스",
  "Daniel Munoz": "다니엘 무뇨스",
  "Ismaïla Sarr": "이스마일라 사르",
  "Ismaila Sarr": "이스마일라 사르",
  "Jean-Philippe Mateta": "장필리프 마테타",
  "J. Mateta": "장필리프 마테타",
  "Evann Guessand": "에반 게상",
  "E. Guessand": "에반 게상",

  // 아스톤 빌라
  "Ollie Watkins": "올리 왓킨스",
  "Morgan Rogers": "모건 로저스",
  "Pau Torres": "파우 토레스",
  "Ezri Konsa": "에즈리 콘사",
  "Emiliano Martínez": "에밀리아노 마르티네스",
  "Emiliano Martinez": "에밀리아노 마르티네스",
  "Emi Martínez": "에밀리아노 마르티네스",
  "Emi Martinez": "에밀리아노 마르티네스",
  "John McGinn": "존 매긴",
  "Youri Tielemans": "유리 틸레만스",
  "Leon Bailey": "리언 베일리",
  "Donyell Malen": "도니엘 말런",

  // 뉴캐슬
  "Alexander Isak": "알렉산데르 이사크",
  "Bruno Guimarães": "브루누 기마랑이스",
  "Bruno Guimaraes": "브루누 기마랑이스",
  "Anthony Gordon": "앤서니 고든",
  "Sven Botman": "스벤 보트만",
  "Nick Pope": "닉 포프",
  "Joelinton": "조엘린통",
  "Sandro Tonali": "산드로 토날리",
  "Kieran Trippier": "키런 트리피어",
  "Fabian Schär": "파비안 셰어",
  "Fabian Schar": "파비안 셰어",
  "Sven Mislintat": "스벤 미슬린타트",
  "Yoane Wissa": "요안 위사",

  // 브라이턴
  "Kaoru Mitoma": "미토마 카오루",
  "Lewis Dunk": "루이스 던크",
  "Carlos Baleba": "카를로스 발레바",
  "Yankuba Minteh": "얀쿠바 민테",
  "Bart Verbruggen": "바르트 페르브뤼헌",
  "Pervis Estupiñán": "페르비스 에스투피냔",
  "Pervis Estupinan": "페르비스 에스투피냔",
  "Joao Pedro Junior": "주앙 페드루",

  // 노팅엄
  "Morgan Gibbs-White": "모건 깁스화이트",
  "Chris Wood": "크리스 우드",
  "Anthony Elanga": "앤서니 엘랑가",
  "Murillo": "무릴루",
  "Matz Sels": "마츠 셀스",

  // 풀럼 / 브렌트포드 / 본머스
  "Raúl Jiménez": "라울 히메네스",
  "Raul Jimenez": "라울 히메네스",
  "Antonee Robinson": "안토니 로빈슨",
  "Adama Traoré": "아다마 트라오레",
  "Adama Traore": "아다마 트라오레",
  "Bernd Leno": "베른트 레노",
  "Igor Thiago": "이고르 치아구",
  "Mikkel Damsgaard": "미켈 담스고르",
  "Antoine Semenyo": "앙투안 세메뇨",
  "Marcus Tavernier": "마커스 태버니어",
  "Justin Kluivert": "저스틴 클라위베르트",
  "Dean Huijsen": "딘 후이센",
  "Evanilson": "에바닐송",
  "Dango Ouattara": "당고 우아타라",

  // ─── 라리가 — 빅3 + 슈퍼스타 ───
  // 레알 마드리드
  "Kylian Mbappé": "킬리안 음바페",
  "Kylian Mbappe": "킬리안 음바페",
  "Vinícius Júnior": "비니시우스 주니오르",
  "Vinicius Junior": "비니시우스 주니오르",
  "Vinicius Jr.": "비니시우스 주니오르",
  "Jude Bellingham": "주드 벨링엄",
  "Rodrygo": "호드리구",
  "Federico Valverde": "페데리코 발베르데",
  "Antonio Rüdiger": "안토니오 뤼디거",
  "Antonio Rudiger": "안토니오 뤼디거",
  "Eduardo Camavinga": "에두아르도 카마빙가",
  "Thibaut Courtois": "티보 쿠르투아",
  "Aurélien Tchouaméni": "오렐리앙 추아메니",
  "Aurelien Tchouameni": "오렐리앙 추아메니",
  "Dani Carvajal": "다니 카르바할",
  "Endrick": "엔드릭",
  "Arda Güler": "아르다 귈레르",
  "Arda Guler": "아르다 귈레르",
  "Trent Alexander Arnold": "트렌트 알렉산더아놀드",
  "Álvaro Carreras": "알바로 카레라스",
  "Alvaro Carreras": "알바로 카레라스",
  // 바르셀로나
  "Lamine Yamal": "라민 야말",
  "Robert Lewandowski": "로베르트 레반도프스키",
  "Pedri": "페드리",
  "Gavi": "가비",
  "Frenkie de Jong": "프렌키 더 용",
  "Raphinha": "하피냐",
  "Marc-André ter Stegen": "마르크안드레 테어슈테겐",
  "Marc-Andre ter Stegen": "마르크안드레 테어슈테겐",
  "Marc Casadó": "마르크 카사도",
  "Marc Casado": "마르크 카사도",
  "Fermín López": "페르민 로페스",
  "Fermin Lopez": "페르민 로페스",
  "Pau Cubarsí": "파우 쿠바르시",
  "Pau Cubarsi": "파우 쿠바르시",
  "Dani Olmo": "다니 올모",
  "Joan García": "조안 가르시아",
  "Joan Garcia": "조안 가르시아",
  // AT 마드리드
  "Antoine Griezmann": "앙투안 그리즈만",
  "Julián Álvarez": "훌리안 알바레스",
  "Julian Alvarez": "훌리안 알바레스",
  "Koke": "코케",
  "Marcos Llorente": "마르코스 요렌테",
  "Álex Baena": "알렉스 바에나",
  "Alex Baena": "알렉스 바에나",
  "Giacomo Raspadori": "자코모 라스파도리",

  // ─── 분데스리가 ───
  "Harry Kane": "해리 케인",
  "Jamal Musiala": "자말 무시알라",
  "Joshua Kimmich": "요수아 키미히",
  "Leroy Sané": "르로이 사네",
  "Leroy Sane": "르로이 사네",
  "Manuel Neuer": "마누엘 노이어",
  "Thomas Müller": "토마스 뮐러",
  "Thomas Muller": "토마스 뮐러",
  "Michael Olise": "마이클 올리스",
  "Konrad Laimer": "콘라트 라이머",
  // 도르트문트
  "Karim Adeyemi": "카림 아데예미",
  "Serhou Guirassy": "세르후 기라시",
  "Julian Brandt": "율리안 브란트",
  "Marcel Sabitzer": "마르첼 자비처",
  "Jobe Bellingham": "조비 벨링엄",
  "Niclas Füllkrug": "니클라스 퓔크루크",
  "Niclas Fullkrug": "니클라스 퓔크루크",
  // 레버쿠젠 / RB 라이프치히 / 슈투트가르트
  "Granit Xhaka": "그라니트 자카",
  "Patrik Schick": "파트리크 시크",
  "Lois Openda": "루아 오펜다",
  "Loïs Openda": "루아 오펜다",
  "Deniz Undav": "데니스 운다브",

  // ─── 세리에 A ───
  // 인테르
  "Lautaro Martínez": "라우타로 마르티네스",
  "Lautaro Martinez": "라우타로 마르티네스",
  "Marcus Thuram": "마르쿠스 튀랑",
  "Nicolò Barella": "니콜로 바렐라",
  "Nicolo Barella": "니콜로 바렐라",
  "Hakan Çalhanoğlu": "하칸 찰하놀루",
  "Hakan Calhanoglu": "하칸 찰하놀루",
  // 유벤투스
  "Dušan Vlahović": "두샨 블라호비치",
  "Dusan Vlahovic": "두샨 블라호비치",
  "Adrien Rabiot": "아드리앵 라비오",
  "Kenan Yıldız": "케난 일디즈",
  "Kenan Yildiz": "케난 일디즈",
  "Jonathan David": "조너선 데이비드",
  "Khéphren Thuram": "케프랑 튀랑",
  "Khephren Thuram": "케프랑 튀랑",
  "Randal Kolo Muani": "랑달 콜로 무아니",
  // 나폴리
  "Romelu Lukaku": "로멜루 루카쿠",
  "Khvicha Kvaratskhelia": "흐비차 크바라츠헬리아",
  "Stanislav Lobotka": "스타니슬라프 로보트카",
  "Scott McTominay": "스콧 맥토미니",
  // AC밀란
  "Rafael Leão": "하파엘 레앙",
  "Rafael Leao": "하파엘 레앙",
  "Christian Pulisic": "크리스천 풀리식",
  "Theo Hernández": "테오 에르난데스",
  "Theo Hernandez": "테오 에르난데스",
  "Mike Maignan": "마이크 메냥",
  "Tammy Abraham": "태미 에이브러햄",
  // AS로마
  "Paulo Dybala": "파울로 디발라",
  "Lorenzo Pellegrini": "로렌초 펠레그리니",

  // ─── 리그 1 (PSG 위주) ───
  "Ousmane Dembélé": "우스만 뎀벨레",
  "Ousmane Dembele": "우스만 뎀벨레",
  "Désiré Doué": "데지레 두에",
  "Desire Doue": "데지레 두에",
  "Bradley Barcola": "브래들리 바르콜라",
  "João Neves": "주앙 네베스",
  "Joao Neves": "주앙 네베스",
  "Vitinha": "비치냐",
  "Fabián Ruiz": "파비안 루이스",
  "Fabian Ruiz": "파비안 루이스",
  "Achraf Hakimi": "아슈라프 하키미",
  "Marquinhos": "마르키뉴스",
  "Gianluigi Donnarumma": "잔루이지 돈나룸마",

  // ─── NBA 슈퍼스타 ───
  "LeBron James": "르브론 제임스",
  "Stephen Curry": "스테판 커리",
  "Kevin Durant": "케빈 듀란트",
  "Giannis Antetokounmpo": "야니스 아데토쿤보",
  "Nikola Jokić": "니콜라 요키치",
  "Nikola Jokic": "니콜라 요키치",
  "Luka Dončić": "루카 돈치치",
  "Luka Doncic": "루카 돈치치",
  "Jayson Tatum": "제이슨 테이텀",
  "Joel Embiid": "조엘 엠비드",
  "Shai Gilgeous-Alexander": "셰이 길저스알렉산더",
  "Anthony Edwards": "앤서니 에드워즈",
  "Anthony Davis": "앤서니 데이비스",
  "Devin Booker": "데빈 부커",
  "Damian Lillard": "데미안 릴라드",
  "Jimmy Butler": "지미 버틀러",
  "Donovan Mitchell": "도노반 미첼",
  "Trae Young": "트레이 영",
  "Ja Morant": "자 모란트",
  "Victor Wembanyama": "빅터 웸반야마",
  "Tyrese Haliburton": "타이리스 핼리버튼",
  "Karl-Anthony Towns": "칼앤서니 타운스",
  "Pascal Siakam": "파스칼 시아캄",
  "Jrue Holiday": "주 할리데이",
  "Bam Adebayo": "뱀 아데바요",
  "Jaylen Brown": "제일런 브라운",
  "Paul George": "폴 조지",
  "Klay Thompson": "클레이 톰슨",
  "James Harden": "제임스 하든",
  "Russell Westbrook": "러셀 웨스트브룩",
  "Chris Paul": "크리스 폴",
  "DeMar DeRozan": "디마 디로잔",

  // ─── MLB — 한국 + 슈퍼스타 ───
  "Shohei Ohtani": "오타니 쇼헤이",
  "Aaron Judge": "에런 저지",
  "Mookie Betts": "무키 베츠",
  "Mike Trout": "마이크 트라웃",
  "Juan Soto": "후안 소토",
  "Ronald Acuña Jr.": "로날드 아쿠냐 주니어",
  "Ronald Acuna Jr.": "로날드 아쿠냐 주니어",
  "Vladimir Guerrero Jr.": "블라디미르 게레로 주니어",
  "Bryce Harper": "브라이스 하퍼",
  "Freddie Freeman": "프레디 프리먼",
  "Yordan Alvarez": "요르단 알바레스",
  "José Ramírez": "호세 라미레스",
  "Jose Ramirez": "호세 라미레스",
  "Fernando Tatis Jr.": "페르난도 타티스 주니어",
  "Manny Machado": "매니 마차도",
  "Gerrit Cole": "게릿 콜",
  "Paul Skenes": "폴 스킨스",
  "Spencer Strider": "스펜서 스트라이더",
  "Tarik Skubal": "타릭 스쿠발",
  "Corbin Burnes": "코빈 번스",
  "Yoshinobu Yamamoto": "야마모토 요시노부",
  "Hyun-Jin Ryu": "류현진",
  "Ji-Man Choi": "최지만",
  "Ha-Seong Kim": "김하성",
  "Hyeseong Kim": "김혜성",
  "Kwang-Hyun Kim": "김광현",
  "Jung Hoo Lee": "이정후",

  // ─── NHL 슈퍼스타 ───
  "Connor McDavid": "코너 맥데이비드",
  "Leon Draisaitl": "레온 드라이자이틀",
  "Auston Matthews": "오스턴 매슈스",
  "Nathan MacKinnon": "네이선 매키넌",
  "Sidney Crosby": "시드니 크로즈비",
  "Alexander Ovechkin": "알렉산더 오베치킨",
  "Cale Makar": "케일 마카",
  "Nikita Kucherov": "니키타 쿠체로프",
  "David Pastrnak": "다비드 파스트르냐크",
  "Mitch Marner": "미치 마너",
  "Mikko Rantanen": "미코 란타넨",
  "Igor Shesterkin": "이고르 셰스테르킨",

  // ─── KBO 핵심 선수 (대표만, 점진 보강) ───
  "Park Geon-Woo": "박건우",
  "Lee Jung-Hoo": "이정후",
  "Choi Jeong": "최정",
  "Yang Eui-Ji": "양의지",
};

const RAW_LOWER: Record<string, string> = Object.fromEntries(
  Object.entries(RAW).map(([k, v]) => [k.toLowerCase(), v]),
);

// 흔한 약식 표기: "C. Doucoure", "B. Saka" 같은 이니셜 + 성
// → 매핑이 없으면 영문 그대로 (LLM 이 보고 한국 미디어 표기로 변환 시도)
const STRIP_ACCENT_RE = /[̀-ͯ]/g;

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(STRIP_ACCENT_RE, "")
    .toLowerCase()
    .trim();
}

const RAW_NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(RAW).map(([k, v]) => [normalize(k), v]),
);

// 성(last name) 기반 fallback — "C. Doucoure" 같은 약식 표기 대응.
// 풀네임에서 마지막 토큰(성) 만 떼어내 키로, 매핑값(한글 풀네임)을 그대로 값으로.
// 동성이인이 있으면 가장 마지막에 등록된 매핑이 우선 (현재 데이터 규모에선 충돌 거의 없음).
const LAST_NAME_MAP: Record<string, string> = {};
for (const [en, ko] of Object.entries(RAW)) {
  const tokens = normalize(en).split(/\s+/).filter(Boolean);
  if (tokens.length < 2) continue;
  const lastEn = tokens[tokens.length - 1];
  if (!lastEn || lastEn.endsWith(".")) continue;
  LAST_NAME_MAP[lastEn] = ko;
}

// 충돌 흔한 성(서로 다른 한글값을 가진 동성이인) — last-name fallback 사용 금지
const AMBIGUOUS_LAST_NAMES = new Set<string>();
{
  const lastToVals = new Map<string, Set<string>>();
  for (const [en, ko] of Object.entries(RAW)) {
    const tokens = normalize(en).split(/\s+/).filter(Boolean);
    if (tokens.length < 2) continue;
    const last = tokens[tokens.length - 1];
    if (!last || last.endsWith(".")) continue;
    if (!lastToVals.has(last)) lastToVals.set(last, new Set());
    lastToVals.get(last)!.add(ko);
  }
  for (const [k, set] of lastToVals) {
    if (set.size > 1) AMBIGUOUS_LAST_NAMES.add(k);
  }
  // 흔한 일반 성 — 한국에 알려진 1명만 등록돼도 동성이인 위험 크니 강제 제외
  for (const s of [
    "james",
    "wilson",
    "jones",
    "moore",
    "taylor",
    "thomas",
    "smith",
    "white",
    "miller",
    "garcia",
    "rodriguez",
    "martinez",
    "lopez",
    "young",
    "king",
    "scott",
    "green",
    "hill",
    "lee",
    "hall",
    "allen",
    "wright",
    "walker",
    "perez",
    "cook",
    "morris",
    "rogers",
    "kim",
    "park",
    "lopez",
    "ferguson",
    "davies",
    "evans",
    "robinson",
    "carter",
  ]) {
    AMBIGUOUS_LAST_NAMES.add(s);
  }
}

const SHORT_NAME_RE = /^(?:[A-Za-z]\.\s*|[A-Za-z]\s+)([\wÀ-ſ'\-]+)$/;

function tryLastName(name: string): string | null {
  // 약식 표기 "C. Doucoure" 형태만 fallback — 풀네임은 정확 매치만 사용
  // (예: "Reece James" 가 last name 'James' fallback 으로 르브론 제임스로 잘못 매핑되던 버그 차단)
  const m = name.trim().match(SHORT_NAME_RE);
  if (!m) return null;
  const last = normalize(m[1]);
  if (AMBIGUOUS_LAST_NAMES.has(last)) return null;
  if (LAST_NAME_MAP[last]) return LAST_NAME_MAP[last];
  return null;
}

export function toKoreanPlayerName(name: string | undefined | null): string {
  if (!name) return "";
  const trimmed = name.trim();
  // 리그별 전용 사전 우선 lookup — API-Football roman / BDL 표기 매핑
  if (K_LEAGUE_PLAYER_NAMES_KO[trimmed]) return K_LEAGUE_PLAYER_NAMES_KO[trimmed];
  if (J_LEAGUE_PLAYER_NAMES_KO[trimmed]) return J_LEAGUE_PLAYER_NAMES_KO[trimmed];
  if (NBA_PLAYER_NAMES_KO[trimmed]) return NBA_PLAYER_NAMES_KO[trimmed];
  if (MLS_PLAYER_NAMES_KO[trimmed]) return MLS_PLAYER_NAMES_KO[trimmed];
  if (RAW[trimmed]) return RAW[trimmed];
  const lower = trimmed.toLowerCase();
  if (RAW_LOWER[lower]) return RAW_LOWER[lower];
  const normalized = normalize(trimmed);
  if (RAW_NORMALIZED[normalized]) return RAW_NORMALIZED[normalized];
  const byLast = tryLastName(trimmed);
  if (byLast) return byLast;
  // 매핑 누락 — 빌드/잡 환경 stderr 로만 출력 (production 사이트 로그엔 안 남김)
  if (process.env.NODE_ENV !== "production" || process.env.LOG_PLAYER_MISS) {
    console.warn(`[player-names] 매핑 없음: "${trimmed}"`);
  }
  return trimmed;
}
