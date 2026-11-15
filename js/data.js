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
        { id: 'mg-m-wake',   label: '혼자 일어나기',   emoji: '⏰' },
        { id: 'mg-m-brush',  label: '양치하기',        emoji: '🪥' },
        { id: 'mg-m-wash',   label: '세수하기',        emoji: '🧼' },
        { id: 'mg-m-break',  label: '아침 먹기',       emoji: '🍳' },
        { id: 'mg-m-bag',    label: '가방 챙기기',     emoji: '🎒' }
      ],
      evening: [
        { id: 'mg-e-home',   label: '숙제하기',        emoji: '📚' },
        { id: 'mg-e-tkd',    label: '태권도',          emoji: '🥋' },
        { id: 'mg-e-swim',   label: '수영',            emoji: '🏊' },
        { id: 'mg-e-chess',  label: '체스',            emoji: '♟️' },
        { id: 'mg-e-hockey', label: '하키',            emoji: '🏒' },
        { id: 'mg-e-brush',  label: '양치하기',        emoji: '🪥' },
        { id: 'mg-e-book',   label: '책 읽기',         emoji: '📖' },
        { id: 'mg-e-sleep',  label: '9시 전에 자기',   emoji: '🌙' }
      ]
    },
    ijun: {
      morning: [
        { id: 'ij-m-wake',   label: '혼자 일어나기',   emoji: '⏰' },
        { id: 'ij-m-brush',  label: '양치하기',        emoji: '🪥' },
        { id: 'ij-m-break',  label: '아침 먹기',       emoji: '🍳' },
        { id: 'ij-m-bag',    label: '유치원 가방 챙기기', emoji: '🎒' }
      ],
      evening: [
        { id: 'ij-e-toys',   label: '장난감 정리',     emoji: '🧸' },
        { id: 'ij-e-brush',  label: '양치하기',        emoji: '🪥' },
        { id: 'ij-e-water',  label: '물 마시기',       emoji: '💧' },
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
    { id: 'p-help',    label: '동생을 도와줬어요',  emoji: '💛' },
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
    { label: '잘했어',    emoji: '👍' },
    { label: '알았어',    emoji: '👌' },
    { label: '곧 갈게',   emoji: '🚗' },
    { label: '전화할게',  emoji: '📞' },
    { label: '보고 싶어', emoji: '🥰' }
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
  ]
};
