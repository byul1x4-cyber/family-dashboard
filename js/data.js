/* 우리집 다모아 - 기본 데이터 (설정값) */
window.APP_DATA = {
  appName: '우리집 다모아',
  tagline: '오늘도 다 같이!',

  /* 가족 구성 - 아이 모드/부모 모드에서 쓰는 표시 이름 */
  children: [
    { id: 'minguk', name: '민국', tag: '초1', emoji: '🧒', color: 'mint' },
    { id: 'ijun',   name: '이준', tag: '유치원', emoji: '👦', color: 'coral' }
  ],
  parents: [
    { id: 'mom', name: '엄마', emoji: '👩', color: 'lavender' },
    { id: 'dad', name: '아빠', emoji: '👨', color: 'sky' }
  ],
  /* 일정 태그 */
  scheduleMembers: [
    { id: 'minguk', name: '민국', color: 'mint' },
    { id: 'ijun',   name: '이준', color: 'coral' },
    { id: 'mom',    name: '엄마', color: 'lavender' },
    { id: 'dad',    name: '아빠', color: 'sky' },
    { id: 'family', name: '가족', color: 'sun' }
  ],

  /* 아침/저녁 루틴 */
  routines: {
    minguk: {
      morning: [
        { id: 'mg-m-wash',   label: '세수·양치하기',    emoji: '🧼' },
        { id: 'mg-m-dress',  label: '옷 갈아입기',      emoji: '👕' },
        { id: 'mg-m-break',  label: '아침밥 먹기',      emoji: '🍚' },
        { id: 'mg-m-bag',    label: '가방·물통 챙기기',  emoji: '🎒' }
      ],
      evening: [
        { id: 'mg-e-home',   label: '숙제하기',        emoji: '✏️' },
        { id: 'mg-e-bag',    label: '가방 정리하기',    emoji: '🎒' },
        { id: 'mg-e-toys',   label: '장난감 정리하기',  emoji: '🧸' },
        { id: 'mg-e-books',  label: '책 정리하기',      emoji: '📚' },
        { id: 'mg-e-brush',  label: '양치하기',        emoji: '🪥' },
        { id: 'mg-e-book',   label: '책 읽기',         emoji: '📖' },
        { id: 'mg-e-sleep',  label: '9시 전에 자기',   emoji: '🌙' }
      ]
    },
    ijun: {
      morning: [
        { id: 'ij-m-wash',   label: '세수·양치하기',    emoji: '🧼' },
        { id: 'ij-m-dress',  label: '옷 갈아입기',      emoji: '👕' },
        { id: 'ij-m-break',  label: '아침밥 먹기',      emoji: '🍚' },
        { id: 'ij-m-bag',    label: '가방·물통 챙기기',  emoji: '🎒' }
      ],
      evening: [
        { id: 'ij-e-bag',    label: '가방 정리하기',    emoji: '🎒' },
        { id: 'ij-e-toys',   label: '장난감 정리하기',  emoji: '🧸' },
        { id: 'ij-e-books',  label: '책 정리하기',      emoji: '📚' },
        { id: 'ij-e-brush',  label: '양치하기',        emoji: '🪥' },
        { id: 'ij-e-book',   label: '책 읽기',         emoji: '📖' },
        { id: 'ij-e-sleep',  label: '9시 전에 자기',   emoji: '🌙' }
      ]
    }
  },

  /* 칭찬 항목 */
  praiseItems: [
    { id: 'p-self',    label: '스스로 했어요',      emoji: '🙌' },
    { id: 'p-greet',   label: '인사를 잘했어요',    emoji: '🙇' },
    { id: 'p-kind',    label: '형제에게 친절했어요', emoji: '🤝' },
    { id: 'p-homework',label: '숙제 먼저 했어요',   emoji: '📚' },
    { id: 'p-tidy',    label: '정리를 잘했어요',    emoji: '🧺' },
    { id: 'p-eat',     label: '골고루 먹었어요',    emoji: '🥗' },
    { id: 'p-promise', label: '약속을 지켰어요',    emoji: '🤙' },
    { id: 'p-book',    label: '책을 읽었어요',      emoji: '📖' },
    { id: 'p-help',    label: '동생을 도와줬어요',  emoji: '💛', labels: { ijun: '형을 도와줬어요' } },
    { id: 'p-awesome', label: '오늘 아주 멋졌어요', emoji: '✨' }
  ],

  /* 우체통 그림 말 */
  pictograms: [
    { id: 'g-night',  label: '잘 잤어요',        emoji: '🌙' },
    { id: 'g-miss',   label: '보고 싶어요',      emoji: '🥰' },
    { id: 'g-hw',     label: '숙제 다 했어요',   emoji: '✅' },
    { id: 'g-love',   label: '사랑해요',         emoji: '❤️' },
    { id: 'g-poop',   label: '응가 했어요',      emoji: '💩' },
    { id: 'g-water',  label: '물 마셨어요',      emoji: '💧' },
    { id: 'g-meal',   label: '밥 다 먹었어요',   emoji: '🍚' },
    { id: 'g-play',   label: '놀아주세요',       emoji: '🧸' },
    { id: 'g-happy',  label: '기분이 좋아요',    emoji: '😊' },
    { id: 'g-hard',   label: '힘들어요',         emoji: '🥲' },
    { id: 'g-praise', label: '칭찬해 주세요',    emoji: '⭐' },
    { id: 'g-call',   label: '전화해 주세요',    emoji: '📞' }
  ],

  /* 받는 사람 */
  mailRecipients: [
    { id: 'mom',    name: '엄마',   emoji: '👩' },
    { id: 'dad',    name: '아빠',   emoji: '👨' }
  ],
  quickReplies: [
    { label: '사랑해',    emoji: '❤️' },
    { label: '알았어',    emoji: '👍' },
    { label: '곧 갈게',   emoji: '🚗' },
    { label: '잘했어',    emoji: '👏' },
    { label: '전화할게',  emoji: '📞' },
    { label: '안 돼',     emoji: '🙅' }
  ],

  /* 식판 그릇 */
  traySlots: [
    { key: 'rice',  label: '밥',     emoji: '🍚' },
    { key: 'soup',  label: '국',     emoji: '🍜' },
    { key: 'side1', label: '반찬 1', emoji: '🥗' },
    { key: 'side2', label: '반찬 2', emoji: '🍳' },
    { key: 'side3', label: '반찬 3', emoji: '🥬' }
  ],
  mealLevels: [
    { key: 'none',  label: '안 먹음', short: '안', score: 0 },
    { key: 'taste', label: '1번',     short: '1',  score: 1 },
    { key: 'half',  label: '적당히',  short: '적', score: 2 },
    { key: 'all',   label: '전부',    short: '전', score: 3 }
  ],
  /* 음식 목록 (재료 포함 → 재료 통계에 사용) */
  foods: [
    { id: 'rice',    name: '쌀밥',        emoji: '🍚', ingredients: ['쌀'] },
    { id: 'grain',   name: '잡곡밥',      emoji: '🌾', ingredients: ['쌀', '잡곡'] },
    { id: 'miyuk',   name: '미역국',      emoji: '🍲', ingredients: ['미역', '소고기'] },
    { id: 'bean',    name: '콩나물국',    emoji: '🥣', ingredients: ['콩나물', '대파'] },
    { id: 'eggpot',  name: '계란찜',      emoji: '🍮', ingredients: ['계란'] },
    { id: 'eggroll', name: '계란말이',    emoji: '🍳', ingredients: ['계란', '당근'] },
    { id: 'chicken', name: '찜닭',        emoji: '🍗', ingredients: ['닭고기', '감자'] },
    { id: 'beef',    name: '소고기볶음',  emoji: '🥩', ingredients: ['소고기', '양파'] },
    { id: 'pork',    name: '돼지고기볶음',emoji: '🥓', ingredients: ['돼지고기'] },
    { id: 'fish',    name: '생선구이',    emoji: '🐟', ingredients: ['생선'] },
    { id: 'tofu',    name: '두부부침',    emoji: '🍥', ingredients: ['두부'] },
    { id: 'spinach', name: '시금치나물',  emoji: '🌿', ingredients: ['시금치'] },
    { id: 'sprout',  name: '콩나물무침',  emoji: '🌱', ingredients: ['콩나물'] },
    { id: 'broccoli',name: '브로콜리',    emoji: '🥦', ingredients: ['브로콜리'] },
    { id: 'carrot',  name: '당근볶음',    emoji: '🥕', ingredients: ['당근'] },
    { id: 'laver',   name: '김',          emoji: '🍙', ingredients: ['김'] },
    { id: 'anchovy', name: '멸치볶음',    emoji: '🐠', ingredients: ['멸치'] },
    { id: 'potato',  name: '감자조림',    emoji: '🥔', ingredients: ['감자'] },
    { id: 'zucchini',name: '애호박볶음',  emoji: '🥒', ingredients: ['애호박'] },
    { id: 'tomato',  name: '토마토',      emoji: '🍅', ingredients: ['토마토'] },
    { id: 'kimchi',  name: '김치',        emoji: '🥬', ingredients: ['배추'] },
    { id: 'apple',   name: '사과',        emoji: '🍎', ingredients: ['사과'] },
    { id: 'banana',  name: '바나나',      emoji: '🍌', ingredients: ['바나나'] },
    { id: 'milk',    name: '우유',        emoji: '🥛', ingredients: ['우유'] },
    { id: 'yogurt',  name: '요구르트',    emoji: '🥤', ingredients: ['우유'] },
    { id: 'cheese',  name: '치즈',        emoji: '🧀', ingredients: ['우유'] }
  ],

  /* 약 시간대 */
  medTimes: [
    { key: 'morning', label: '아침' },
    { key: 'lunch',   label: '점심' },
    { key: 'evening', label: '저녁' }
  ],

  /* 일정 종류 (달력 · 일정·준비물) */
  eventTypes: [
    { key: 'family',  label: '가족',  emoji: '🏠' },
    { key: 'school',  label: '학교',  emoji: '🏫' },
    { key: 'academy', label: '학원',  emoji: '📚' },
    { key: 'prep',    label: '준비물', emoji: '🎒' },
    { key: 'etc',     label: '기타',  emoji: '📌' }
  ],

  /* 엄마·아빠 지금 상태 (홈 상단 칩 → 부모님 모드에서 한 번에 변경) */
  statusOptions: [
    { key: 'home',  label: '집에 있어요',   emoji: '🏠' },
    { key: 'work',  label: '일하는 중',     emoji: '💼' },
    { key: 'move',  label: '이동 중',       emoji: '🚗' },
    { key: 'soon',  label: '곧 가요',       emoji: '⏰' },
    { key: 'out',   label: '밖에 있어요',   emoji: '🌳' },
    { key: 'busy',  label: '연락 어려워요', emoji: '🔕' },
    { key: 'sleep', label: '자는 중',       emoji: '😴' }
  ],

  /* 📢 태블릿에 한마디 — 빠른 문구 */
  bannerQuick: [
    '오늘도 화이팅! 💛',
    '이제 그만 자자 🌙',
    '밥 먹고 양치하기!',
    '엄마 곧 갈게 🚗',
    '잘하고 있어요 👍'
  ],

  /* =========================================================
     🌅 등교 시작 모드 기준 시각 (부모님 모드 설정에서 바꿀 수 있어요)
     ========================================================= */
  school: {
    targetTime: '08:30',   // 이 시각까지 남은 시간을 셉니다
    windowStart: '07:00'   // 남은 시간 프로그레스바가 100%에서 시작하는 시각
  },

  /* =========================================================
     ⚡ 별 모아서 포켓몬 키우기 — 진화 라인 20가지
     · ids 는 PokeAPI 공식 도감 번호(스프라이트 ID)입니다.
     · 별 100개를 먹일 때마다 Lv.1 → Lv.2 → Lv.3 으로 오르고,
       Lv.2 에서 1차 진화, Lv.3 에서 최종 진화(2단계 라인은 Lv.2에서 최종).
     · branches 가 있는 라인(이브이)은 진화할 때 어떤 모습으로 자랄지 골라요.
     ========================================================= */
  pokemonLines: [
    { key: 'pichu',      name: '피츄',      ids: [172, 25, 26] },
    { key: 'charmander', name: '파이리',    ids: [4, 5, 6] },
    { key: 'squirtle',   name: '꼬부기',    ids: [7, 8, 9] },
    { key: 'bulbasaur',  name: '이상해씨',  ids: [1, 2, 3] },
    { key: 'eevee',      name: '이브이',    ids: [133], branches: [700, 134, 135, 136] },
    { key: 'sprigatito', name: '냐오하',    ids: [906, 907, 908] },
    { key: 'fuecoco',    name: '뜨아거',    ids: [909, 910, 911] },
    { key: 'quaxly',     name: '꾸왁스',    ids: [912, 913, 914] },
    { key: 'riolu',      name: '리오르',    ids: [447, 448] },
    { key: 'froakie',    name: '개구마르',  ids: [656, 657, 658] },
    { key: 'dratini',    name: '미뇽',      ids: [147, 148, 149] },
    { key: 'gastly',     name: '고오스',    ids: [92, 93, 94] },
    { key: 'togepi',     name: '토게피',    ids: [175, 176, 468] },
    { key: 'jigglypuff', name: '푸린',      ids: [39, 40] },
    { key: 'ralts',      name: '랄토스',    ids: [280, 281, 282] },
    { key: 'torchic',    name: '아차모',    ids: [255, 256, 257] },
    { key: 'mudkip',     name: '물짱이',    ids: [258, 259, 260] },
    { key: 'treecko',    name: '나무지기',  ids: [252, 253, 254] },
    { key: 'piplup',     name: '팽도리',    ids: [393, 394, 395] },
    { key: 'ponyta',     name: '포니타',    ids: [77, 78] }
  ],

  /* 도감 번호 → 한국어 이름 (PokeAPI 스프라이트와 같은 번호) */
  pokemonNames: {
    1: '이상해씨', 2: '이상해풀', 3: '이상해꽃',
    4: '파이리', 5: '리자드', 6: '리자몽',
    7: '꼬부기', 8: '어니부기', 9: '거북왕',
    25: '피카츄', 26: '라이츄', 172: '피츄',
    39: '푸린', 40: '푸크린',
    77: '포니타', 78: '날쌩마',
    92: '고오스', 93: '고우스트', 94: '팬텀',
    133: '이브이', 134: '샤미드', 135: '쥬피썬더', 136: '부스터', 700: '님피아',
    147: '미뇽', 148: '신뇽', 149: '망나뇽',
    175: '토게피', 176: '토게틱', 468: '토게키스',
    252: '나무지기', 253: '나무돌이', 254: '나무킹',
    255: '아차모', 256: '영치코', 257: '번치코',
    258: '물짱이', 259: '늪짱이', 260: '대짱이',
    280: '랄토스', 281: '킬리아', 282: '가디안',
    393: '팽도리', 394: '팽태자', 395: '엠페르트',
    447: '리오르', 448: '루카리오',
    656: '개구마르', 657: '개굴반장', 658: '개굴닌자',
    906: '냐오하', 907: '나로테', 908: '마스카나',
    909: '뜨아거', 910: '악뜨거', 911: '라우드본',
    912: '꾸왁스', 913: '아꾸왁', 914: '웨이니발'
  }
};
