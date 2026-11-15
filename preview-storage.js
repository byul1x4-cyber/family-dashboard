/* 화면 확인용 임시 저장소 (배포 전 점검용 · 실제 가족 데이터/Firestore를 건드리지 않습니다) */
window.Storage = (function () {
  'use strict';
  var QS = (function () { try { return location.search || ''; } catch (e) { return ''; } })();
  var KEY = 'family-dashboard-preview-v3' + (QS ? ':' + QS : '');
  var cb = null;
  var saveCount = 0;

  function dk(off) {
    var d = new Date(); d.setDate(d.getDate() + (off || 0));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  var params = {};
  try {
    (location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('='); params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '1');
    });
  } catch (e) {}

  function seed() {
    var t = dk(0);
    return {
      version: 1,
      introSeen: true,
      mode: params.mode === 'parent' ? 'parent' : 'child',
      actor: params.mode === 'parent' ? '엄마' : null,
      routine: (function () {
        var r = {}; r[t] = {};
        ['mg-m-wake', 'mg-m-brush', 'mg-m-break', 'ij-m-wake', 'ij-m-brush'].forEach(function (id, i) { r[t][id] = Date.now() - (6 - i) * 600000; });
        return r;
      })(),
      celebrated: {}, stars: { minguk: 12, ijun: 7 }, praiseCount: { minguk: 4, ijun: 2 },
      money: { minguk: 0, ijun: 0 }, moneyLog: [],
      praiseLog: [
        { id: 'p1', childId: 'minguk', item: '스스로 했어요', emoji: '🙌', by: '엄마', ts: Date.now() - 5400000 },
        { id: 'p2', childId: 'ijun', item: '정리를 잘했어요', emoji: '🧺', by: '아빠', ts: Date.now() - 7200000 }
      ],
      events: [
        { id: 'e1', member: 'mom', title: '카미유헤어 (원장 서희)', date: t, time: '15:30', note: '' },
        { id: 'e2', member: 'minguk', title: '태권도', date: dk(1), time: '17:00', note: '' },
        { id: 'e3', member: 'mom', title: 'KMA 시험', date: dk(6), time: '09:30', note: '신분증' },
        { id: 'e4', member: 'ijun', title: '수영', date: dk(3), time: '16:00', note: '' }
      ],
      messages: [{
        id: 'l1', fromId: 'minguk', fromName: '민국', toId: 'mom', toName: '엄마',
        pictos: ['g-miss', 'g-love'], text: '엄마 보고 싶어요', ts: Date.now() - 3600000, read: false,
        replies: [{ id: 'r1', by: '엄마', text: '곧 갈게 ❤️', emoji: '❤️', ts: Date.now() - 3000000 }]
      }],
      meals: (function () {
        var m = {}; m[t] = {
          minguk: { slots: [{ key: 'rice', dishId: 'rice', level: 'all' }, { key: 'soup', dishId: 'miyuk', level: 'half' }, { key: 'side1', dishId: 'eggroll', level: 'all' }] },
          ijun: { slots: [{ key: 'rice', dishId: 'rice', level: 'half' }, { key: 'soup', dishId: 'miyuk', level: 'taste' }] }
        };
        return m;
      })(),
      meds: [{ id: 'm1', name: '유산균', memberId: 'minguk', memberName: '민국', time: 'morning' }],
      medLog: {},
      growth: {
        minguk: [{ date: dk(-62), height: 126.5, weight: 26 }, { date: dk(0), height: 128, weight: 27 }],
        ijun: [{ date: dk(-62), height: 102, weight: 16 }, { date: dk(0), height: 104, weight: 17 }]
      },
      schoolNotice: {
        title: '11/13(금) 알림장', date: dk(-2), message: '이번 주도 화이팅!',
        items: [
          { id: 'n1', text: '받아쓰기 10칸 공책', done: 0 },
          { id: 'n2', text: '수학 익힘 42~43쪽', done: 0 },
          { id: 'n3', text: '줄넘기 가져오기', done: Date.now() - 600000 }
        ],
        updatedAt: Date.now() - 86400000
      },
      bannerPopup: params.banner
        ? { id: 'bn-preview', from: '엄마', to: 'all', message: params.banner === '1' ? '이제 그만 자자 🌙' : params.banner, createdAt: Date.now(), ackedBy: [] }
        : null,
      parentStatus: { mom: { key: 'work', at: Date.now() - 1800000, by: '엄마' }, dad: { key: 'home', at: Date.now() - 900000, by: '아빠' } },
      shopping: [
        { id: 's1', text: '우유', done: 0, by: '엄마', ts: Date.now() - 600000 },
        { id: 's2', text: '계란', done: 0, by: '민국', ts: Date.now() - 300000 },
        { id: 's3', text: '치약', done: 1, by: '엄마', ts: Date.now() - 3600000 }
      ]
    };
  }

  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && v.version) return v;
    } catch (e) {}
    try { localStorage.removeItem(KEY); } catch (e) {}
    var s = seed();
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    return s;
  }
  function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }

  var S = {
    MIN_CODE_LEN: 4,
    get mode() { return 'local'; },
    get status() { return { mode: 'local', error: null, lastSyncAt: Date.now(), projectId: 'preview', familyId: 'fam_preview', hasGate: true, secure: true }; },
    hasGate: function () { return true; },
    familyId: function () { return 'fam_preview'; },
    init: function (fn) {
      cb = fn;
      return Promise.resolve({ mode: 'local', state: read() });
    },
    load: read,
    save: function (state) { saveCount++; write(state); },
    watchLocal: function () {},
    docIdFor: function () { return Promise.resolve('fam_preview'); },
    enter: function () { return Promise.resolve({ id: 'fam_preview', changed: false }); },
    lock: function () { return {}; },
    changeCode: function () { return Promise.resolve({}); },
    enableFirebase: function () { return Promise.resolve({}); },
    disableFirebase: function () { return Promise.resolve(); }
  };
  window.__previewSaves = function () { return saveCount; };

  /* 새 편지 도착 연출 (?msg=1) — 다른 기기에서 도착한 것처럼 보여 줍니다 */
  if (params.msg) {
    setTimeout(function () {
      var st = read();
      st.messages = st.messages || [];
      st.messages.unshift({
        id: 'l-new', fromId: 'ijun', fromName: '이준', toId: 'mom', toName: '엄마',
        pictos: ['g-play'], text: '놀아주세요', ts: Date.now(), read: false, replies: []
      });
      write(st);
      if (cb) cb(JSON.parse(JSON.stringify(st)));
    }, 4000);
  }
  return S;
})();
