/* =========================================================
   우리집 다모아 · 가족 대시보드
   모든 화면은 이 파일에서 상태(state)를 읽어 그립니다.
   저장은 Storage 어댑터를 통해서만 합니다(localStorage ⇄ Firestore).
   ========================================================= */
(function () {
  'use strict';

  var D = window.APP_DATA;
  var $ = UI.$, $$ = UI.$$, esc = UI.esc;
  var todayKey = UI.dateKey;

  /* ---------------- 상태 ---------------- */
  var S = null;
  var view = 'home';
  var calCursor = new Date();
  var calSelected = todayKey();
  var routineChild = D.children[0].id;
  var routineSlot = 'all';
  var growthChild = D.children[0].id;
  var growthMetric = 'height';
  var mailSender = D.children[0].id;
  var mailRecipient = D.mailRecipients[0].id;
  var mailFilter = 'all';   // 우체통: 'all'(전체 가족방) | 아이 id
  var STATUS_CUSTOM_KEY = 'custom';   // 엄마·아빠 상태: 프리셋 대신 직접 적은 문구
  var STATUS_TEXT_MAX = 24;           // 직접 적는 상태 문구 최대 글자 수

  /* 이 기기 이름 · 알림 설정 · 날씨 · 팝업 상태 */
  var DEV_KEY = 'family-dashboard-device';
  var ALERT_KEY = 'family-dashboard-alerts';
  var ALERT_DEFAULT = { sound: true, speak: true, push: false };
  var homeWeather = null;
  var weatherAsked = false;
  var shownBanner = null;      // 이번에 이미 띄운 빵! 메시지 id
  var lastMsgAt = null;        // 마지막으로 알린 편지·답장 시각
  var msgPopTimer = null;

  /* 아이 선택: 어느 화면에서 바꿔도 모든 탭이 같은 아이를 봅니다.
     아이 모드에서도 막지 않습니다 (부모님 모드 확인 문제와 무관). */
  function selectChild(id) {
    if (!id) return;
    routineChild = id; growthChild = id; mailSender = id;
  }

  function defaultState() {
    var g = {};
    D.children.forEach(function (c) { g[c.id] = []; });
    /* 실제 측정값만 초기 기록으로 넣습니다 (민국 128cm / 27kg) */
    g.minguk = [{ date: '2026-11-15', height: 128, weight: 27 }];
    return {
      version: 1,
      introSeen: false,
      mode: 'child',
      actor: null,
      routine: {},
      celebrated: {},
      stars: { minguk: 0, ijun: 0 },
      praiseCount: { minguk: 0, ijun: 0 },
      /* 돼지저금통은 화면에서 뺐습니다. 예전 가족 클라우드 문서와 충돌하지 않도록
         money / moneyLog 값은 손대지 않고 그대로 저장·복원만 합니다. */
      money: { minguk: 0, ijun: 0 },
      moneyLog: [],
      praiseLog: [],
      events: [],
      messages: [],
      meals: {},
      meds: [],
      medLog: {},
      growth: g,
      /* 민국이 알림장 (엄마가 피클로 확인한 언주초 1-3 알림장을 적어 두는 곳) */
      schoolNotice: { title: '', date: '', message: '', items: [], updatedAt: 0 },
      /* 📢 태블릿에 크게 띄우는 가족 메시지: { id, from, to, message, createdAt, ackedBy: [] } */
      bannerPopup: null,
      /* 엄마·아빠 지금 상태: { mom: { key, at, by }, dad: {...} } */
      parentStatus: {},
      /* 🛒 장보기: [{ id, text, done, by, ts }] */
      shopping: [],
      /* 📲 폰·패드 잠금화면 알림(ntfy) 보내기 — 가족 전체 설정 (기본 켜짐) */
      ntfyPush: true,
      /* 부모님이 고친 할 일 목록 (없으면 data.js 기본값을 씁니다) */
      customRoutines: {},

      /* 🌅 등교 시작 모드 기준 시각 (부모님 모드 > 설정에서 바꿔요) */
      schoolTime: (D.school && D.school.targetTime) || '08:30',
      schoolStart: (D.school && D.school.windowStart) || '07:00',
      /* 등교 시작 보너스 별을 하루 한 번만 주려고 적어 두는 곳: { '2026-11-19': { minguk: 1 } } */
      schoolBonus: {},
      /* ⚡ 포켓몬: { minguk: { cur: 4, fed: 0, dex: [] } } — fed는 먹인 별 수(레벨업 별 개수 기준) */
      pokemon: {},
      /* 🧹 정리시간 설정 (부모님이 바꿔요) */
      tidyCfg: { mins: [5, 10, 15], reward: 3, rewardLate: 1, music: true },
      /* ⚡ 포켓몬 설정 */
      pkCfg: { perLevel: 100 },
      /* 🌅 등교 준비 다 끝냈을 때 보너스 별 */
      schoolReward: 2
    };
  }

  function normalize(raw) {
    var base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    var s = Object.assign({}, base, raw);

    ['stars', 'praiseCount', 'money', 'routine', 'celebrated', 'meals', 'medLog'].forEach(function (k) {
      s[k] = Object.assign({}, base[k], (raw[k] && typeof raw[k] === 'object') ? raw[k] : {});
    });
    ['moneyLog', 'praiseLog', 'messages', 'meds'].forEach(function (k) {
      s[k] = Array.isArray(raw[k]) ? raw[k] : [];
    });

    /* 일정: 종류(type)와 준비물(items)을 함께 보관합니다 */
    s.events = (Array.isArray(raw.events) ? raw.events : []).map(function (e) {
      if (!e || !e.id) return null;
      var items = (Array.isArray(e.items) ? e.items : []).map(function (it) {
        if (!it) return null;
        if (typeof it === 'string') return { id: UI.uid('prep'), text: it, done: 0 };
        var t = String(it.text || '').trim();
        if (!t) return null;
        return { id: it.id || UI.uid('prep'), text: t, done: it.done || 0 };
      }).filter(Boolean);
      return Object.assign({}, e, {
        type: D.eventTypes.some(function (t) { return t.key === e.type; }) ? e.type : 'family',
        items: items
      });
    }).filter(Boolean);
    s.growth = Object.assign({}, base.growth, (raw.growth && typeof raw.growth === 'object') ? raw.growth : {});
    D.children.forEach(function (c) { if (!Array.isArray(s.growth[c.id])) s.growth[c.id] = []; });
    var notice = (raw.schoolNotice && typeof raw.schoolNotice === 'object') ? raw.schoolNotice : {};
    s.schoolNotice = Object.assign({}, base.schoolNotice, notice);
    if (!Array.isArray(s.schoolNotice.items)) s.schoolNotice.items = [];
    s.schoolNotice.items = s.schoolNotice.items
      .map(function (it) {
        if (!it) return null;
        if (typeof it === 'string') return { id: UI.uid('nt'), text: it, done: 0 };
        return { id: it.id || UI.uid('nt'), text: String(it.text || ''), done: it.done || 0 };
      })
      .filter(function (it) { return it && it.text; });
    if (s.mode !== 'parent') s.mode = 'child';

    /* 📢 빵! 메시지 */
    var b = raw.bannerPopup;
    if (b && typeof b === 'object' && b.id && String(b.message || '').trim()) {
      s.bannerPopup = {
        id: String(b.id),
        from: String(b.from || '부모님'),
        to: String(b.to || 'all'),
        message: String(b.message).slice(0, 120),
        createdAt: b.createdAt || Date.now(),
        ackedBy: Array.isArray(b.ackedBy) ? b.ackedBy.filter(Boolean) : []
      };
    } else {
      s.bannerPopup = null;
    }

    /* 엄마·아빠 상태 — 프리셋(key) 또는 직접 적은 문구(key:'custom' + text) */
    s.parentStatus = {};
    D.parents.forEach(function (p) {
      var cur = (raw.parentStatus && raw.parentStatus[p.id]) || null;
      if (!cur) return;
      var key = String(cur.key || '');
      var at = cur.at || Date.now(), by = String(cur.by || '');
      if (key === STATUS_CUSTOM_KEY) {
        var text = statusTextClean(cur.text);
        if (text) s.parentStatus[p.id] = { key: key, text: text, at: at, by: by };
        return;
      }
      if (D.statusOptions.some(function (o) { return o.key === key; })) {
        s.parentStatus[p.id] = { key: key, at: at, by: by };
      }
    });

    /* 🛒 장보기 */
    s.shopping = (Array.isArray(raw.shopping) ? raw.shopping : []).map(function (it) {
      if (!it) return null;
      var text = String(it.text || it.name || '').trim();
      if (!text) return null;
      return { id: it.id || UI.uid('shop'), text: text.slice(0, 40), done: it.done ? 1 : 0, by: String(it.by || ''), ts: it.ts || 0 };
    }).filter(Boolean);

    /* 📲 폰·패드 잠금화면 알림 — 값이 없으면 기본 켜짐 */
    s.ntfyPush = raw.ntfyPush === false ? false : true;

    /* 🌅 등교 시작 시각 (HH:MM 형식만 받습니다) */
    s.schoolTime = hhmmOk(raw.schoolTime) ? raw.schoolTime : base.schoolTime;
    s.schoolStart = hhmmOk(raw.schoolStart) ? raw.schoolStart : base.schoolStart;
    s.schoolBonus = (raw.schoolBonus && typeof raw.schoolBonus === 'object' && !Array.isArray(raw.schoolBonus)) ? raw.schoolBonus : {};

    /* ⚡ 포켓몬 (예전 문서에는 없는 값이라 없으면 비워 둡니다) */
    s.pokemon = {};
    D.children.forEach(function (c) {
      var p = (raw.pokemon && raw.pokemon[c.id]) || null;
      if (!p || typeof p !== 'object') return;
      var lineKey = String(p.line || '');
      var validLine = (D.pokemonLines || []).some(function (l) { return l.key === lineKey; });
      var cur = Number(p.cur) || 0;
      var dex = (Array.isArray(p.dex) ? p.dex : []).map(Number)
        .filter(function (id, i, arr) { return D.pokemonNames[id] && arr.indexOf(id) === i; });
      /* 예전 버전(라인 없이 종류만 저장한 값)도 살려서 옮깁니다 */
      if (!validLine && cur && D.pokemonNames[cur]) {
        var ln = (D.pokemonLines || []).filter(function (l) { return (l.ids || []).indexOf(cur) >= 0; })[0];
        if (ln) lineKey = ln.key;
      }
      if (!lineKey) return;
      s.pokemon[c.id] = {
        line: lineKey,
        cur: 0,
        fed: Math.max(0, Math.min(100000, Math.floor(Number(p.fed) || 0))),
        dex: dex
      };
    });

    /* 🧹 정리시간 설정 (부모님이 바꾼 값) */
    var tc = (raw.tidyCfg && typeof raw.tidyCfg === 'object') ? raw.tidyCfg : {};
    var mins = (Array.isArray(tc.mins) ? tc.mins : base.tidyCfg.mins)
      .map(function (n) { return Math.round(Number(n)); })
      .filter(function (n) { return n >= 1 && n <= 60; });
    s.tidyCfg = {
      mins: mins.length ? mins.slice(0, 4) : base.tidyCfg.mins.slice(),
      reward: clampNum(tc.reward, 0, 20, base.tidyCfg.reward),
      rewardLate: clampNum(tc.rewardLate, 0, 20, base.tidyCfg.rewardLate),
      music: tc.music === false ? false : true
    };

    /* ⚡ 포켓몬 설정 */
    var pc = (raw.pkCfg && typeof raw.pkCfg === 'object') ? raw.pkCfg : {};
    s.pkCfg = { perLevel: clampNum(pc.perLevel, 10, 1000, base.pkCfg.perLevel) };

    /* 🌅 등교 준비 보너스 별 */
    s.schoolReward = clampNum(raw.schoolReward, 0, 20, base.schoolReward);

    /* 부모님이 고친 할 일 (아침·저녁) */
    s.customRoutines = {};    D.children.forEach(function (c) {
      var cur = raw.customRoutines && raw.customRoutines[c.id];
      if (!cur || typeof cur !== 'object') return;
      if (!Array.isArray(cur.morning) && !Array.isArray(cur.evening)) return;
      var norm = function (arr) {
        return (Array.isArray(arr) ? arr : []).map(function (it) {
          if (!it) return null;
          if (typeof it === 'string') return { id: UI.uid('rt'), label: it, emoji: '⭐' };
          var label = String(it.label || '').trim();
          if (!label) return null;
          return { id: it.id || UI.uid('rt'), label: label.slice(0, 24), emoji: String(it.emoji || '⭐').slice(0, 4) };
        }).filter(Boolean);
      };
      s.customRoutines[c.id] = { morning: norm(cur.morning), evening: norm(cur.evening) };
    });

    return s;
  }

  function save() {
    pruneHandwriting();          // 손글씨 편지 그림이 문서를 너무 무겁게 하지 않게 정리
    Storage.save(S);
  }

  function needParent(message) {
    if (S.mode === 'parent') return true;
    UI.toast(message || '부모님 모드에서 할 수 있어요', { emoji: '🔒', kind: 'warn' });
    return false;
  }

  /* ================= 이 기기 · 알림 설정 ================= */
  function device() {
    try {
      var d = JSON.parse(localStorage.getItem(DEV_KEY) || 'null');
      if (!d || !d.id) {
        d = { id: 'dev-' + Math.random().toString(36).slice(2, 8), name: '이 기기' };
        localStorage.setItem(DEV_KEY, JSON.stringify(d));
      }
      return d;
    } catch (e) { return { id: 'dev', name: '이 기기' }; }
  }
  function deviceName() { return device().name || '이 기기'; }
  function setDeviceName(name) {
    var d = device();
    d.name = String(name || '').trim().slice(0, 20) || '이 기기';
    try { localStorage.setItem(DEV_KEY, JSON.stringify(d)); } catch (e) {}
  }
  function alerts() {
    var a = null;
    try { a = JSON.parse(localStorage.getItem(ALERT_KEY) || 'null'); } catch (e) {}
    return Object.assign({}, ALERT_DEFAULT, a || {});
  }
  function setAlert(key, val) {
    var a = alerts(); a[key] = !!val;
    try { localStorage.setItem(ALERT_KEY, JSON.stringify(a)); } catch (e) {}
  }
  function chime() {
    if (!alerts().sound) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = new AC();
      var t0 = ctx.currentTime;
      [880, 1174].forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.16);
        g.gain.exponentialRampToValueAtTime(0.16, t0 + i * 0.16 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.16 + 0.34);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0 + i * 0.16); o.stop(t0 + i * 0.16 + 0.4);
      });
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 1400);
    } catch (e) {}
  }
  function speakAlert(text) {
    if (!alerts().speak) return;
    UI.speak(text);
  }
  function pushAlert(title, body) {
    if (!alerts().push) return;
    try {
      if (!('Notification' in window) || window.Notification.permission !== 'granted') return;
      new window.Notification(title, { body: body, tag: 'family-dashboard' });
    } catch (e) {}
  }

  /* ================= 📲 폰·패드 잠금화면 알림 (ntfy) =================
     엄마 아이폰·아이들 갤럭시 패드의 ntfy 앱으로 잠금화면 알림을 보냅니다.
     가족 토픽은 가족 열쇠 ID로만 만들어지고, 발송은 ntfy.sh JSON 발송을 씁니다.
     발송이 실패해도 저장(Firestore)은 그대로 진행되도록 promise를 삼킵니다. */
  var NT = window.Ntfy || null;
  function ntfyOn() { return !S || S.ntfyPush !== false; }
  function ntfyTopicName() { return NT ? NT.topic() : ''; }
  function ntfyShort(text, n) {
    var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    n = n || 120;
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function pushToPhones(title, body, extra) {
    if (!NT) return Promise.resolve({ ok: false, error: 'ntfy 모듈 없음' });
    if (!ntfyOn()) return Promise.resolve({ ok: false, skipped: 'off' });
    var p;
    try {
      p = NT.notify(Object.assign({ title: title, message: body }, extra || {}));
    } catch (e) {
      return Promise.resolve({ ok: false, error: String((e && e.message) || e) });
    }
    return Promise.resolve(p).catch(function (e) {
      return { ok: false, error: String((e && e.message) || e) };
    });
  }
  /* ① 우체통 가족방에 새 메시지(그림 편지·답장)가 저장된 뒤에 부릅니다. */
  function sendMailboxMessage(kind, data) {
    data = data || {};
    var to = data.toName ? ' → ' + data.toName : '';
    if (kind === 'letter') {
      var body = data.hand
        ? ('손글씨 편지' + (data.text ? ' · ' + ntfyShort(data.text, 60) : ''))
        : data.text ? ntfyShort(data.text, 80)
        : (data.count ? '그림 ' + data.count + '개를 보냈어요' : '그림 편지를 보냈어요');
      return pushToPhones((data.hand ? '✍️ ' : '💌 ') + (data.fromName || '가족') + '이 편지를 보냈어요', body + to);
    }
    var who = data.by || '부모님';
    return pushToPhones('💬 ' + who + '의 답장이 도착했어요', ntfyShort(data.text, 120) + to);
  }
  /* ② 📢 태블릿에 한마디 [띄우기] */
  function sendBannerMessage(text, to) {
    return pushToPhones('📢 ' + (S.actor || '부모님') + '의 한마디',
      ntfyShort(text, 120) + ' · ' + bannerTargetLabel(to));
  }
  function toggleNtfyPush() {
    if (!needParent('알림 설정은 부모님 모드에서 바꿀 수 있어요')) return;
    if (!ntfyTopicName()) { UI.toast('가족 열쇠가 없어 알림 주소를 만들 수 없어요', { kind: 'warn' }); return; }
    S.ntfyPush = !ntfyOn();
    save();
    render({ keepScroll: true });
    UI.toast(S.ntfyPush ? '잠금화면 알림을 켰어요' : '잠금화면 알림을 껐어요',
      { emoji: '📲', kind: S.ntfyPush ? 'good' : 'warn' });
  }
  function copyNtfyTopic() {
    var t = ntfyTopicName();
    if (!t) { UI.toast('아직 가족 열쇠가 없어요. 입장 코드를 먼저 넣어 주세요', { kind: 'warn' }); return; }
    var okToast = function () {
      UI.toast('알림 주소를 복사했어요. ntfy 앱에 붙여넣으세요', { emoji: '📋', kind: 'good', duration: 3600 });
    };
    var fail = function () {
      UI.toast('자동 복사가 안 됐어요. 주소를 길게 눌러 복사해 주세요', { kind: 'warn', duration: 4200 });
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(okToast).catch(function () { if (legacyCopy(t)) okToast(); else fail(); });
    } else if (legacyCopy(t)) okToast();
    else fail();
  }
  function sendTestPush() {
    if (!needParent('알림 테스트는 부모님 모드에서 보낼 수 있어요')) return;
    if (!ntfyTopicName()) { UI.toast('가족 열쇠가 없어 알림 주소를 만들 수 없어요', { kind: 'warn' }); return; }
    if (!ntfyOn()) { UI.toast('잠금화면 알림이 꺼져 있어요. 먼저 켜 주세요', { emoji: '📲', kind: 'warn' }); return; }
    UI.toast('테스트 알림을 보내는 중...', { emoji: '📲', duration: 2200 });
    pushToPhones('📲 우리집 다모아 테스트', '이 알림이 잠금화면에 보이면 연결 성공이에요!', { tags: ['bell'] })
      .then(function (res) {
        if (res && res.ok) UI.toast('보냈어요! 폰·패드 잠금화면을 확인해 주세요', { emoji: '🔔', kind: 'good', duration: 4200 });
        else UI.toast('알림을 보내지 못했어요: ' + ((res && res.error) || '인터넷을 확인해 주세요'), { kind: 'warn', duration: 5000 });
      });
  }

  /* ================= 엄마·아빠 지금 상태 ================= */
  function statusTextClean(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, STATUS_TEXT_MAX);
  }
  function statusOf(id) { return (S.parentStatus && S.parentStatus[id]) || null; }
  function statusOption(key) {
    return D.statusOptions.filter(function (o) { return o.key === key; })[0] || null;
  }
  /* 화면에 보여 줄 한 줄 — 프리셋이면 '🏠 집에 있어요', 직접 적었으면 적은 그대로 */
  function statusLabel(st) {
    if (!st) return '';
    if (st.key === STATUS_CUSTOM_KEY) return statusTextClean(st.text);
    var o = statusOption(st.key);
    return o ? (o.emoji + ' ' + o.label) : '';
  }
  function setStatus(id, key, text) {
    S.parentStatus = S.parentStatus || {};
    var p = D.parents.filter(function (x) { return x.id === id; })[0] || { name: '부모님' };
    var label = '';
    if (!key) {
      delete S.parentStatus[id];
    } else if (key === STATUS_CUSTOM_KEY) {
      var t = statusTextClean(text);
      if (!t) { UI.toast('상태 문구를 적어 주세요', { emoji: '✏️', kind: 'warn' }); return false; }
      S.parentStatus[id] = { key: key, text: t, at: Date.now(), by: S.actor || '부모님' };
      label = t;
    } else {
      var o = statusOption(key);
      if (!o) return false;
      S.parentStatus[id] = { key: key, at: Date.now(), by: S.actor || '부모님' };
      label = o.emoji + ' ' + o.label;
    }
    saveNow();                       // 가족 클라우드로 바로 올려 태블릿에도 즉시 보이게
    render({ keepScroll: true });
    UI.toast(label ? (p.name + ' · ' + label) : '상태를 지웠어요', { emoji: '📍', kind: 'good' });
    return true;
  }
  function pickStatusModal(parentId) {
    if (!needParent('상태는 부모님 모드에서 바꿀 수 있어요')) return;
    var p = D.parents.filter(function (x) { return x.id === parentId; })[0];
    if (!p) return;
    var cur = statusOf(parentId);
    var curCustom = (cur && cur.key === STATUS_CUSTOM_KEY) ? statusTextClean(cur.text) : '';
    UI.modal({
      title: p.emoji + ' ' + p.name + '는 지금?',
      focus: false,   // 태블릿에서 열자마자 키보드가 올라오지 않게
      bodyHTML: '<p class="help" style="margin-bottom:12px">한 번만 누르면 태블릿에도 몇 초 안에 보여요.</p>' +
        '<div class="chip-row">' + D.statusOptions.map(function (o) {
          return '<button type="button" class="chip ' + p.color + (cur && cur.key === o.key ? ' active' : '') + '" data-st="' + o.key + '">' + o.emoji + ' ' + esc(o.label) + '</button>';
        }).join('') + '</div>' +
        '<div class="status-write' + (curCustom ? ' on' : '') + '">' +
          '<label class="status-write-label" for="statusWriteInput">✏️ 내가 직접 적기</label>' +
          '<div class="status-write-row">' +
            '<input class="input" id="statusWriteInput" type="text" maxlength="' + STATUS_TEXT_MAX + '" autocomplete="off" ' +
              'enterkeyhint="done" placeholder="예: 회의 중 📞 · 마트 갔다 올게 🛒" aria-label="상태 직접 적기" value="' + esc(curCustom) + '">' +
            '<button type="button" class="btn btn-primary btn-sm" id="statusWriteSave">저장</button>' +
          '</div>' +
          '<p class="status-write-help">짧은 말이나 이모지를 그대로 적으면 홈 상태 칩에 그대로 보여요.</p>' +
        '</div>' +
        (cur ? '<button type="button" class="btn btn-ghost btn-sm" data-st="__clear" style="margin-top:14px">상태 지우기</button>' : ''),
      actions: [{ label: '닫기', kind: 'ghost' }],
      onOpen: function (wrap, close) {
        var inp = wrap.querySelector('#statusWriteInput');
        function saveCustom() {
          var t = statusTextClean(inp ? inp.value : '');
          if (!t) {
            UI.toast('상태 문구를 적어 주세요', { emoji: '✏️', kind: 'warn' });
            if (inp) inp.focus();
            return;
          }
          close();
          setStatus(parentId, STATUS_CUSTOM_KEY, t);
        }
        wrap.addEventListener('click', function (e) {
          var b = e.target.closest('[data-st]');
          if (b) {
            var key = b.getAttribute('data-st');
            close();
            setStatus(parentId, key === '__clear' ? null : key);
            return;
          }
          if (e.target.closest('#statusWriteSave')) { e.preventDefault(); saveCustom(); }
        });
        if (inp) {
          inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); saveCustom(); }
          });
        }
      }
    });
  }

  /* ================= 🛒 장보기 ================= */
  function addShopping(text) {
    var t = String(text || '').trim();
    if (!t) { UI.toast('품목을 적어 주세요', { emoji: '🛒', kind: 'warn' }); return false; }
    S.shopping = S.shopping || [];
    if (S.shopping.some(function (i) { return !i.done && i.text === t; })) {
      UI.toast('이미 목록에 있어요', { emoji: '🛒' });
      return false;
    }
    var by = S.mode === 'parent' ? (S.actor || '부모님') : childById(routineChild).name;
    S.shopping.push({ id: UI.uid('shop'), text: t.slice(0, 30), done: 0, by: by, ts: Date.now() });
    save();
    render({ keepScroll: true });
    UI.toast('장보기에 담았어요 · ' + t, { emoji: '🛒', kind: 'good' });
    return true;
  }
  function addShoppingFromInput() {
    var inp = document.getElementById('shopInput');
    var ok = addShopping(inp ? inp.value : '');
    if (ok) { var again = document.getElementById('shopInput'); if (again) again.focus(); }
  }
  function toggleShopping(id) {
    var it = (S.shopping || []).filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    it.done = it.done ? 0 : 1;
    save();
    render({ keepScroll: true });
    UI.toast(it.done ? '샀어요! ' + it.text + ' ✓' : it.text + '를 다시 담았어요',
      { emoji: it.done ? '🧺' : '🛒', kind: 'good', duration: 1600 });
  }
  function removeShopping(id) {
    var it = (S.shopping || []).filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    S.shopping = S.shopping.filter(function (x) { return x.id !== id; });
    save();
    render({ keepScroll: true });
    UI.toast('목록에서 지웠어요', { emoji: '🗑️' });
  }

  /* ================= 📢 태블릿에 한마디 (빵! 메시지) ================= */
  function bannerObj() { return (S && S.bannerPopup) || null; }
  function bannerTargetLabel(to) {
    if (!to || to === 'all') return '전체에게';
    var c = D.children.filter(function (x) { return x.id === to; })[0];
    return c ? c.name + '에게' : '전체에게';
  }
  function bannerAckNames(b) {
    return ((b && b.ackedBy) || []).map(function (a) {
      return typeof a === 'string' ? a : (a && a.name);
    }).filter(Boolean);
  }
  function sendBanner(text, to) {
    var msg = String(text || '').trim();
    if (!msg) { UI.toast('한 줄 적어 주세요', { kind: 'warn' }); return false; }
    S.bannerPopup = {
      id: UI.uid('bn'),
      from: S.actor || '부모님',
      to: to || 'all',
      message: msg.slice(0, 80),
      createdAt: Date.now(),
      ackedBy: []
    };
    shownBanner = S.bannerPopup.id;   // 보낸 기기에서는 바로 안 띄웁니다
    save();
    render({ keepScroll: true });
    UI.confetti(16);
    UI.toast('태블릿에 띄웠어요 · ' + msg, { emoji: '📢', kind: 'good', duration: 3200 });
    /* 📲 폰·패드 잠금화면에도 알림 (실패해도 저장은 이미 끝났어요) */
    sendBannerMessage(msg, to || 'all');
    return true;
  }
  function sendBannerFromCompose() {
    if (!needParent()) return;
    var inp = document.getElementById('bannerInput');
    var sel = document.getElementById('bannerTo');
    sendBanner(inp ? inp.value : '', sel ? sel.value : 'all');
  }
  function fillBannerInput(text) {
    var inp = document.getElementById('bannerInput');
    if (!inp) return;
    inp.value = text;
    try { inp.focus(); } catch (e) {}
  }
  function clearBanner() {
    if (!needParent()) return;
    if (!S.bannerPopup) { UI.toast('지금 떠 있는 메시지가 없어요', { emoji: '📴' }); return; }
    S.bannerPopup = null;
    save();
    render({ keepScroll: true });
    hideBannerPopup();
    UI.toast('태블릿 메시지를 내렸어요', { emoji: '📴' });
  }
  function ackBanner() {
    var b = S && S.bannerPopup;
    if (!b) { hideBannerPopup(); return; }
    var d = device();
    var kid = b.to && b.to !== 'all' ? D.children.filter(function (c) { return c.id === b.to; })[0] : null;
    var name = kid ? kid.name : d.name;
    b.ackedBy = Array.isArray(b.ackedBy) ? b.ackedBy : [];
    var already = b.ackedBy.some(function (a) { return a && a.dev === d.id; });
    if (!already) b.ackedBy.push({ dev: d.id, name: name, at: Date.now() });
    save();
    render({ keepScroll: true });
    hideBannerPopup();
    UI.toast('확인했어요! 부모님께 알려드렸어요', { emoji: '✅', kind: 'good' });
  }

  /* ---- 팝업(빵! 메시지 · 새 편지) ---- */
  function popupRoot() { return document.getElementById('popupRoot'); }
  function hideBannerPopup() {
    var el = document.querySelector('.bigpop-layer');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
  function showBannerPopup(b) {
    hideBannerPopup();
    var kid = b.to && b.to !== 'all' ? D.children.filter(function (c) { return c.id === b.to; })[0] : null;
    var who = b.from || '부모님';
    var line = kid ? (who + '가 ' + kid.name + '에게 보낸 메시지') : (who + '가 보낸 메시지');
    var el = document.createElement('div');
    el.className = 'bigpop-layer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '가족 메시지');
    el.innerHTML = '<div class="bigpop">' +
        '<div class="bp-ico" aria-hidden="true">💌</div>' +
        '<p class="bp-from">' + esc(line) + '</p>' +
        '<p class="bp-msg">' + esc(b.message) + '</p>' +
        '<button type="button" class="bp-ok" data-pop="banner-ack">확인했어요</button>' +
        '<p class="bp-help">누르면 부모님 화면에 읽음으로 표시돼요</p>' +
      '</div>';
    var root = popupRoot();
    if (!root) return;
    root.appendChild(el);
    chime();
    speakAlert(who + '가 보낸 메시지. ' + b.message);
  }
  function maybeShowBanner() {
    var b = S && S.bannerPopup;
    if (!b) { hideBannerPopup(); if (shownBanner) shownBanner = null; return; }
    if (shownBanner === b.id) return;
    shownBanner = b.id;
    var d = device();
    var acked = (b.ackedBy || []).some(function (a) { return a && a.dev === d.id; });
    if (acked) return;
    showBannerPopup(b);
  }

  /* 새 편지/답장 감지 */
  function newestMessageEvent() {
    var best = null;
    (S.messages || []).forEach(function (m) {
      if (!best || (m.ts || 0) > best.ts) best = { ts: m.ts || 0, kind: 'letter', msg: m };
    });
    (S.messages || []).forEach(function (m) {
      (m.replies || []).forEach(function (r) {
        if (!best || (r.ts || 0) > best.ts) best = { ts: r.ts || 0, kind: 'reply', msg: m, reply: r };
      });
    });
    return best;
  }
  function messageEventTitle(ev) {
    if (!ev) return '새 메시지';
    if (ev.kind === 'reply') return (ev.reply.by || '부모님') + '의 새 답장';
    return childById(ev.msg.fromId).name + '이 보낸 새 편지';
  }
  function messageEventBody(ev) {
    if (!ev) return '';
    if (ev.kind === 'reply') return String(ev.reply.text || '');
    return messagePreview(ev.msg);
  }
  function hideMessagePopup() {
    clearTimeout(msgPopTimer); msgPopTimer = null;
    var el = document.querySelector('.msgpop');
    if (!el) return;
    el.classList.add('out');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
  }
  function showMessagePopup(ev) {
    hideMessagePopup();
    var root = popupRoot();
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'msgpop';
    el.setAttribute('role', 'status');
    el.innerHTML = '<div class="mp-art" aria-hidden="true">💌</div>' +
      '<div class="mp-body"><b>' + esc(messageEventTitle(ev)) + '</b><p>' + esc(messageEventBody(ev) || '내용을 보러 가 볼까요?') + '</p></div>' +
      '<div class="mp-actions">' +
        '<button type="button" class="btn btn-rose" data-pop="msg-goto">보기</button>' +
        '<button type="button" class="icon-btn" data-pop="msg-close" aria-label="닫기">✕</button>' +
      '</div>';
    root.appendChild(el);
    msgPopTimer = setTimeout(hideMessagePopup, 15000);
  }
  function checkNewMessages() {
    var ev = newestMessageEvent();
    if (!ev) return;
    if (lastMsgAt == null) { lastMsgAt = ev.ts; return; }
    if (ev.ts <= lastMsgAt + 600) return;
    lastMsgAt = ev.ts;
    showMessagePopup(ev);
    pushAlert(messageEventTitle(ev), messageEventBody(ev));
    chime();
    speakAlert(messageEventTitle(ev) + '. ' + messageEventBody(ev));
  }
  function bindPopupRoot() {
    var root = popupRoot();
    if (!root || root.__bound) return;
    root.__bound = true;
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pop]');
      if (!b) return;
      var act = b.getAttribute('data-pop');
      if (act === 'banner-ack') ackBanner();
      else if (act === 'msg-close') hideMessagePopup();
      else if (act === 'msg-goto') { hideMessagePopup(); setView('mailbox'); }
    });
  }

  /* ---------------- 공통 계산 ---------------- */
  function childById(id) {
    return D.children.filter(function (c) { return c.id === id; })[0] || D.children[0];
  }
  /* 아이 아바타 — 이모지 대신 남자아이 그림 캐릭터(형 민국 · 동생 이준) */
  function kidAvaHTML(c, cls) {
    return '<span class="avatar ' + (cls || 'sm') + ' ' + c.color + ' ava-kid">' + Art.kid(c.id) + '</span>';
  }
  function memberColor(id) {
    var m = D.scheduleMembers.filter(function (x) { return x.id === id; })[0];
    return m ? m.color : 'mint';
  }
  function memberName(id) {
    var m = D.scheduleMembers.filter(function (x) { return x.id === id; })[0];
    return m ? m.name : '가족';
  }
  function routineItems(childId) {
    var custom = S && S.customRoutines && S.customRoutines[childId];
    if (custom && (Array.isArray(custom.morning) || Array.isArray(custom.evening))) {
      return { morning: custom.morning || [], evening: custom.evening || [] };
    }
    var r = D.routines[childId] || { morning: [], evening: [] };
    return { morning: (r.morning || []).slice(), evening: (r.evening || []).slice() };
  }

  /* 부모님이 할 일을 고치면 그 아이 목록을 이 가족 문서에 저장합니다 */
  function ensureRoutineCustom(childId) {
    S.customRoutines = S.customRoutines || {};
    if (!S.customRoutines[childId]) {
      var cur = routineItems(childId);
      S.customRoutines[childId] = {
        morning: cur.morning.map(function (i) { return { id: i.id, label: i.label, emoji: i.emoji }; }),
        evening: cur.evening.map(function (i) { return { id: i.id, label: i.label, emoji: i.emoji }; })
      };
    }
    return S.customRoutines[childId];
  }

  function addRoutineItem(childIds, slot, emoji, label) {
    if (!needParent('할 일은 부모님 모드에서 고칠 수 있어요')) return false;
    var text = String(label || '').trim().slice(0, 20);
    if (!text) { UI.toast('할 일을 적어 주세요', { emoji: '✏️', kind: 'warn' }); return false; }
    var skipped = [];
    childIds.forEach(function (cid) {
      var lists = ensureRoutineCustom(cid);
      var list = slot === 'morning' ? lists.morning : lists.evening;
      if (list.some(function (i) { return i.label === text; })) { skipped.push(childById(cid).name); return; }
      var item = { id: UI.uid('rt'), label: text, emoji: emoji || '⭐' };
      var bedIdx = -1;
      for (var i = 0; i < list.length; i++) { if (/자기|잠/.test(list[i].label)) { bedIdx = i; break; } }
      if (bedIdx >= 0) list.splice(bedIdx, 0, item); else list.push(item);
    });
    save();
    render({ keepScroll: true });
    var who = childIds.map(function (cid) { return childById(cid).name; }).join('·');
    UI.toast(skipped.length && skipped.length === childIds.length
      ? '이미 있는 할 일이에요'
      : who + ' 할 일에 넣었어요 · ' + text,
      { emoji: '✅', kind: 'good' });
    return true;
  }

  function removeRoutineItem(childId, itemId) {
    if (!needParent('할 일은 부모님 모드에서 고칠 수 있어요')) return;
    var lists = routineItems(childId);
    var all = lists.morning.concat(lists.evening);
    var item = all.filter(function (i) { return i.id === itemId; })[0];
    if (!item) return;
    UI.confirm('할 일을 뺄까요?', '“' + item.label + '”을(를) ' + childById(childId).name + ' 할 일 목록에서 뺍니다.\n오늘 체크한 기록과 별은 그대로 남아요.', '빼기', 'danger')
      .then(function (ok) {
        if (!ok) return;
        var custom = ensureRoutineCustom(childId);
        custom.morning = custom.morning.filter(function (i) { return i.id !== itemId; });
        custom.evening = custom.evening.filter(function (i) { return i.id !== itemId; });
        save();
        render({ keepScroll: true });
        UI.toast('할 일에서 뺐어요', { emoji: '🗑️' });
      });
  }

  var ROUTINE_EMOJIS = ['🎒', '🧸', '📚', '✏️', '🪥', '🧼', '🍚', '🥛', '🧦', '🧹', '🛏️', '🎹', '⚽', '🐶', '🌙', '⭐'];

  function addRoutineModal(childId) {
    if (!needParent('할 일은 부모님 모드에서 고칠 수 있어요')) return;
    var c = childById(childId);
    UI.modal({
      title: '✅ ' + c.name + ' 할 일 추가',
      bodyHTML:
        '<div class="field-row">' +
          '<div class="field"><label>누구에게</label><select class="select" id="rtWho">' +
            '<option value="' + c.id + '">' + esc(c.name) + '</option>' +
            D.children.filter(function (k) { return k.id !== c.id; }).map(function (k) {
              return '<option value="' + k.id + '">' + esc(k.name) + '</option>';
            }).join('') +
            '<option value="both">민국·이준 둘 다</option>' +
          '</select></div>' +
          '<div class="field"><label>언제</label><select class="select" id="rtSlot">' +
            '<option value="morning">🌅 아침</option>' +
            '<option value="evening" selected>🌙 저녁</option>' +
          '</select></div>' +
        '</div>' +
        '<div class="field"><label>할 일</label><input class="input" id="rtLabel" maxlength="20" placeholder="예: 신발 정리하기"></div>' +
        '<div class="field"><label>아이콘 (골라도 되고 직접 적어도 돼요)</label>' +
          '<div class="rt-emoji-row">' + ROUTINE_EMOJIS.map(function (e) {
            return '<button type="button" class="rt-emoji" data-emoji="' + e + '">' + e + '</button>';
          }).join('') + '</div>' +
          '<input class="input" id="rtEmoji" maxlength="4" value="⭐" style="margin-top:6px;text-align:center;font-size:18px">' +
        '</div>' +
        '<p class="help">추가하면 바로 할 일에 들어가고, 태블릿·폰에도 함께 보여요.</p>',
      actions: [
        {
          label: '추가하기', kind: 'primary', onClick: function (close) {
            var who = (document.getElementById('rtWho') || {}).value || c.id;
            var slot = (document.getElementById('rtSlot') || {}).value || 'evening';
            var emoji = ((document.getElementById('rtEmoji') || {}).value || '⭐').trim() || '⭐';
            var label = (document.getElementById('rtLabel') || {}).value || '';
            var ids = who === 'both' ? D.children.map(function (k) { return k.id; }) : [who];
            if (addRoutineItem(ids, slot, emoji, label)) close();
            else return false;
          }
        },
        { label: '취소', kind: 'ghost' }
      ],
      onOpen: function (wrap) {
        wrap.addEventListener('click', function (e) {
          var b = e.target.closest('[data-emoji]');
          if (!b) return;
          e.preventDefault();
          var inp = document.getElementById('rtEmoji');
          if (inp) inp.value = b.getAttribute('data-emoji');
        });
        setTimeout(function () {
          var l = document.getElementById('rtLabel');
          if (l) l.focus();
        }, 120);
      }
    });
  }
  function routineStats(childId, date) {
    var items = routineItems(childId);
    var all = items.morning.concat(items.evening);
    var done = S.routine[date] || {};
    var cnt = all.filter(function (i) { return done[i.id]; }).length;
    return { done: cnt, total: all.length, morningTotal: items.morning.length, eveningTotal: items.evening.length };
  }
  function isDone(itemId, date) {
    return !!(S.routine[date] && S.routine[date][itemId]);
  }
  function mealOf(childId, date) {
    var day = S.meals[date] || {};
    return day[childId] || { slots: [] };
  }
  function slotOf(childId, date, slotKey) {
    var m = mealOf(childId, date);
    return (m.slots || []).filter(function (s) { return s.key === slotKey; })[0] || { key: slotKey, dishId: null, level: 'none' };
  }
  function foodById(id) {
    return D.foods.filter(function (f) { return f.id === id; })[0] || null;
  }
  function levelInfo(key) {
    return D.mealLevels.filter(function (l) { return l.key === key; })[0] || D.mealLevels[0];
  }
  function eventsOn(date) {
    return S.events.filter(function (e) { return e.date === date; })
      .sort(function (a, b) { return (a.time || '99:99').localeCompare(b.time || '99:99'); });
  }
  function upcomingEvents(limit, days) {
    var t = todayKey();
    var end = new Date(); end.setDate(end.getDate() + (days || 60));
    var endKey = todayKey(end);
    return S.events.filter(function (e) { return e.date >= t && e.date <= endKey; })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.time || '99:99').localeCompare(b.time || '99:99');
      })
      .slice(0, limit || 20);
  }
  function dday(date) {
    var t = UI.parseKey(todayKey()).getTime();
    var d = UI.parseKey(date).getTime();
    var diff = Math.round((d - t) / 86400000);
    if (diff === 0) return '오늘';
    if (diff === 1) return '내일';
    if (diff === -1) return '어제';
    return diff > 0 ? 'D-' + diff : 'D+' + Math.abs(diff);
  }
  function unreadFor(recipientId) {
    return S.messages.filter(function (m) { return m.toId === recipientId && !m.read; }).length;
  }
  function unreadTotal() {
    return S.messages.filter(function (m) { return !m.read; }).length;
  }
  function mealsTodayCount() {
    var t = todayKey();
    return D.children.filter(function (c) {
      var m = mealOf(c.id, t);
      return (m.slots || []).some(function (s) { return s.dishId; });
    }).length;
  }
  function medsForToday() {
    return S.meds.slice();
  }
  function medPending() {
    var done = S.medLog[todayKey()] || {};
    return S.meds.filter(function (m) { return !done[m.id]; }).length;
  }

  /* ---------------- 시간/모드 ---------------- */
  /* ================= ⏰ 그만! 알림 (화면 시간 타이머) =================
     끝나는 시각만 이 기기에 저장합니다(가족 클라우드에는 안 올림).
     시간이 되면 전체 화면으로 알려 주고, 소리 내어 읽어 줍니다. */
  var STOP_KEY = 'family-dashboard-stop-timer';
  var STOP_TEXT = '이제 그만 볼 시간이에요! 화면을 꺼 주세요.';
  var stopTimer = null;        // { endsAt }
  var stopOverlay = null;
  var stopSpeakTimer = null;
  var stopSpeakCount = 0;

  function readStopTimer() {
    try {
      var v = JSON.parse(localStorage.getItem(STOP_KEY) || 'null');
      if (v && typeof v.endsAt === 'number') return v;
    } catch (e) {}
    return null;
  }
  function writeStopTimer(v) {
    try {
      if (v) localStorage.setItem(STOP_KEY, JSON.stringify(v));
      else localStorage.removeItem(STOP_KEY);
    } catch (e) {}
  }
  function stopRemainMs() { return stopTimer ? Math.max(0, stopTimer.endsAt - Date.now()) : 0; }
  function formatRemain(ms) {
    var total = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return h ? (h + ':' + UI.pad(m) + ':' + UI.pad(s)) : (UI.pad(m) + ':' + UI.pad(s));
  }
  function stopLabel() {
    var btn = document.getElementById('stopTimerBtn');
    var lab = document.getElementById('stopTimerLabel');
    if (!btn || !lab) return;
    var running = !!(stopTimer && stopRemainMs() > 0);
    btn.classList.toggle('running', running);
    lab.textContent = running ? formatRemain(stopRemainMs()) : '그만! 알림';
    btn.setAttribute('aria-label', running ? ('그만! 알림 ' + lab.textContent + ' 남음') : '그만! 알림');
  }
  function startStopTimer(ms) {
    if (!(ms > 0)) { UI.toast('시간을 다시 골라 주세요', { kind: 'warn' }); return; }
    stopTimer = { endsAt: Date.now() + ms };
    writeStopTimer(stopTimer);
    stopLabel();
    var mins = Math.round(ms / 60000);
    UI.toast(mins >= 60 ? (Math.round(mins / 60 * 10) / 10) + '시간 뒤에 알려드릴게요' : mins + '분 뒤에 알려드릴게요',
      { emoji: '⏰', kind: 'good', duration: 2600 });
  }
  function cancelStopTimer(silent) {
    stopTimer = null;
    writeStopTimer(null);
    stopLabel();
    if (!silent) UI.toast('그만! 알림을 꺼어요', { emoji: '⏰' });
  }

  function stopTimerModal() {
    var running = !!(stopTimer && stopRemainMs() > 0);
    var d = new Date(Date.now() + 30 * 60000);
    var def = UI.pad(d.getHours()) + ':' + UI.pad(d.getMinutes());
    UI.modal({
      title: '⏰ 그만! 알림',
      bodyHTML:
        '<p class="modal-text">정한 시간이 되면 큰 화면으로 알려 주고, 소리 내어 읽어 줘요.</p>' +
        (running ? '<p class="help">지금 ' + formatRemain(stopRemainMs()) + ' 남았어요.</p>' : '') +
        '<div class="timer-quick">' +
          [5, 10, 15, 30].map(function (m) {
            return '<button type="button" class="btn btn-soft" data-min="' + m + '"><b>' + m + '</b>분 뒤</button>';
          }).join('') +
        '</div>' +
        '<div class="timer-custom">' +
          '<div class="field" style="flex:1"><label>끝내는 시간 직접 정하기</label>' +
            '<input class="input" type="time" id="stopTime" value="' + def + '" aria-label="끝내는 시간"></div>' +
          '<button type="button" class="btn btn-primary" id="stopTimeGo">이 시간에 멈추기</button>' +
        '</div>' +
        (running ? '<button type="button" class="btn btn-danger btn-block" id="stopOff" style="margin-top:10px">지금 그만! 알림 끄기</button>' : ''),
      actions: [{ label: '닫기', kind: 'ghost' }],
      onOpen: function (wrap, close) {
        wrap.addEventListener('click', function (e) {
          var q = e.target.closest('[data-min]');
          if (q) { startStopTimer(Number(q.getAttribute('data-min')) * 60000); close(); return; }
          if (e.target.closest('#stopTimeGo')) {
            var v = ((document.getElementById('stopTime') || {}).value || '').trim();
            var p = v.split(':');
            if (p.length !== 2 || !p[0] || !p[1]) { UI.toast('시간을 골라 주세요', { kind: 'warn' }); return; }
            var now = new Date();
            var target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(p[0]), Number(p[1]), 0, 0);
            if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);   // 이미 지난 시각이면 내일
            startStopTimer(target.getTime() - now.getTime());
            close();
            return;
          }
          if (e.target.closest('#stopOff')) { cancelStopTimer(); close(); }
        });
      }
    });
  }

  function speakStop() {
    UI.speak(STOP_TEXT);
  }
  function showStopOverlay() {
    if (stopOverlay) return;
    var el = document.createElement('div');
    el.className = 'stop-overlay';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-label', '그만! 시간이에요');
    el.innerHTML = '<div class="stop-overlay-card">' +
        '<div class="so-ico">⏰</div>' +
        '<h2>그만! 시간이에요!</h2>' +
        '<p class="so-msg">이제 그만 볼 시간이에요.<br>화면을 꺼 주세요.</p>' +
        '<button type="button" class="btn btn-primary so-ok" id="stopOverlayOk">확인했어요</button>' +
        '<p class="so-help">부모님과 함께 끄면 더 좋아요 💛</p>' +
      '</div>';
    document.body.appendChild(el);
    document.body.classList.add('timer-ringing');
    stopOverlay = el;
    el.querySelector('#stopOverlayOk').addEventListener('click', dismissStopOverlay);
    speakStop();
    stopSpeakCount = 1;
    clearInterval(stopSpeakTimer);
    stopSpeakTimer = setInterval(function () {
      if (!stopOverlay || stopSpeakCount >= 3) { clearInterval(stopSpeakTimer); stopSpeakTimer = null; return; }
      stopSpeakCount++;
      speakStop();
    }, 12000);
  }
  function dismissStopOverlay() {
    if (stopOverlay && stopOverlay.parentNode) stopOverlay.remove();
    stopOverlay = null;
    document.body.classList.remove('timer-ringing');
    clearInterval(stopSpeakTimer); stopSpeakTimer = null;
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) {}
    UI.toast('잘했어요! 화면을 꺼 주세요 👍', { emoji: '👏', kind: 'good' });
  }
  function fireStopTimer() {
    stopTimer = null;
    writeStopTimer(null);
    stopLabel();
    showStopOverlay();
  }
  function tickStopTimer() {
    if (!stopTimer) return;
    if (stopRemainMs() <= 0) fireStopTimer();
    else stopLabel();
  }
  function initStopTimer() {
    var btn = document.getElementById('stopTimerBtn');
    if (btn) btn.addEventListener('click', stopTimerModal);
    var saved = readStopTimer();
    if (saved) {
      var late = Date.now() - saved.endsAt;
      if (late > 10 * 60000) writeStopTimer(null);   // 한참 지난 타이머는 조용히 지움
      else stopTimer = saved;
    }
    stopLabel();
    setInterval(tickStopTimer, 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tickStopTimer(); });
    if (stopTimer && stopRemainMs() <= 0) fireStopTimer();
  }

  function startClock() {
    function tick() {
      var now = new Date();
      var el = document.getElementById('clockDate');
      var et = document.getElementById('clockTime');
      if (!el || !et) return;
      el.textContent = (now.getMonth() + 1) + '월 ' + now.getDate() + '일 ' + UI.weekday(now) + '요일';
      var h = now.getHours();
      var ampm = h < 12 ? '오전' : '오후';
      var hh = h % 12; if (hh === 0) hh = 12;
      et.textContent = ampm + ' ' + hh + ':' + UI.pad(now.getMinutes());
    }
    tick();
    setInterval(tick, 20000);
    setInterval(function () {
      /* 날짜가 바뀌면 화면을 새로 그립니다 */
      if (window.__lastDay !== todayKey()) {
        window.__lastDay = todayKey();
        render({ keepScroll: true });
      }
    }, 60000);
    window.__lastDay = todayKey();
  }

  function setMode(mode) {
    if (mode === 'parent') {
      /* 아이 모드 → 부모님 모드: 매번 새로 나오는 곱셈 문제를 맞혀야 열립니다 */
      if (S.mode === 'parent') { askActor(); return; }
      askQuiz(function () { askActor(); }, '부모님 모드로 들어가려면<br>정답을 맞혀 주세요.');
      return;
    }
    S.mode = 'child';
    S.actor = null;
    save();
    render({ keepScroll: true });
    UI.toast('아이 모드로 바꿨어요', { emoji: '🧒' });
  }

  function askActor() {
    UI.modal({
      title: '누구세요?',
      bodyHTML: '<p class="modal-text">부모님 모드로 바꾸면 루틴 완료 확인, 칭찬, 일정·식판·성장 기록을 관리할 수 있어요.</p>' +
        '<div class="pick-child" style="margin-top:14px">' +
        D.parents.map(function (p) {
          return '<button type="button" data-actor="' + p.id + '"><span class="avatar sm ' + p.color + '">' + p.emoji + '</span>' + esc(p.name) + '</button>';
        }).join('') +
        '</div>',
      actions: [{ label: '취소', kind: 'ghost' }],
      onOpen: function (wrap, close) {
        wrap.addEventListener('click', function (e) {
          var b = e.target.closest('[data-actor]');
          if (!b) return;
          var p = D.parents.filter(function (x) { return x.id === b.getAttribute('data-actor'); })[0];
          S.mode = 'parent';
          S.actor = p ? p.name : '부모님';
          save();
          close();
          render({ keepScroll: true });
          UI.toast(S.actor + ' 모드로 바뀌었어요', { emoji: '🔒', kind: 'good' });
        });
      }
    });
  }

  function showIntro() {
    UI.modal({
      title: '🏡 우리집 다모아',
      bodyHTML: '<p class="modal-text">루틴 체크, 칭찬하기, 가족 일정, 우체통, 식판·약·성장 기록을 한 곳에 모았어요.<br>누구로 시작할까요?</p>' +
        '<div class="pick-child" style="margin-top:14px;flex-wrap:wrap">' +
        D.parents.map(function (p) {
          return '<button type="button" data-start="' + p.id + '"><span class="avatar sm ' + p.color + '">' + p.emoji + '</span>' + esc(p.name) + '</button>';
        }).join('') +
        '<button type="button" data-start="child"><span class="avatar sm sun">🧒</span>아이</button>' +
        '</div>' +
        '<p class="help" style="margin-top:12px">부모님으로 시작하면 관리 기능이 열려요. 언제든 위쪽에서 모드를 바꿀 수 있어요.</p>',
      onOpen: function (wrap, close) {
        wrap.addEventListener('click', function (e) {
          var b = e.target.closest('[data-start]');
          if (!b) return;
          var who = b.getAttribute('data-start');
          if (who === 'child') { S.mode = 'child'; S.actor = null; }
          else {
            var p = D.parents.filter(function (x) { return x.id === who; })[0];
            S.mode = 'parent'; S.actor = p ? p.name : '부모님';
          }
          S.introSeen = true;
          save();
          close();
          render();
          UI.toast('시작해 볼까요?', { emoji: '💛' });
        });
      }
    });
  }

  /* ---------------- 화면 전환 ---------------- */
  function setView(name) {
    view = name;
    render({ scrollTop: true });
  }

  function render(opts) {
    opts = opts || {};
    var y = window.scrollY;
    var main = document.getElementById('view');
    var fn = VIEWS[view] || renderHome;
    main.innerHTML = fn();
    main.classList.remove('view-enter');
    void main.offsetWidth;
    main.classList.add('view-enter');
    $$('.tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-view') === view); });
    updateChrome();
    scrollChatToEnd();
    if (opts.keepScroll) window.scrollTo(0, y);
    else if (opts.scrollTop) window.scrollTo(0, 0);
    afterRender();
  }

  /* 가족방 대화는 항상 맨 아래(최근 말풍선)가 보이게 */
  function scrollChatToEnd() {
    $$('.chat-thread').forEach(function (el) { el.scrollTop = el.scrollHeight; });
  }

  function updateChrome() {
    var mc = document.getElementById('modeChild');
    var mp = document.getElementById('modeParent');
    if (mc) mc.classList.toggle('active', S.mode !== 'parent');
    if (mp) mp.classList.toggle('active', S.mode === 'parent');
    var sub = document.getElementById('brandSub');
    if (sub) sub.textContent = S.mode === 'parent' ? ((S.actor || '부모님') + ' 모드 · 관리 중') : '아이 모드 · 오늘도 다 같이!';
    var mailTabBtn = document.querySelector('.tab[data-view="mailbox"]');
    if (mailTabBtn) mailTabBtn.classList.toggle('has-dot', unreadTotal() > 0);
    var bb = document.getElementById('bannerBtn');
    if (bb) bb.hidden = S.mode !== 'parent';
  }

  /* ================= 홈 ================= */
  function growthLatest(childId) {
    var recs = (S.growth[childId] || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return recs.length ? recs[recs.length - 1] : null;
  }
  function bodySummary(childId) {
    var g = growthLatest(childId);
    if (!g) return '';
    var bits = [];
    if (g.height) bits.push(Number(g.height) + 'cm');
    if (g.weight) bits.push(Number(g.weight) + 'kg');
    return bits.join(' · ');
  }
  function newestMessage() {
    var list = S.messages.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    return list[0] || null;
  }
  function messagePreview(m) {
    if (!m) return '';
    var text = String(m.text || '').trim();
    if (text) return text;
    if (m.hw) return '✍️ 손글씨 편지';
    if (m.hwDropped) return '✍️ 손글씨 편지(그림은 정리됨)';
    var words = (m.pictos || []).map(function (id) {
      var p = D.pictograms.filter(function (x) { return x.id === id; })[0];
      return p ? p.label : '';
    }).filter(Boolean);
    return words.length ? words.join(' ') : '그림 편지';
  }
  function mailTileSub() {
    var m = newestMessage();
    if (!m) return '아직 편지가 없어요';
    var from = childById(m.fromId);
    var pv = messagePreview(m);
    return from.name + ' · ' + (pv.length > 14 ? pv.slice(0, 14) + '…' : pv);
  }
  function medNamesSub() {
    if (!S.meds.length) return '등록된 약이 없어요';
    var names = [];
    S.meds.forEach(function (m) {
      var n = m.memberName || '가족';
      if (names.indexOf(n) < 0) names.push(n);
    });
    var left = medPending();
    return names.slice(0, 3).join(' · ') + (left ? ' · ' + left + '개 남음' : ' · 다 챙겼어요');
  }
  function miniCalendarHTML() {
    var now = new Date();
    var year = now.getFullYear(), month = now.getMonth();
    var first = new Date(year, month, 1);
    var start = new Date(year, month, 1 - first.getDay());
    var dow = ['일', '월', '화', '수', '목', '금', '토'].map(function (w, i) {
      return '<div class="mini-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') + '">' + w + '</div>';
    }).join('');
    var cells = '';
    for (var i = 0; i < 42; i++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var key = UI.dateKey(d);
      if (i >= 35 && d.getMonth() !== month) continue;   // 마지막 주가 다음 달뿐이면 줄이기
      var evs = eventsOn(key);
      var cls = 'mini-day';
      if (d.getMonth() !== month) cls += ' outside';
      if (key === todayKey()) cls += ' today';
      if (evs.length) cls += ' has-ev';
      cells += '<button type="button" class="' + cls + '" data-act="mini-day" data-date="' + key + '" aria-label="' + UI.shortDateKo(key) + (evs.length ? ' 일정 ' + evs.length + '개' : '') + '">' +
        '<span>' + d.getDate() + '</span>' + (evs.length ? '<i class="mini-dot ' + memberColor(evs[0].member) + '"></i>' : '') +
        '</button>';
    }
    return '<div class="mini-cal">' + dow + cells + '</div>';
  }

  function renderHome() {
    var today = todayKey();
    var doneTotal = 0, allTotal = 0;
    D.children.forEach(function (c) {
      var st = routineStats(c.id, today);
      doneTotal += st.done; allTotal += st.total;
    });
    var left = allTotal - doneTotal;
    var upcoming = upcomingEvents(4, 60);
    var now = new Date();
    var monthLabel = now.getFullYear() + '년 ' + (now.getMonth() + 1) + '월';

    ensureWeather();

    return '' +
      '<div class="home-top">' +
        weatherCardHTML() +
        '<div class="status-rail">' + D.parents.map(statusChipHTML).join('') + '</div>' +
      '</div>' +

      '<div class="kids-row">' + D.children.map(kidCardHTML).join('') + '</div>' +

      modeStripHTML() +

      '<div class="tile-grid">' + homeTilesHTML(left, upcoming) + '</div>' +

      (S.mode === 'parent' ? bannerComposeHTML() : '') +

      '<div class="home-grid">' +
        '<div class="home-col">' + homeCalendarCardHTML(monthLabel, upcoming) + '</div>' +
        '<div class="home-col">' + noticeCardHTML() + '</div>' +
        '<div class="home-col home-side">' + medHomeCardHTML() + shoppingCardHTML() + '</div>' +
      '</div>';
  }

  /* ---- 홈: 오늘 날씨 · 옷차림 · 시간대별 ---- */
  function wxEmoji(kind, isDay, hour) {
    /* is_day(해가 떠 있는지) 값이 오면 그걸 쓰고, 없으면 시각으로 판단해요 */
    var night = isDay === true ? false : isDay === false ? true
      : (typeof hour === 'number' && (hour < 7 || hour >= 18));
    if (kind === 'rain') return '🌧️';
    if (kind === 'snow') return '🌨️';
    if (kind === 'sun') return night ? '🌙' : '☀️';
    return night ? '☁️' : '⛅';
  }
  function wxHourlyHTML(w) {
    if (!w.hours || !w.hours.length) return '';
    return '<div class="wx-hours" role="list" aria-label="시간대별 날씨">' +
      w.hours.map(function (h) {
        return '<div class="wx-hr' + (h.now ? ' now' : '') + '" role="listitem">' +
          '<span class="wx-hr-t">' + (h.now ? '지금' : h.hour + '시') +
            (h.tomorrow ? '<i>내일</i>' : '') + '</span>' +
          '<span class="wx-hr-i" aria-hidden="true">' + wxEmoji(h.kind, h.day, h.hour) + '</span>' +
          '<b class="wx-hr-tp">' + (h.temp == null ? '—' : h.temp + '°') + '</b>' +
          '<span class="wx-hr-pop">' + (h.pop == null ? '&nbsp;' : '☔ ' + h.pop + '%') + '</span>' +
        '</div>';
      }).join('') + '</div>';
  }
  function weatherCardHTML() {
    var w = homeWeather;
    if (!w) {
      return '<div class="wx-card loading"><span class="wx-load">🌤 오늘 날씨 불러오는 중…</span></div>';
    }
    var g10 = w.pm10Grade, g25 = w.pm25Grade;
    var val = function (v, unit) { return v == null ? '—' : v + (unit || ''); };
    return '<div class="wx-card ' + (w.kind || 'cloud') + '">' +
        '<div class="wx-head">' +
          '<div class="wx-place"><span aria-hidden="true">📍</span><b>' + esc(w.place || '도곡동') + '</b><small>서울 강남구</small></div>' +
          '<div class="wx-now">' +
            '<span class="wx-art">' + Art.weatherArt(w.kind) + '</span>' +
            '<div class="wx-now-txt">' +
              '<div class="wx-temp-line">' +
                '<span class="wx-temp">' + val(w.temp) + '<small>°</small></span>' +
                '<span class="wx-state">' + esc(w.label) + '</span>' +
              '</div>' +
              '<div class="wx-range">' +
                '<span>최저 <b>' + val(w.tmin, '°') + '</b></span>' +
                '<span>최고 <b>' + val(w.tmax, '°') + '</b></span>' +
                '<span>체감 <b>' + val(w.feels, '°') + '</b></span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="wx-badges">' +
          '<span class="wx-badge"><i aria-hidden="true">💧</i>습도 <b>' + val(w.hum, '%') + '</b></span>' +
          '<span class="wx-badge"><i aria-hidden="true">☔</i>강수 <b>' + val(w.pop, '%') + '</b></span>' +
          (g10 ? '<span class="wx-badge dust ' + g10.cls + '"><i aria-hidden="true">🌫</i>미세먼지 <b>' + g10.ico + ' ' + esc(g10.label) + '</b></span>' : '') +
          (g25 ? '<span class="wx-badge dust ' + g25.cls + '"><i aria-hidden="true">😷</i>초미세먼지 <b>' + g25.ico + ' ' + esc(g25.label) + '</b></span>' : '') +
        '</div>' +
        wxHourlyHTML(w) +
        '<div class="wx-tip"><b>오늘 옷차림</b>' + esc(w.tip) + '</div>' +
      '</div>';
  }

  function ensureWeather() {
    if (weatherAsked || !window.Weather) return;
    weatherAsked = true;
    setTimeout(function () {
      Weather.load(function (d) {
        if (!d) return;
        homeWeather = d;
        if (view === 'home') render({ keepScroll: true });
      });
    }, 0);
  }

  /* ---- 홈: 엄마·아빠 지금 상태 ---- */
  function statusChipHTML(p) {
    var st = statusOf(p.id);
    var label = statusLabel(st);
    return '<button type="button" class="status-chip ' + p.id + (label ? ' set' : '') + '" data-act="pick-status" data-id="' + p.id + '">' +
        '<span class="sc-ava ' + p.color + '">' + p.emoji + '</span>' +
        '<span class="sc-txt"><b>' + esc(p.name) + '는 지금</b>' +
          '<small>' + (label ? esc(label) : '상태를 알려 주세요') + '</small>' +
        '</span>' +
        (st && st.at ? '<span class="sc-time">' + UI.ago(st.at) + '</span>' : '') +
      '</button>';
  }

  /* ---- 홈: 타일 4개 ---- */
  function homeTilesHTML(left, upcoming) {
    var today = todayKey();
    var kids = D.children.map(function (c) {
      var st = routineStats(c.id, today);
      var rest = st.total - st.done;
      return '<span class="tk-badge ' + c.color + '"><i>' + c.emoji + '</i>' + esc(c.name) +
        ' ' + (rest > 0 ? '오늘 ' + rest : '완료 ✓') + '</span>';
    }).join('');
    var body = bodySummary(routineChild);
    var meals = mealsTodayCount();
    var unread = unreadTotal();
    return '' +
      '<button type="button" class="tile t-lav" data-act="goto" data-view="routine">' +
        (left ? '<span class="q-badge">' + left + '</span>' : '') +
        Art.routineIcon() +
        '<strong>할 일</strong>' +
        '<small>' + (left > 0 ? '오늘 ' + left + '개 남았어요' : '오늘 다 했어요! 🎉') + '</small>' +
        '<span class="tile-kids">' + kids + '</span>' +
      '</button>' +
      '<button type="button" class="tile t-rose" data-act="goto" data-view="mailbox">' +
        (unread ? '<span class="q-badge">' + unread + '</span>' : '') +
        Art.mailboxIcon() +
        '<strong>우체통</strong>' +
        '<small>' + esc(mailTileSub()) + '</small>' +
      '</button>' +
      '<button type="button" class="tile t-sun" data-act="goto" data-view="health">' +
        Art.trayIcon() +
        '<strong>골고루 먹자</strong>' +
        '<small>' + meals + '/' + D.children.length + '명 기록' + (meals ? ' · 오늘 식판' : ' · 메뉴를 골라 주세요') + '</small>' +
      '</button>' +
      '<button type="button" class="tile giraffe t-sky" data-act="goto" data-view="health">' +
        '<span class="giraffe-wrap">' + Art.giraffeCard() + '</span>' +
        '<span class="giraffe-txt"><strong>이만큼 자랐어요!</strong>' +
          '<small>' + esc(body ? childById(routineChild).name + ' ' + body : '키·몸무게 기록하기') + '</small>' +
        '</span>' +
      '</button>';
  }

  /* ---- 홈: 이번 달 일정 ---- */
  function homeCalendarCardHTML(monthLabel, upcoming) {
    return '<div class="card soft-sun home-cal-card">' +
        cardHead('📅', '이번 달 우리 가족 일정', monthLabel,
          '<button type="button" class="link-btn" data-act="goto" data-view="calendar">달력 크게</button>') +
        miniCalendarHTML() +
        '<p class="mini-sub">⏳ 다가오는 일정</p>' +
        (upcoming.length
          ? '<div class="ev-list">' + upcoming.map(function (e) { return evItemHTML(e, true); }).join('') + '</div>'
          : '<div class="empty"><span class="big">🗓️</span>아직 등록된 일정이 없어요.<br>부모님 모드에서 일정을 추가해 보세요.</div>') +
      '</div>';
  }

  /* ---- 홈: 약 먹고 있는 사람 ---- */
  function medHomeCardHTML() {
    var today = todayKey();
    var pending = medPending();
    var sub = S.meds.length ? (pending ? pending + '개 남았어요' : '다 챙겼어요 ✓') : '등록된 약이 없어요';
    var head = cardHead('💊', '약 먹고 있는 사람', sub,
      '<button type="button" class="link-btn" data-act="goto" data-view="health">보기</button>');
    if (!S.meds.length) {
      return '<div class="card med-home">' + head +
        '<div class="empty notice-empty"><span class="big">💊</span>지금 먹는 약이 없어요.<br>필요하면 식판·건강에서 등록해요.</div></div>';
    }
    return '<div class="card med-home">' + head + '<div class="med-mini-list">' + S.meds.slice(0, 4).map(function (md) {
      var done = !!(S.medLog[today] && S.medLog[today][md.id]);
      var t = (D.medTimes.filter(function (x) { return x.key === md.time; })[0] || {}).label || '';
      var face = md.memberId === 'mom' ? '👩' : md.memberId === 'dad' ? '👨' : md.memberId === 'ijun' ? '👦' : '🧒';
      return '<div class="med-mini' + (done ? ' done' : '') + '">' +
          '<span class="mm-ava">' + face + '</span>' +
          '<span class="mm-name">' + esc(md.memberName || '가족') + ' · ' + esc(md.name) + '</span>' +
          '<span class="mm-time">' + (done ? '✓ ' : '') + esc(t) + '</span>' +
        '</div>';
    }).join('') + '</div></div>';
  }

  /* ---- 홈: 장보기 ---- */
  function shoppingCardHTML() {
    var list = (S.shopping || []).slice().sort(function (a, b) {
      return (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.ts || 0) - (b.ts || 0);
    });
    var left = list.filter(function (i) { return !i.done; }).length;
    var sub = left ? left + '개 남았어요' : (list.length ? '다 샀어요! 🎉' : '필요한 걸 적어 두세요');
    return '<div class="card shop-card">' +
        cardHead('🛒', '장보기', sub, '') +
        '<div class="shop-add">' +
          '<input class="input" id="shopInput" maxlength="30" placeholder="예: 우유, 계란" aria-label="장보기 품목" enterkeyhint="done">' +
          '<button type="button" class="btn btn-primary btn-sm" data-act="shop-add">추가</button>' +
        '</div>' +
        (list.length
          ? '<div class="shop-list">' + list.map(function (it) {
              return '<div class="shop-item' + (it.done ? ' done' : '') + '">' +
                  '<button type="button" class="shop-check" data-act="shop-toggle" data-id="' + esc(it.id) + '" aria-label="' + (it.done ? '되돌리기' : '샀어요') + '">✓</button>' +
                  '<span class="shop-text">' + esc(it.text) + '</span>' +
                  (it.by ? '<span class="shop-by">' + esc(it.by) + '</span>' : '') +
                  '<button type="button" class="shop-del" data-act="shop-del" data-id="' + esc(it.id) + '" aria-label="지우기">✕</button>' +
                '</div>';
            }).join('') + '</div>'
          : '<div class="empty notice-empty"><span class="big">🛒</span>장보기 목록이 비어 있어요.<br>우유, 계란처럼 적어 두면 태블릿에도 같이 보여요.</div>') +
      '</div>';
  }

  /* ---- 📢 태블릿에 한마디 (부모님) ---- */
  function bannerComposeHTML() {
    var b = bannerObj();
    var names = bannerAckNames(b);
    var stateHTML = b
      ? '<div class="bc-state">📢 지금 떠 있어요: “' + esc(b.message) + '”' +
          '<span class="badge rose">' + esc(bannerTargetLabel(b.to)) + '</span>' +
          (names.length
            ? '<span class="badge mint">읽음 ' + names.length + ' · ' + esc(names.slice(0, 3).join(', ')) + '</span>'
            : '<span class="badge sun">아직 확인 전</span>') +
        '</div>'
      : '<div class="bc-state empty">아직 띄운 메시지가 없어요 · 한 줄 적고 <b>띄우기</b>를 눌러 보세요</div>';
    return '<div class="card banner-compose">' +
        '<div class="bc-head">' +
          '<span class="bc-ico" aria-hidden="true">📢</span>' +
          '<div><h2>태블릿에 한마디</h2><p>거실 태블릿에 크게 “빵!” 하고 떠요. 아이가 확인하면 읽음으로 표시돼요.</p></div>' +
        '</div>' +
        '<div class="bc-row">' +
          '<select class="select" id="bannerTo" aria-label="받을 사람">' +
            '<option value="all">전체에게</option>' +
            D.children.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '에게</option>'; }).join('') +
          '</select>' +
          '<input class="input" id="bannerInput" maxlength="60" placeholder="예: 이제 그만 자자 🌙" aria-label="띄울 한 줄" enterkeyhint="send">' +
          '<button type="button" class="btn btn-sun" data-act="banner-send">띄우기</button>' +
          '<button type="button" class="btn btn-ghost" data-act="banner-clear">내리기</button>' +
        '</div>' +
        '<div class="bc-quick">' + D.bannerQuick.map(function (q) {
          return '<button type="button" class="chip" data-act="banner-quick" data-text="' + esc(q) + '">' + esc(q) + '</button>';
        }).join('') + '</div>' +
        stateHTML +
      '</div>';
  }

  /* ---- 📲 폰·패드 잠금화면 알림 카드 (설정 탭) ---- */
  function ntfyCardHTML() {
    var t = ntfyTopicName();
    var on = ntfyOn();
    return '<div class="card span-2 ntfy-card">' +
      cardHead('📲', '폰·패드 잠금화면 알림', '앱을 꺼 두어도 잠금화면에 떠요 (ntfy)') +
      '<button type="button" class="ntfy-row' + (on ? ' on' : '') + '" data-act="ntfy-toggle" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="tg-ico">🔔</span>' +
        '<span class="tg-txt"><b>잠금화면 알림 보내기</b><small>가족방 새 편지·답장, 태블릿 한마디를 폰으로 보내요</small></span>' +
        '<span class="tg-state">' + (on ? '켜짐' : '꺼짐') + '</span>' +
      '</button>' +
      '<div class="ntfy-topic">' +
        '<div class="ntfy-topic-head"><b>우리 가족 전용 알림 주소</b><span class="badge mint">ntfy 토픽</span></div>' +
        (t
          ? '<div class="ntfy-topic-line">' +
              '<code id="ntfyTopic">' + esc(t) + '</code>' +
              '<button type="button" class="btn btn-soft btn-sm" data-act="copy-ntfy-topic">📋 복사</button>' +
            '</div>' +
            '<p class="help">가족 코드가 같으면 이 주소도 같아요. 이 주소를 아는 사람만 우리 가족 알림을 받을 수 있어요.</p>'
          : '<p class="help">가족 입장 코드를 넣으면 우리 가족 전용 알림 주소가 여기에 생겨요.</p>') +
      '</div>' +
      '<div class="btn-row"><button type="button" class="btn btn-primary" data-act="ntfy-test">🔔 테스트 알림 보내기</button></div>' +
      '<ol class="ntfy-steps">' +
        '<li><b>앱 설치</b> — 아이폰은 <b>앱스토어</b>, 갤럭시 패드는 <b>플레이스토어</b>에서 <b>ntfy</b>를 받아요. (무료)</li>' +
        '<li><b>주소 넣기</b> — 앱에서 <b>+</b> → <b>Subscribe to topic</b>에 위 주소를 붙여넣고 <b>Subscribe</b>를 눌러요.</li>' +
        '<li><b>알림 허용</b> — 알림을 허용하면 잠금화면에 떠요. (아이폰은 설정 › 알림 › ntfy › 잠금 화면 표시 켜기)</li>' +
      '</ol>' +
      '<p class="help">폰마다 처음 한 번만 해 두면 돼요. 알림이 안 오면 ntfy 앱을 한 번 열어 주세요.</p>' +
    '</div>';
  }

  function cardHead(ico, title, sub, right) {
    return '<div class="card-head"><span class="ico">' + ico + '</span>' +
      '<div><h2>' + esc(title) + '</h2>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>' +
      '<div class="spacer"></div>' + (right || '') + '</div>';
  }

  /* ---- 알림 설정 ---- */
  function alertToggleHTML(key, ico, title, sub) {
    var on = !!alerts()[key];
    return '<button type="button" class="toggle-row' + (on ? ' on' : '') + '" data-act="alert-toggle" data-key="' + key + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      '<span class="tg-ico">' + ico + '</span>' +
      '<span class="tg-txt"><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span>' +
      '<span class="tg-state">' + (on ? '켜짐' : '꺼짐') + '</span>' +
    '</button>';
  }
  function toggleAlert(key) {
    var a = alerts();
    if (key === 'push') {
      if (a.push) {
        setAlert('push', false); render({ keepScroll: true });
        UI.toast('브라우저 알림을 껐어요', { emoji: '📱' });
        return;
      }
      if (!('Notification' in window)) {
        UI.toast('이 브라우저는 알림을 지원하지 않아요', { kind: 'warn' });
        return;
      }
      var done = function (perm) {
        if (perm === 'granted') {
          setAlert('push', true); render({ keepScroll: true });
          UI.toast('브라우저 알림을 켰어요', { emoji: '📱', kind: 'good' });
          pushAlert('우리집 다모아', '이렇게 알려드릴게요 🔔');
        } else {
          UI.toast('알림 권한이 허용되지 않았어요. 브라우저 설정에서 허용해 주세요', { kind: 'warn', duration: 4400 });
        }
      };
      try {
        if (window.Notification.permission === 'granted') { done('granted'); return; }
        var r = window.Notification.requestPermission(done);
        if (r && r.then) r.then(done);
      } catch (e) { UI.toast('알림을 켜지 못했어요', { kind: 'warn' }); }
      return;
    }
    setAlert(key, !a[key]);
    render({ keepScroll: true });
    var label = key === 'sound' ? '알림 소리' : '소리 내어 읽기';
    UI.toast(label + (alerts()[key] ? '를 켰어요' : '를 껐어요'), { emoji: key === 'sound' ? '🔔' : '🗣️' });
    if (key === 'sound' && alerts()[key]) chime();
  }

  /* ---- 📢 한마디 (상단 버튼 → 모달) ---- */
  function bannerComposeModal() {
    if (!needParent('한마디는 부모님 모드에서 띄울 수 있어요')) return;
    var b = bannerObj();
    var names = bannerAckNames(b);
    UI.modal({
      title: '📢 태블릿에 한마디',
      bodyHTML: '<p class="help">한 줄 적고 <b>띄우기</b>를 누르면 거실 태블릿 화면 가운데에 크게 “빵!” 하고 떠요.</p>' +
        '<div class="field" style="margin-top:10px"><label>받을 사람</label>' +
          '<select class="select" id="bnTo"><option value="all">전체에게</option>' +
            D.children.map(function (c) {
              return '<option value="' + c.id + '"' + (b && b.to === c.id ? ' selected' : '') + '>' + esc(c.name) + '에게</option>';
            }).join('') +
          '</select></div>' +
        '<div class="field"><label>한 줄 메시지</label>' +
          '<input class="input" id="bnMsg" maxlength="60" value="' + esc(b ? b.message : '') + '" placeholder="예: 이제 그만 자자 🌙"></div>' +
        (b ? '<p class="help">지금 떠 있는 메시지 · ' + esc(bannerTargetLabel(b.to)) +
          (names.length ? ' · 읽음 ' + names.length + '명' : ' · 아직 확인 전') + '</p>' : ''),
      actions: [
        {
          label: '띄우기', kind: 'sun', onClick: function (close) {
            var msg = ((document.getElementById('bnMsg') || {}).value) || '';
            var to = ((document.getElementById('bnTo') || {}).value) || 'all';
            if (sendBanner(msg, to)) close();
            else return false;
          }
        },
        { label: '내리기', kind: 'ghost', onClick: function (close) { close(); clearBanner(); } },
        { label: '닫기', kind: 'ghost' }
      ]
    });
  }

  /* ---------------- 민국이 알림장 ---------------- */
  function noticeObj() {
    return S.schoolNotice || { title: '', date: '', message: '', items: [], updatedAt: 0 };
  }
  function noticeHasContent(n) {
    n = n || noticeObj();
    return !!(String(n.title || '').trim() || String(n.message || '').trim() || (n.items && n.items.length));
  }
  function noticeCardHTML() {
    var n = noticeObj();
    var items = n.items || [];
    var isParent = S.mode === 'parent';
    var done = items.filter(function (i) { return i.done; }).length;
    var sub = n.date ? UI.dateKo(n.date) : '서울언주초 1학년 3반';
    var head = cardHead('🏫', '민국이 알림장', sub,
      isParent ? '<button type="button" class="link-btn" data-act="edit-notice">✏️ 알림장 고치기</button>' : '');

    if (!noticeHasContent(n)) {
      return '<div class="card notice-card">' + head +
        '<div class="empty notice-empty"><span class="big">🏫</span>' +
          (isParent
            ? '아직 등록된 알림장이 없어요.<br>위쪽 <b>알림장 고치기</b>를 눌러 적어 주세요.'
            : '아직 등록된 알림장이 없어요.<br>엄마가 적으면 여기에 보여요.') +
        '</div></div>';
    }

    var msg = String(n.message || '').trim();
    return '<div class="card notice-card' + (isParent ? '' : ' kid') + '">' + head +
      (String(n.title || '').trim() ? '<p class="notice-title">' + esc(n.title) + '</p>' : '') +
      (msg ? '<p class="notice-msg">' + esc(msg) + '</p>' : '') +
      '<div class="notice-list">' + items.map(function (it) {
        return '<button type="button" class="notice-item' + (it.done ? ' done' : '') + '" data-act="notice-check" data-id="' + esc(it.id) + '">' +
          '<span class="notice-check" aria-hidden="true">' + (it.done ? '✓' : '') + '</span>' +
          '<span class="notice-text">' + esc(it.text) + '</span>' +
        '</button>';
      }).join('') + '</div>' +
      '<div class="notice-foot">' +
        '<span class="hint">' + (items.length ? done + '/' + items.length + '개 챙겼어요' : '') + '</span>' +
        (n.updatedAt ? '<span class="hint">' + UI.ago(n.updatedAt) + '에 적었어요</span>' : '') +
      '</div>' +
    '</div>';
  }

  function editNoticeModal() {
    if (!needParent('알림장은 부모님 모드에서 적을 수 있어요')) return;
    var n = noticeObj();
    var lines = (n.items || []).map(function (it) { return it.text; }).join('\n');
    UI.modal({
      title: '🏫 민국이 알림장',
      size: 'wide',
      bodyHTML:
        '<div class="field-row">' +
          '<div class="field"><label>제목</label><input class="input" id="ntTitle" value="' + esc(n.title || '') + '" placeholder="예: 11/13(금) 알림장"></div>' +
          '<div class="field"><label>알림장 날짜</label><input class="input" type="date" id="ntDate" value="' + esc(n.date || '') + '"></div>' +
        '</div>' +
        '<div class="field"><label>민국이에게 한 줄</label><input class="input" id="ntMsg" value="' + esc(n.message || '') + '" placeholder="예: 이번 주도 화이팅!"></div>' +
        '<div class="field"><label>챙길 것 · 숙제 (한 줄에 하나씩)</label>' +
          '<textarea class="input" id="ntItems" rows="8" placeholder="한 줄에 하나씩 적어 주세요">' + esc(lines) + '</textarea>' +
        '</div>' +
        '<p class="help">적은 내용은 민국이 홈 화면에 그대로 보여요. 다 챙긴 항목은 민국이가 직접 눌러 체크할 수 있어요.</p>' +
        '<p class="help" style="margin-top:6px">내용을 모두 지우고 저장하면 알림장이 비워집니다.</p>',
      actions: [
        {
          label: '저장', kind: 'primary', onClick: function (close) {
            applyNotice({
              title: ((document.getElementById('ntTitle') || {}).value || '').trim(),
              date: ((document.getElementById('ntDate') || {}).value || '').trim(),
              message: ((document.getElementById('ntMsg') || {}).value || '').trim(),
              itemsText: ((document.getElementById('ntItems') || {}).value || '')
            });
            close();
          }
        },
        { label: '취소', kind: 'ghost' }
      ]
    });
  }

  function applyNotice(data) {
    var prev = noticeObj();
    var items = String(data.itemsText || '').split('\n')
      .map(function (s) { return s.trim(); })
      .filter(Boolean)
      .map(function (text) {
        var old = (prev.items || []).filter(function (it) { return it.text === text; })[0];
        return old ? { id: old.id, text: text, done: old.done || 0 } : { id: UI.uid('nt'), text: text, done: 0 };
      });
    S.schoolNotice = {
      title: data.title || '',
      date: data.date || '',
      message: data.message || '',
      items: items,
      updatedAt: (data.title || data.message || items.length) ? Date.now() : 0
    };
    save();
    render({ keepScroll: true });
    UI.toast(noticeHasContent(S.schoolNotice) ? '민국이 알림장을 저장했어요' : '알림장을 비웠어요',
      { emoji: '🏫', kind: 'good' });
  }

  function toggleNoticeItem(id) {
    var n = S.schoolNotice;
    if (!n || !Array.isArray(n.items)) return;
    var it = n.items.filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    it.done = it.done ? 0 : Date.now();
    save();
    render({ keepScroll: true });
    if (it.done) UI.toast('챙겼어요! 👍', { emoji: '✅', kind: 'good', duration: 1600 });
  }

  function kidCardHTML(c) {
    var today = todayKey();
    var st = routineStats(c.id, today);
    var pct = st.total ? Math.round(st.done / st.total * 100) : 0;
    var isActive = c.id === routineChild;
    var body = bodySummary(c.id);
    var C = 2 * Math.PI * 30;
    var rest = st.total - st.done;
    var ring = '<span class="kc-ring" aria-hidden="true">' +
        '<svg viewBox="0 0 72 72">' +
          '<circle class="ring-bg" cx="36" cy="36" r="30"/>' +
          '<circle class="ring-fg" cx="36" cy="36" r="30" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - pct / 100)).toFixed(1) + '"/>' +
        '</svg>' +
        '<span class="kc-ring-txt"><b>' + (rest > 0 ? rest : '✓') + '</b><small>' + (rest > 0 ? '개 남음' : '다 했어요') + '</small></span>' +
      '</span>';
    return '<button type="button" class="kid-card ' + c.color + (isActive ? ' is-active' : '') + '" data-act="pick-kid" data-id="' + c.id + '" aria-pressed="' + (isActive ? 'true' : 'false') + '">' +
      '<span class="kc-top">' +
        '<span class="kc-ava">' + Art.kid(c.id) + '</span>' +
        '<span class="kc-info">' +
          '<span class="kc-name"><strong>' + esc(c.name) + '</strong><small>' + esc(c.tag) + '</small></span>' +
          '<span class="kc-star">⭐ <span class="kc-star-num">' + (S.stars[c.id] || 0) + '</span></span>' +
          '<span class="kc-body">📏 ' + (body ? esc(body) : '키·몸무게 기록 없음') + '</span>' +
        '</span>' +
        ring +
      '</span>' +
      '<span class="kc-foot">' +
        '<span>🏅 받은 칭찬 <b>' + (S.praiseCount[c.id] || 0) + '</b></span>' +
        '<span class="kc-go">' + esc(c.name) + ' 할 일 보기 ›</span>' +
      '</span>' +
    '</button>';
  }

  function eventTypeInfo(key) {
    return D.eventTypes.filter(function (t) { return t.key === key; })[0] || D.eventTypes[0];
  }
  function eventPrepHTML(e, compact) {
    var items = e.items || [];
    if (!items.length) return '';
    var done = items.filter(function (i) { return i.done; }).length;
    var state = done >= items.length ? '다 챙겼어요 ✓' : done ? done + '/' + items.length : '';
    return '<div class="prep-row">' +
      '<div class="prep-label">🎒 준비물' + (state ? ' <b>' + state + '</b>' : '') + '</div>' +
      '<div class="prep-chips">' + items.map(function (it) {
        return '<button type="button" class="prep-chip' + (it.done ? ' done' : '') + '" data-act="prep-check" data-ev="' + e.id + '" data-id="' + esc(it.id) + '" aria-pressed="' + (it.done ? 'true' : 'false') + '">' +
          '<span class="prep-box" aria-hidden="true">' + (it.done ? '✓' : '') + '</span>' + esc(it.text) + '</button>';
      }).join('') + '</div>' +
    '</div>';
  }

  function evItemHTML(e, compact) {
    var color = memberColor(e.member);
    var type = eventTypeInfo(e.type);
    return '<div class="ev-item ' + color + ' ev-' + e.type + '">' +
      '<div class="ev-main">' +
        '<div class="ev-title">' + esc(e.title) + '</div>' +
        '<div class="ev-meta">' +
          '<span class="badge ' + color + '">' + esc(memberName(e.member)) + '</span>' +
          '<span class="ev-type">' + type.emoji + ' ' + esc(type.label) + '</span>' +
          '<span>' + (compact ? UI.shortDateKo(e.date) : '') + (e.time ? ' ' + esc(e.time) : '') + '</span>' +
          (e.note ? '<span>· ' + esc(e.note) + '</span>' : '') +
        '</div>' +
        eventPrepHTML(e, compact) +
      '</div>' +
      '<span class="ev-dday' + (dday(e.date) === '오늘' ? ' today' : '') + '">' + dday(e.date) + '</span>' +
      (S.mode === 'parent' && !compact
        ? '<button type="button" class="icon-btn" data-act="del-event" data-id="' + e.id + '" aria-label="일정 삭제">🗑</button>' : '') +
    '</div>';
  }

  function togglePrep(evId, itemId) {
    var ev = S.events.filter(function (e) { return e.id === evId; })[0];
    if (!ev || !Array.isArray(ev.items)) return;
    var it = ev.items.filter(function (x) { return x.id === itemId; })[0];
    if (!it) return;
    it.done = it.done ? 0 : Date.now();
    save();
    render({ keepScroll: true });
    if (it.done) UI.toast('챙겼어요! ' + it.text + ' ✓', { emoji: '🎒', kind: 'good', duration: 1600 });
  }

  /* 예전에 저장된 칭찬 기록도 아이에 맞는 문구로 보여 줍니다 (이준은 형) */
  function praiseLogLabel(l) {
    var text = String((l && l.item) || '');
    if (l && l.childId === 'ijun') text = text.replace(/동생/g, '형');
    return text;
  }

  function recentLogsHTML(limit) {
    var list = S.praiseLog.slice().sort(function (a, b) { return b.ts - a.ts; });
    if (!list.length) {
      return '<div class="empty"><span class="big">🌱</span>아직 칭찬 기록이 없어요.<br>칭찬을 하면 여기에 차곡차곡 쌓여요.</div>';
    }
    return '<div class="log-list">' + list.slice(0, limit).map(function (l) {
      return logItemHTML({
        emoji: l.emoji || '⭐',
        main: '<b>' + esc(childById(l.childId).name) + '</b> 칭찬 · ' + esc(praiseLogLabel(l)),
        by: l.by ? ' · ' + esc(l.by) : '',
        ts: l.ts
      });
    }).join('') + '</div>';
  }

  function logItemHTML(o) {
    return '<div class="log-item">' +
      '<span>' + (o.emoji || '•') + '</span>' +
      '<div class="l-main">' + o.main + (o.by || '') + '</div>' +
      '<span class="l-time">' + UI.ago(o.ts) + '</span>' +
    '</div>';
  }

  /* ================= 루틴 ================= */
  function timeBannerHTML() {
    var h = new Date().getHours();
    var mood, art, title, sub;
    if (h >= 5 && h < 11) {
      mood = 'morning'; art = Art.morningArt(); title = '아침 루틴';
      sub = '따뜻한 해처럼 기분 좋게 시작해요';
    } else if (h >= 11 && h < 17) {
      mood = 'day'; art = Art.dayArt(); title = '낮 루틴';
      sub = '하나씩 차근차근 해 보아요';
    } else if (h >= 17 && h < 22) {
      mood = 'evening'; art = Art.nightArt(); title = '저녁 루틴';
      sub = '달님이 지켜보고 있어요, 하나씩!';
    } else {
      mood = 'night'; art = Art.nightArt(); title = '밤 루틴';
      sub = '이제 곧 잘 시간이에요';
    }
    var today = todayKey();
    var pills = D.children.map(function (c) {
      var st = routineStats(c.id, today);
      return '<span class="tb-pill">' + c.emoji + ' ' + esc(c.name) + ' ' + st.done + '/' + st.total + '</span>';
    }).join('');
    return '<div class="time-banner ' + mood + '">' + art +
        '<div class="tb-text"><b>' + title + '</b>' +
          '<span>' + esc(UI.dateKo(today)) + ' · ' + sub + '</span></div>' +
        '<div class="tb-right">' + pills + '</div>' +
      '</div>';
  }

  function renderRoutine() {
    var today = todayKey();
    var slots = [{ key: 'all', label: '전체' }, { key: 'morning', label: '🌅 아침' }, { key: 'evening', label: '🌙 저녁' }];
    var doneTotal = 0, allTotal = 0;
    D.children.forEach(function (k) {
      var st = routineStats(k.id, today);
      doneTotal += st.done; allTotal += st.total;
    });
    return timeBannerHTML() +
      modeStripHTML() +
      '<div class="card soft-mint routine-card">' +
        '<div class="routine-head">' +
          '<strong>✅ 오늘 할 일</strong>' +
          '<div class="growth-toggle">' + slots.map(function (s) {
            return '<button type="button" class="chip' + (routineSlot === s.key ? ' active' : '') + '" data-act="pick-routine-slot" data-slot="' + s.key + '">' + s.label + '</button>';
          }).join('') + '</div>' +
          '<span style="flex:1"></span>' +
          '<span class="badge sun">오늘 ' + doneTotal + '/' + allTotal + '</span>' +
        '</div>' +
        '<p class="help">두 아이를 한 화면에서 바로 체크해요. 오른쪽 동그라미를 누르면 바로 완료되고 별 ⭐ 1개가 쌓여요.</p>' +
      '</div>' +
      '<div class="duo-grid">' + D.children.map(routineKidCardHTML).join('') + '</div>' +
      '<div class="lock-note">🔒 완료한 일은 부모님 모드에서 되돌릴 수 있어요. 완료할 때마다 별 ⭐ 1개가 쌓여요.</div>';
  }

  function routineGroupHTML(c, title, emoji, list) {
    if (!list.length) {
      return S.mode === 'parent'
        ? '<div class="routine-group"><div class="rg-head"><span class="ico">' + emoji + '</span>' + esc(title) + '</div>' +
            '<div class="empty notice-empty" style="padding:10px">아직 ' + esc(title) + ' 할 일이 없어요. <b>＋ 할 일 추가</b>로 넣어 보세요.</div></div>'
        : '';
    }
    var today = todayKey();
    var parent = S.mode === 'parent';
    var doneCnt = list.filter(function (i) { return isDone(i.id, today); }).length;
    return '<div class="routine-group">' +
      '<div class="rg-head"><span class="ico">' + emoji + '</span>' + esc(title) +
        ' <span class="badge mint" style="margin-left:4px">' + doneCnt + '/' + list.length + '</span></div>' +
      '<div class="routine-list">' + list.map(function (i) {
        var done = isDone(i.id, today);
        var ts = done ? S.routine[today][i.id] : null;
        var del = parent
          ? '<button type="button" class="r-del" data-act="routine-del" data-child="' + c.id + '" data-item="' + i.id + '" aria-label="' + esc(i.label) + ' 지우기" title="목록에서 지우기">🗑️</button>'
          : '';
        if (done) {
          return '<div class="routine-item done">' +
              '<span class="r-emoji">' + i.emoji + '</span>' +
              '<span class="r-label">' + esc(i.label) +
                '<span class="r-time">' + (ts ? UI.timeKo(ts) + ' 완료' : '완료') + '</span></span>' +
              (parent
                ? '<button type="button" class="icon-btn" data-act="routine-undo" data-child="' + c.id + '" data-item="' + i.id + '" aria-label="되돌리기">↩</button>' : '') +
              '<span class="routine-check on" aria-label="완료함">✓</span>' +
              del +
            '</div>';
        }
        if (parent) {
          return '<div class="routine-item">' +
              '<button type="button" class="r-main" data-act="routine-check" data-child="' + c.id + '" data-item="' + i.id + '">' +
                '<span class="r-emoji">' + i.emoji + '</span>' +
                '<span class="r-label">' + esc(i.label) + '</span>' +
              '</button>' +
              '<button type="button" class="routine-check" data-act="routine-check" data-child="' + c.id + '" data-item="' + i.id + '" aria-label="' + esc(i.label) + ' 완료"></button>' +
              del +
            '</div>';
        }
        return '<button type="button" class="routine-item" data-act="routine-check" data-child="' + c.id + '" data-item="' + i.id + '">' +
            '<span class="r-emoji">' + i.emoji + '</span>' +
            '<span class="r-label">' + esc(i.label) + '</span>' +
            '<span class="routine-check" aria-hidden="true"></span>' +
          '</button>';
      }).join('') + '</div>' +
    '</div>';
  }

  function routineKidCardHTML(c) {
    var today = todayKey();
    var items = routineItems(c.id);
    var st = routineStats(c.id, today);
    var pct = st.total ? Math.round(st.done / st.total * 100) : 0;
    var body = '';
    if (routineSlot === 'all' || routineSlot === 'morning') body += routineGroupHTML(c, '아침', '🌅', items.morning);
    if (routineSlot === 'all' || routineSlot === 'evening') body += routineGroupHTML(c, '저녁', '🌙', items.evening);
    return '<div class="card routine-kid ' + c.color + '">' +
      '<div class="rk-head">' +
        kidAvaHTML(c) +
        '<strong>' + esc(c.name) + '</strong>' +
        '<span class="badge sun">⭐ ' + (S.stars[c.id] || 0) + '</span>' +
        '<span class="rk-spacer"></span>' +
        '<span class="rk-done">' + st.done + '/' + st.total + ' · ' + pct + '%</span>' +
      '</div>' +
      '<div class="progress" style="margin-top:9px"><i style="width:' + pct + '%"></i></div>' +
      body +
      (S.mode === 'parent'
        ? '<button type="button" class="btn btn-soft btn-sm routine-add-btn" data-act="add-routine" data-child="' + c.id + '">＋ ' + esc(c.name) + ' 할 일 추가</button>'
        : '') +
    '</div>';
  }

  /* 부모님 확인 곱셈 문제 (매번 새 문제) — 아이 모드 → 부모님 모드 전환에만 씁니다 */
  function askQuiz(onPass, subHTML) {
    var a = 0, b = 0, product = 0;

    function makeQuestion() {
      var A = [6, 7, 8, 9, 12, 13, 14, 16, 17, 18, 19, 21, 23, 24];
      var B = [3, 4, 5, 6, 7, 8, 9];
      var na, nb, tries = 0;
      do {
        na = A[Math.floor(Math.random() * A.length)];
        nb = B[Math.floor(Math.random() * B.length)];
        tries++;
      } while (tries < 30 && na * nb < 40);
      a = na; b = nb; product = a * b;
    }
    makeQuestion();

    var m = UI.modal({
      title: '부모님 확인 문제',
      bodyHTML: '<div class="quiz-box" id="quizBox">' +
          '<p class="quiz-sub">' + (subHTML || '부모님 확인이 필요해요.') + '</p>' +
          '<div class="quiz-q" id="quizQ"></div>' +
          '<input class="quiz-input" id="quizInput" type="text" inputmode="numeric" autocomplete="off" aria-label="정답">' +
          '<p class="quiz-wrong" id="quizWrong"></p>' +
        '</div>',
      actions: [
        { label: '확인', kind: 'primary' },
        { label: '다른 문제', kind: 'ghost' },
        { label: '취소', kind: 'ghost' }
      ],
      onOpen: function (wrap, close) {
        var qEl = wrap.querySelector('#quizQ');
        var inEl = wrap.querySelector('#quizInput');
        var wEl = wrap.querySelector('#quizWrong');
        var box = wrap.querySelector('#quizBox');
        var attempts = 0;

        function draw() { qEl.textContent = a + ' × ' + b + ' = ?'; }
        draw();

        function submit() {
          var v = (inEl.value || '').replace(/[^0-9]/g, '');
          if (!v) { wEl.textContent = '답을 입력해 주세요.'; return; }
          if (Number(v) === product) {
            close();
            onPass();
            return;
          }
          attempts++;
          box.classList.remove('shake');
          void box.offsetWidth;
          box.classList.add('shake');
          inEl.value = '';
          if (attempts >= 3) {
            wEl.textContent = '부모님과 함께 다시 해 볼까요?';
            setTimeout(function () { close(); }, 900);
            return;
          }
          wEl.textContent = '아쉬워요! 새 문제로 다시 해 보세요.';
          makeQuestion();
          draw();
        }

        inEl.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
        });
        wrap.querySelectorAll('[data-action-index]')[0].addEventListener('click', function (e) {
          e.stopImmediatePropagation();
          e.preventDefault();
          submit();
        });
        wrap.querySelectorAll('[data-action-index]')[1].addEventListener('click', function (e) {
          e.stopImmediatePropagation();
          e.preventDefault();
          inEl.value = '';
          wEl.textContent = '';
          makeQuestion();
          draw();
        });
        setTimeout(function () { inEl.focus(); }, 120);
      }
    });
    return m;
  }

  function completeRoutine(childId, itemId) {
    var today = todayKey();
    S.routine[today] = S.routine[today] || {};
    if (S.routine[today][itemId]) return;
    S.routine[today][itemId] = Date.now();
    S.stars[childId] = (S.stars[childId] || 0) + 1;
    save();
    render({ keepScroll: true });

    var st = routineStats(childId, today);
    var key = today + ':' + childId;
    if (st.done >= st.total && !S.celebrated[key]) {
      S.celebrated[key] = true;
      save();
      UI.confetti(46);
      UI.toast('오늘 루틴을 모두 마쳤어요! 별 ' + st.done + '개 획득 ⭐', { emoji: '🎉', kind: 'good', duration: 3600 });
    } else {
      UI.toast('별 1개를 받았어요! ⭐', { emoji: '✅', kind: 'good' });
    }
  }

  function undoRoutine(childId, itemId) {
    if (!needParent()) return;
    var today = todayKey();
    if (S.routine[today] && S.routine[today][itemId]) {
      delete S.routine[today][itemId];
      S.stars[childId] = Math.max(0, (S.stars[childId] || 0) - 1);
      var key = today + ':' + childId;
      delete S.celebrated[key];
      save();
      render({ keepScroll: true });
      UI.toast('완료를 되돌렸어요');
    }
  }

  /* 칭찬 항목 문구: 아이마다 다를 수 있어요 (이준은 형, 민국은 동생) */
  function praiseLabel(item, childId) {
    if (item && item.labels && item.labels[childId]) return item.labels[childId];
    return item ? item.label : '';
  }

  /* ================= 칭찬 ================= */
  function renderPraise() {
    var total = 0;
    D.children.forEach(function (k) { total += (S.praiseCount[k.id] || 0); });
    return '<div class="duo-grid">' + D.children.map(praiseKidCardHTML).join('') + '</div>' +
      (S.mode === 'parent' ? '' : '<div class="lock-note">🔒 칭찬은 부모님 모드에서 할 수 있어요.</div>') +
      '<div class="card" style="margin-top:12px">' +
        cardHead('🧾', '최근 칭찬 기록', total ? '지금까지 ' + total + '번 칭찬했어요' : '칭찬한 만큼 차곡차곡') +
        recentLogsHTML(20) +
      '</div>';
  }

  function praiseKidCardHTML(c) {
    return '<div class="card praise-kid ' + c.color + '">' +
      '<div class="rk-head">' +
        kidAvaHTML(c) +
        '<strong>' + esc(c.name) + '</strong>' +
        '<span class="badge sun">⭐ ' + (S.stars[c.id] || 0) + '</span>' +
        '<span class="rk-spacer"></span>' +
        '<span class="badge rose">🏅 ' + (S.praiseCount[c.id] || 0) + '</span>' +
      '</div>' +
      '<div class="praise-items" style="margin-top:10px">' + D.praiseItems.map(function (p) {
        return '<button type="button" class="praise-item" data-act="praise" data-child="' + c.id + '" data-item="' + p.id + '">' +
          '<span>' + p.emoji + '</span>' + esc(praiseLabel(p, c.id)) + '</button>';
      }).join('') + '</div>' +
    '</div>';
  }

  function addPraise(childId, itemId) {
    if (!needParent('칭찬은 부모님 모드에서 할 수 있어요')) return;
    var item = D.praiseItems.filter(function (p) { return p.id === itemId; })[0];
    if (!item) return;
    S.praiseLog.unshift({
      id: UI.uid('praise'), childId: childId, item: praiseLabel(item, childId), emoji: item.emoji, by: S.actor || '부모님', ts: Date.now()
    });
    S.stars[childId] = (S.stars[childId] || 0) + 1;
    S.praiseCount[childId] = (S.praiseCount[childId] || 0) + 1;
    save();
    render({ keepScroll: true });
    UI.confetti(14);
    UI.toast(childById(childId).name + '이를 칭찬했어요! 별 ⭐ 1개', { emoji: item.emoji, kind: 'good' });
  }

  /* ================= 일정 ================= */
  function renderCalendar() {
    var cursor = calCursor;
    var year = cursor.getFullYear(), month = cursor.getMonth();
    var first = new Date(year, month, 1);
    var startDow = first.getDay();
    var start = new Date(year, month, 1 - startDow);
    var cells = [];
    for (var i = 0; i < 42; i++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var key = UI.dateKey(d);
      var evs = eventsOn(key);
      var cls = 'cal-day';
      if (d.getMonth() !== month) cls += ' outside';
      if (key === todayKey()) cls += ' today';
      if (key === calSelected) cls += ' selected';
      cells.push('<button type="button" class="' + cls + '" data-act="pick-day" data-date="' + key + '">' +
        '<span class="cal-num">' + d.getDate() + '</span>' +
        '<span class="cal-dots">' + evs.slice(0, 3).map(function (e) {
          return '<i class="cal-dot ' + memberColor(e.member) + '"></i>';
        }).join('') + '</span>' +
        '</button>');
    }
    var dows = ['일', '월', '화', '수', '목', '금', '토'].map(function (w, i) {
      return '<div class="cal-dow ' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</div>';
    }).join('');

    var sel = eventsOn(calSelected);
    var upcoming = upcomingEvents(8, 90);

    return '<div class="two-col">' +
      '<div class="card soft-sun">' +
        '<div class="cal-head">' +
          '<button type="button" class="icon-btn" data-act="cal-prev" aria-label="이전 달">‹</button>' +
          '<div class="cal-title">' + year + '년 ' + (month + 1) + '월</div>' +
          '<button type="button" class="icon-btn" data-act="cal-next" aria-label="다음 달">›</button>' +
          '<button type="button" class="btn btn-soft btn-sm" data-act="cal-today">오늘</button>' +
        '</div>' +
        '<div class="cal-grid">' + dows + cells.join('') + '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap">' +
          '<strong style="font-size:13.5px">' + UI.dateKo(calSelected) + '</strong>' +
          '<span style="flex:1"></span>' +
          (S.mode === 'parent'
            ? '<button type="button" class="btn btn-primary btn-sm" data-act="add-event">＋ 일정·준비물</button>'
            : '<span class="badge lav">🔒 추가는 부모님 모드</span>') +
        '</div>' +
        '<div class="ev-list" style="margin-top:10px">' +
          (sel.length ? sel.map(function (e) { return evItemHTML(e, false); }).join('')
            : '<div class="empty"><span class="big">📭</span>이 날은 일정이 없어요.</div>') +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        cardHead('⏰', '다가오는 일정', '앞으로 3개월') +
        (upcoming.length ? '<div class="ev-list">' + upcoming.map(function (e) { return evItemHTML(e, false); }).join('') + '</div>'
          : '<div class="empty"><span class="big">🗓️</span>등록된 일정이 없어요.<br>달력에서 날짜를 고르고 추가해 보세요.</div>') +
      '</div>' +
    '</div>';
  }

  function addEventModal(presetDate) {
    if (!needParent('일정은 부모님 모드에서 추가할 수 있어요')) return;
    UI.modal({
      title: '📅 일정 · 준비물 추가',
      size: 'wide',
      bodyHTML:
        '<div class="field-row">' +
          '<div class="field"><label>누구 일정인가요?</label><select class="select" id="evMember">' +
            D.scheduleMembers.map(function (m) {
              return '<option value="' + m.id + '">' + esc(m.name) + '</option>';
            }).join('') + '</select></div>' +
          '<div class="field"><label>종류</label><select class="select" id="evType">' +
            D.eventTypes.map(function (t) {
              return '<option value="' + t.key + '">' + t.emoji + ' ' + esc(t.label) + '</option>';
            }).join('') + '</select></div>' +
        '</div>' +
        '<div class="field"><label>일정 이름</label><input class="input" id="evTitle" placeholder="예: 현장학습, 수영 대회"></div>' +
        '<div class="field-row">' +
          '<div class="field"><label>날짜</label><input class="input" id="evDate" type="date" value="' + (presetDate || calSelected) + '"></div>' +
          '<div class="field"><label>시간 (선택)</label><input class="input" id="evTime" type="time"></div>' +
        '</div>' +
        '<div class="field"><label>🎒 준비물 (한 줄에 하나씩)</label>' +
          '<textarea class="input" id="evItems" rows="4" placeholder="예: 실내화\n색종이\n물통"></textarea>' +
          '<p class="help">적어 두면 홈·달력 다가오는 일정에 <b>🎒 준비물</b> 칩으로 보이고, 챙길 때마다 누르면 체크돼요.</p>' +
        '</div>' +
        '<div class="field"><label>메모 (선택)</label><input class="input" id="evNote" placeholder="장소 등"></div>',
      actions: [
        {
          label: '추가하기', kind: 'primary', onClick: function (close) {
            var title = document.getElementById('evTitle').value.trim();
            var date = document.getElementById('evDate').value;
            if (!title) { UI.toast('일정 이름을 적어 주세요', { kind: 'warn' }); return false; }
            if (!date) { UI.toast('날짜를 골라 주세요', { kind: 'warn' }); return false; }
            var items = String((document.getElementById('evItems') || {}).value || '')
              .split('\n').map(function (s) { return s.trim(); }).filter(Boolean)
              .map(function (text) { return { id: UI.uid('prep'), text: text.slice(0, 30), done: 0 }; });
            S.events.push({
              id: UI.uid('ev'),
              title: title,
              date: date,
              time: document.getElementById('evTime').value || '',
              member: document.getElementById('evMember').value,
              type: (document.getElementById('evType') || {}).value || 'family',
              items: items,
              note: document.getElementById('evNote').value.trim(),
              createdBy: S.actor || '부모님',
              ts: Date.now()
            });
            calSelected = date;
            calCursor = UI.parseKey(date);
            save();
            close();
            render({ keepScroll: true });
            UI.toast(items.length ? '일정과 준비물을 추가했어요' : '일정을 추가했어요', { emoji: '📅', kind: 'good' });
          }
        },
        { label: '취소', kind: 'ghost' }
      ]
    });
  }

  function deleteEvent(id) {
    if (!needParent()) return;
    var ev = S.events.filter(function (e) { return e.id === id; })[0];
    if (!ev) return;
    UI.confirm('일정을 지울까요?', '“' + ev.title + '” (' + UI.shortDateKo(ev.date) + ') 일정을 삭제합니다.', '지우기', 'danger')
      .then(function (ok) {
        if (!ok) return;
        S.events = S.events.filter(function (e) { return e.id !== id; });
        save();
        render({ keepScroll: true });
        UI.toast('일정을 지웠어요');
      });
  }

  /* ================= 우체통 ================= */
  function renderMailbox() {
    /* 보이는 편지는 읽음 처리 (배지 계산에만 사용) */
    var changed = false;
    D.mailRecipients.forEach(function (r) {
      S.messages.forEach(function (m) { if (m.toId === r.id && !m.read) { m.read = true; changed = true; } });
    });
    if (changed) save();

    var events = mailEvents();
    var shown = events.filter(function (ev) {
      return mailFilter === 'all' ? true : (ev.letter && ev.letter.fromId === mailFilter);
    });
    var isAll = mailFilter === 'all';
    var roomTitle = isAll ? '전체 가족방' : (childById(mailFilter).name + '와 나눈 편지');
    var roomSub = isAll
      ? '엄마·아빠·민국·이준이 한 방에서 시간순으로 이야기해요'
      : childById(mailFilter).name + '이 보낸 편지와 답장만 모아 봐요';

    return (S.mode === 'parent' ? bannerComposeHTML() : '') +
      '<div class="mail-layout">' +
      '<div class="card soft-rose mail-compose-card">' +
        cardHead('✏️', '편지 쓰기', '손글씨로도, 그림으로도 보내요') +
        '<div class="pick-child">' + D.children.map(function (k) {
          return '<button type="button" class="' + (k.id === mailSender ? 'active ' + (k.color === 'coral' ? 'coral' : '') : '') + '" data-act="pick-mail-sender" data-id="' + k.id + '">' +
            kidAvaHTML(k) + esc(k.name) + '</button>';
        }).join('') + '</div>' +
        '<div class="mail-recipients">' + D.mailRecipients.map(function (r) {
          return '<button type="button" class="mail-recipient' + (r.id === mailRecipient ? ' active' : '') + '" data-act="pick-mail-recipient" data-id="' + r.id + '">' +
            '<span class="emoji">' + r.emoji + '</span>' + esc(r.name) + '</button>';
        }).join('') + '</div>' +
        '<div class="field" style="margin-top:10px"><input class="input" id="mailText" maxlength="40" placeholder="짧은 말도 함께 보낼 수 있어요 (선택)"></div>' +
        handLetterHTML() +
        '<div class="mail-ornament"><span>🖼️ 그림 편지로 보내기</span></div>' +
        '<p class="help" style="margin:4px 0 8px">그림을 몇 개든 골라 마음껏 보내요.</p>' +
        '<div class="picto-grid">' + D.pictograms.map(function (p) {
          return '<button type="button" class="picto" data-act="pick-picto" data-id="' + p.id + '">' +
            '<span class="emoji">' + p.emoji + '</span>' + esc(p.label) + '</button>';
        }).join('') + '</div>' +
        '<button type="button" class="mic-btn" id="mailMic" data-act="mail-mic" aria-pressed="false">' +
          '<span class="mic-ico" aria-hidden="true">🎤</span>' +
          '<span class="mic-text"><b>눌러서 말하기</b><small id="mailMicHint">버튼을 누르고 말해요. 다시 누르면 끝나요.</small></span>' +
        '</button>' +
        '<div class="mail-compose-foot">' +
          '<span class="counter" id="mailCounter">' + (window.__pictos || []).length + '개 골랐어요</span>' +
          '<button type="button" class="btn btn-rose" data-act="send-mail">편지 보내기 💌</button>' +
        '</div>' +
      '</div>' +

      '<div class="card mail-room">' +
        cardHead('📮', roomTitle, roomSub,
          '<span class="badge rose">' + shown.length + '개</span>') +
        '<div class="room-filter">' + roomFilterHTML() + '</div>' +
        (shown.length
          ? '<div class="chat-thread family">' + shown.map(function (ev) { return ev.html; }).join('') + '</div>'
          : '<div class="empty notice-empty"><span class="big">📭</span>' +
              (isAll ? '아직 가족방에 편지가 없어요.<br>아이가 그림 편지를 보내면 여기에 쌓여요.'
                     : childById(mailFilter).name + '의 편지가 아직 없어요.') + '</div>') +
        chatReplyBarHTML() +
      '</div>' +
    '</div>';
  }

  /* [전체 가족방] [민국] [이준] 필터 칩 */
  function roomFilterHTML() {
    var chips = [{ id: 'all', label: '전체 가족방', emoji: '💬' }].concat(D.children.map(function (c) {
      return { id: c.id, label: c.name, emoji: c.emoji };
    }));
    return chips.map(function (c) {
      var n = c.id === 'all' ? S.messages.length : S.messages.filter(function (m) { return m.fromId === c.id; }).length;
      return '<button type="button" class="room-chip' + (mailFilter === c.id ? ' active' : '') + '" data-act="mail-filter" data-id="' + c.id + '" aria-pressed="' + (mailFilter === c.id ? 'true' : 'false') + '">' +
        '<span>' + c.emoji + '</span>' + esc(c.label) + '<i>' + n + '</i></button>';
    }).join('');
  }

  /* 전체 가족방: 모든 편지와 답장을 시간순으로 */
  function mailEvents() {
    var items = [];
    S.messages.forEach(function (m) {
      items.push({ ts: m.ts || 0, letter: m, html: letterBubbleHTML(m) });
      (m.replies || []).forEach(function (r) {
        items.push({ ts: r.ts || 0, letter: m, reply: r, html: replyBubbleHTML(m, r) });
      });
    });
    items.sort(function (a, b) { return a.ts - b.ts; });
    return items;
  }

  function parentFace(name) {
    return name === '아빠' ? '👨' : name === '엄마' ? '👩' : '👪';
  }

  function pictoChatChips(m) {
    return (m.pictos || []).map(function (id) {
      var p = D.pictograms.filter(function (x) { return x.id === id; })[0];
      return p ? '<span class="chat-picto"><span class="emoji">' + p.emoji + '</span>' + esc(p.label) + '</span>' : '';
    }).join('');
  }

  /* 아이가 보낸 그림 편지 (왼쪽 말풍선) + 바로 답장 버튼 */
  function letterBubbleHTML(m) {
    var from = childById(m.fromId);
    var pictos = pictoChatChips(m);
    return '<div class="chat-row them">' +
      '<span class="chat-ava ' + from.color + '">' + from.emoji + '</span>' +
      '<div class="chat-col">' +
        '<div class="chat-meta"><b>' + esc(from.name) + '</b><span class="chat-arrow">→</span><span>' + esc(m.toName) + '</span>' +
          '<span class="chat-time">' + UI.ago(m.ts) + '</span></div>' +
        '<div class="chat-bubble them">' +
          (pictos ? '<div class="chat-pictos">' + pictos + '</div>' : '') +
          (m.hw
            ? '<button type="button" class="chat-hw-btn" data-act="view-hw" data-id="' + m.id + '" aria-label="손글씨 편지 크게 보기"><img class="chat-hw" src="' + m.hw + '" alt="' + esc(from.name) + '의 손글씨 편지" loading="lazy"></button>'
            : (m.hwDropped ? '<div class="chat-hw-gone">✍️ 손글씨 편지 (그림은 오래되어 정리했어요)</div>' : '')) +
          (m.text ? '<div class="chat-text">' + esc(m.text) + '</div>' : '') +
          '<button type="button" class="chat-speak" data-act="read-letter" data-id="' + m.id + '" aria-label="소리 내어 읽어주기" title="읽어주기">🔊</button>' +
        '</div>' +
        quickReplyRowHTML(m) +
      '</div>' +
    '</div>';
  }

  /* 말풍선 아래 빠른 답장 (부모님 모드) */
  function quickReplyRowHTML(m) {
    if (S.mode !== 'parent') return '';
    return '<div class="chat-quick">' + D.quickReplies.map(function (q) {
      return '<button type="button" class="qreply" data-act="quick-reply" data-id="' + m.id + '" data-text="' + esc(q.label) + '" data-emoji="' + esc(q.emoji) + '">' +
        q.emoji + ' ' + esc(q.label) + '</button>';
    }).join('') + '</div>';
  }

  /* 부모님 답장 (오른쪽 말풍선) — 엄마 → 민국 처럼 방향을 함께 */
  function replyBubbleHTML(m, r) {
    var kid = childById(m && m.fromId);
    return '<div class="chat-row me">' +
      '<div class="chat-col right">' +
        '<div class="chat-meta right"><span class="chat-time">' + UI.ago(r.ts) + '</span>' +
          '<b>' + esc(r.by) + '</b><span class="chat-arrow">→</span><span>' + esc(kid.name) + '</span></div>' +
        '<div class="chat-bubble me">' + (r.emoji && r.emoji !== '💬' ? r.emoji + ' ' : '') + esc(r.text) + '</div>' +
      '</div>' +
      '<span class="chat-ava parent">' + parentFace(r.by) + '</span>' +
    '</div>';
  }
  /* 가족방처럼 고정된 답장창 (지금 보고 있는 방의 가장 최근 편지에 답장) */
  function chatReplyBarHTML() {
    var all = S.messages.slice()
      .filter(function (m) { return mailFilter === 'all' || m.fromId === mailFilter; })
      .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    var target = all[0] || null;
    if (!target) {
      return '<div class="chat-replybar"><p class="help">아이가 그림 편지를 보내면 여기서 바로 답장할 수 있어요.</p></div>';
    }
    if (S.mode !== 'parent') {
      return '<div class="chat-replybar"><p class="help">🔒 답장은 부모님 모드에서 보낼 수 있어요.</p></div>';
    }
    var from = childById(target.fromId);
    return '<div class="chat-replybar">' +
      '<div class="crb-to">' + from.emoji + ' <b>' + esc(from.name) + '</b>의 마지막 편지에 답장해요 · <span>→ ' + esc(target.toName) + '</span></div>' +
      '<div class="chip-row crb-quick">' + D.quickReplies.map(function (q) {
        return '<button type="button" class="chip" data-act="quick-reply" data-id="' + target.id + '" data-text="' + esc(q.label) + '" data-emoji="' + esc(q.emoji) + '">' +
          q.emoji + ' ' + esc(q.label) + '</button>';
      }).join('') + '</div>' +
      '<div class="crb-input">' +
        '<input class="input" id="replyInput" maxlength="60" placeholder="답장을 적어 주세요">' +
        '<button type="button" class="btn btn-primary" data-act="send-reply" data-id="' + target.id + '">보내기</button>' +
      '</div>' +
    '</div>';
  }

  /* 🎤 말해서 쓰기 (Web Speech API, 한국어) */
  var micRec = null;
  var micOn = false;
  function mailMicToggle() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var btn = document.getElementById('mailMic');
    var hint = document.getElementById('mailMicHint');
    if (!SR) {
      UI.toast('이 브라우저는 말해서 쓰기를 지원하지 않아요. 글자로 적어 주세요', { emoji: '🎤', kind: 'warn', duration: 3400 });
      return;
    }
    if (micOn && micRec) { try { micRec.stop(); } catch (e) {} return; }
    var input = document.getElementById('mailText');
    var base = input ? (input.value || '') : '';
    try {
      micRec = new SR();
    } catch (e) {
      UI.toast('마이크를 쓸 수 없어요. 글자로 적어 주세요', { emoji: '🎤', kind: 'warn' });
      return;
    }
    micRec.lang = 'ko-KR';
    micRec.interimResults = true;
    micRec.continuous = false;
    micRec.maxAlternatives = 1;

    micRec.onstart = function () {
      micOn = true;
      if (btn) { btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true'); }
      if (hint) hint.textContent = '듣고 있어요… 말해 주세요. (다시 누르면 끝)';
    };
    micRec.onresult = function (ev) {
      var said = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) said += ev.results[i][0].transcript;
      said = said.trim();
      if (!input || !said) return;
      input.value = ((base ? base + ' ' : '') + said).slice(0, 40);
    };
    micRec.onerror = function (ev) {
      var code = ev && ev.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        UI.toast('마이크 사용을 하락해 주세요 (브라우저 설정)', { emoji: '🎤', kind: 'warn', duration: 3400 });
      } else if (code === 'no-speech') {
        UI.toast('말이 잘 안 들렸어요. 다시 해 볼까요?', { emoji: '🎤', kind: 'warn' });
      } else if (code !== 'aborted') {
        UI.toast('말해서 쓰기가 안 됐어요. 글자로 적어 주세요', { emoji: '🎤', kind: 'warn' });
      }
    };
    micRec.onend = function () {
      micOn = false;
      if (btn) { btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false'); }
      if (hint) hint.textContent = '버튼을 누르고 말해요. 다시 누르면 끝나요.';
    };
    try {
      micRec.start();
      UI.toast('듣고 있어요 🎤 또박또박 말해 주세요', { emoji: '🎤', duration: 2000 });
    } catch (e) {
      UI.toast('말해서 쓰기를 시작하지 못했어요', { emoji: '🎤', kind: 'warn' });
    }
  }

  function sendLetter() {
    if (!window.__pictos || !window.__pictos.length) {
      var txt0 = (document.getElementById('mailText') || {}).value || '';
      if (!txt0.trim()) { UI.toast('그림을 하나 골라 주세요', { emoji: '🖼️', kind: 'warn' }); return; }
    }
    var pictos = (window.__pictos || []).slice();
    var text = ((document.getElementById('mailText') || {}).value || '').trim();
    var rec = D.mailRecipients.filter(function (r) { return r.id === mailRecipient; })[0];
    var sender = childById(mailSender);
    S.messages.unshift({
      id: UI.uid('letter'),
      fromId: sender.id, fromName: sender.name,
      toId: rec.id, toName: rec.name,
      pictos: pictos, text: text,
      ts: Date.now(), read: false, replies: []
    });
    window.__pictos = [];
    lastMsgAt = Date.now();
    save();
    render({ keepScroll: true });
    UI.confetti(18);
    UI.toast(rec.name + '에게 편지를 보냈어요', { emoji: '💌', kind: 'good' });
    /* 📲 가족 폰·패드 잠금화면 알림 */
    sendMailboxMessage('letter', { fromName: sender.name, toName: rec.name, text: text, count: pictos.length });
  }

  function sendReply(id, text, emoji) {
    if (!needParent('답장은 부모님 모드에서 보낼 수 있어요')) return;
    var m = S.messages.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    var t = (text || '').trim();
    var input = document.getElementById('replyInput');
    if (!t && input) t = input.value.trim();
    if (!t) { UI.toast('답장 내용을 적어 주세요', { kind: 'warn' }); return; }
    m.replies = m.replies || [];
    m.replies.push({ id: UI.uid('reply'), by: S.actor || '부모님', text: t, emoji: emoji || '💬', ts: Date.now() });
    lastMsgAt = Date.now();
    save();
    render({ keepScroll: true });
    UI.toast('답장을 보냈어요', { emoji: '💬', kind: 'good' });
    /* 📲 가족 폰·패드 잠금화면 알림 */
    sendMailboxMessage('reply', { by: S.actor || '부모님', text: t, emoji: emoji || '💬', toName: m.fromName });
  }

  function readLetter(id) {
    var m = S.messages.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    var from = childById(m.fromId);
    var words = (m.pictos || []).map(function (pid) {
      var p = D.pictograms.filter(function (x) { return x.id === pid; })[0];
      return p ? p.label : '';
    }).filter(Boolean).join(', ');
    var lead = m.hw ? '손글씨 편지예요. ' : '';
    UI.speak(from.name + '이 보낸 편지. ' + lead + (words ? words + '. ' : '') + (m.text || ''));
    UI.toast(m.hw ? '손글씨 편지를 읽어줄게요' : '편지를 읽어줄게요', { emoji: '🔊' });
  }

  /* ================= 식판 · 약 · 성장 ================= */
  function renderHealth() {
    var today = todayKey();
    var c = childById(growthChild);
    var stats = mealStats(14);

    return '<div class="card soft-sun" style="margin-bottom:12px">' +
        '<div class="routine-head">' +
          '<strong style="font-size:15px">🍱 오늘의 식판 메뉴</strong>' +
          '<span style="flex:1"></span>' +
          '<span class="badge ' + (S.mode === 'parent' ? 'mint' : 'lav') + '">' + (S.mode === 'parent' ? '부모님이 기록해요' : '🔒 부모님 모드에서 기록') + '</span>' +
        '</div>' +
        '<p class="help" style="margin:6px 0 8px">메뉴는 두 아이가 같아요. 그릇을 눌러 오늘 음식을 골라 주세요.</p>' +
        trayMenuHTML(today) +
      '</div>' +

      '<div class="duo-grid" style="margin-bottom:12px">' +
        D.children.map(function (k) { return kidMealHTML(k, today); }).join('') +
      '</div>' +

      '<div class="two-col" style="margin-bottom:12px">' +
        '<div class="card">' +
          cardHead('🥗', '재료 통계', '최근 14일') +
          '<p class="help">잘 먹은 재료와 다음에 도전할 음식을 모아 봤어요.</p>' +
          '<div class="ingredient-cloud">' +
            (stats.eaten.length ? stats.eaten.map(function (x) {
              return '<span class="ing-chip">' + esc(x.name) + ' ' + x.count + '번</span>';
            }).join('') : '<span class="help">기록이 쌓이면 여기에 보여요.</span>') +
          '</div>' +
          (stats.challenge.length ? '<p class="help" style="margin-top:12px">다음에 도전!</p><div class="ingredient-cloud">' +
            stats.challenge.map(function (n) { return '<span class="ing-chip warn">' + esc(n) + '</span>'; }).join('') + '</div>' : '') +
          (stats.top.length ? '<p class="help" style="margin-top:12px">자주 나온 메뉴: ' +
            stats.top.map(function (x) { return esc(x.name) + ' ' + x.count + '번'; }).join(' · ') + '</p>' : '') +
        '</div>' +

        '<div class="card">' +
          cardHead('💊', '약 복용 체크', UI.dateKo(today), S.mode === 'parent' ? '<button type="button" class="btn btn-soft btn-sm" data-act="add-med">＋ 약 추가</button>' : '') +
          (S.meds.length ? '<div class="med-list">' + S.meds.map(function (md) {
            var done = !!(S.medLog[today] && S.medLog[today][md.id]);
            var timeLabel = (D.medTimes.filter(function (t) { return t.key === md.time; })[0] || {}).label || '';
            return '<div class="med-item' + (done ? ' done' : '') + '">' +
              '<div class="med-info"><div class="med-name">' + esc(md.name) + '</div>' +
                '<div class="med-meta">' + esc(md.memberName) + ' · ' + esc(timeLabel) + '</div></div>' +
              (done
                ? '<span class="badge mint">먹었어요 ' + UI.timeKo(S.medLog[today][md.id]).replace('오전 ', '').replace('오후 ', '') + '</span>' +
                  '<button type="button" class="icon-btn" data-act="med-undo" data-id="' + md.id + '" aria-label="되돌리기">↩</button>'
                : '<button type="button" class="btn btn-primary btn-sm" data-act="med-check" data-id="' + md.id + '">먹었어요</button>') +
              (S.mode === 'parent' ? '<button type="button" class="icon-btn" data-act="del-med" data-id="' + md.id + '" aria-label="약 삭제">🗑</button>' : '') +
            '</div>';
          }).join('') + '</div>'
            : '<div class="empty"><span class="big">💊</span>등록된 약이 없어요.' + (S.mode === 'parent' ? '<br>‘약 추가’로 등록해 주세요.' : '') + '</div>') +
        '</div>' +
      '</div>' +

      '<div class="card soft-lav">' +
        '<div class="routine-head">' +
          '<strong style="font-size:15px">📏 키 · 몸무게</strong>' +
          D.children.map(function (k) {
            return '<button type="button" class="chip ' + k.color + (k.id === growthChild ? ' active' : '') + '" data-act="pick-growth-child" data-id="' + k.id + '">' +
              k.emoji + ' ' + esc(k.name) + '</button>';
          }).join('') +
          '<span style="flex:1"></span>' +
          '<div class="growth-toggle">' +
            '<button type="button" class="chip' + (growthMetric === 'height' ? ' active' : '') + '" data-act="growth-metric" data-metric="height">키</button>' +
            '<button type="button" class="chip' + (growthMetric === 'weight' ? ' active' : '') + '" data-act="growth-metric" data-metric="weight">몸무게</button>' +
          '</div>' +
          (S.mode === 'parent' ? '<button type="button" class="btn btn-soft btn-sm" data-act="add-growth">＋ 기록</button>' : '') +
        '</div>' +
        growthBlock(c, growthMetric) +
      '</div>';
  }

  /* 오늘의 식판 메뉴 (두 아이 공통) */
  function trayMenuHTML(date) {
    var first = D.children[0].id;
    return '<div class="tray">' + D.traySlots.map(function (slot) {
      var st = slotOf(first, date, slot.key);
      var food = st.dishId ? foodById(st.dishId) : null;
      var area = { rice: 'rice', soup: 'soup', side1: 's1', side2: 's2', side3: 's3' }[slot.key] || 's1';
      return '<div class="tray-slot ' + area + '">' +
        '<span class="slot-label">' + esc(slot.label) + '</span>' +
        '<button type="button" class="dish-btn" data-act="pick-dish" data-slot="' + slot.key + '">' +
          '<span class="dish">' + (food ? food.emoji : '➕') + '</span>' +
          '<span class="dish-name' + (food ? '' : ' none') + '">' + (food ? esc(food.name) : '음식 고르기') + '</span>' +
        '</button>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* 아이 한 명의 먹은 정도 (두 아이 나란히) */
  function kidMealHTML(c, date) {
    var m = mealOf(c.id, date);
    var picked = (m.slots || []).filter(function (s) { return s.dishId; });
    var rows = D.traySlots.map(function (slot) {
      var st = slotOf(c.id, date, slot.key);
      var food = st.dishId ? foodById(st.dishId) : null;
      if (!food) return '';
      return '<div class="mk-row' + (st.level && st.level !== 'none' ? ' eaten' : '') + '">' +
        '<div class="mk-dish"><span>' + food.emoji + '</span>' + esc(food.name) + '</div>' +
        '<div class="level-row">' + D.mealLevels.map(function (lv) {
          var active = st.level === lv.key;
          return '<button type="button" class="level-pill' + (active ? ' active' : '') + '" data-act="set-level" data-child="' + c.id + '" data-slot="' + slot.key + '" data-level="' + lv.key + '">' + esc(lv.label) + '</button>';
        }).join('') + '</div>' +
      '</div>';
    }).filter(Boolean);

    return '<div class="card meal-kid ' + c.color + '">' +
      '<div class="rk-head">' +
        kidAvaHTML(c) +
        '<strong>' + esc(c.name) + '</strong>' +
        '<span class="rk-spacer"></span>' +
        '<span class="badge mint">먹은 음식 ' + picked.length + '가지</span>' +
      '</div>' +
      (rows.length ? rows.join('') : '<div class="empty" style="margin-top:8px"><span class="big">🍽️</span>위에서 오늘 식판 메뉴를 골라 주세요.</div>') +
    '</div>';
  }

  function mealStats(days) {
    var out = { eaten: [], challenge: [], top: [], records: 0 };
    var ingCount = {}, dishCount = {}, badDish = {};
    var from = new Date(); from.setDate(from.getDate() - (days - 1));
    for (var i = 0; i < days; i++) {
      var d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
      var key = UI.dateKey(d);
      var day = S.meals[key];
      if (!day) continue;
      Object.keys(day).forEach(function (childId) {
        (day[childId].slots || []).forEach(function (s) {
          if (!s.dishId) return;
          var f = foodById(s.dishId);
          if (!f) return;
          out.records++;
          var sc = levelInfo(s.level).score;
          if (sc >= 2) {
            dishCount[f.name] = (dishCount[f.name] || 0) + 1;
            f.ingredients.forEach(function (ing) { ingCount[ing] = (ingCount[ing] || 0) + 1; });
          } else {
            badDish[f.name] = true;
          }
        });
      });
    }
    out.eaten = Object.keys(ingCount).map(function (k) { return { name: k, count: ingCount[k] }; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, 8);
    out.top = Object.keys(dishCount).map(function (k) { return { name: k, count: dishCount[k] }; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, 3);
    out.challenge = Object.keys(badDish).filter(function (k) { return !dishCount[k]; }).slice(0, 8);
    return out;
  }

  /* 오늘의 식판 메뉴는 두 아이 공통이라 한 번에 같이 넣습니다 */
  function pickDishModal(slotKey) {
    if (!needParent('식판은 부모님 모드에서 기록할 수 있어요')) return;
    var slot = D.traySlots.filter(function (s) { return s.key === slotKey; })[0];
    var traySlot = slot ? slot.label : '음식';
    UI.modal({
      title: traySlot + ' 고르기',
      size: 'wide',
      bodyHTML: '<p class="help">고른 음식은 민국·이준 식판에 같이 들어가요.</p>' +
        '<div class="picto-grid" style="grid-template-columns:repeat(3,1fr);margin-top:10px">' +
        D.foods.map(function (f) {
          return '<button type="button" class="picto" data-food="' + f.id + '">' +
            '<span class="emoji">' + f.emoji + '</span>' + esc(f.name) + '</button>';
        }).join('') + '</div>' +
        '<div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-clear="1">비우기</button>' +
        '</div>',
      actions: [{ label: '닫기', kind: 'soft' }],
      onOpen: function (wrap, close) {
        wrap.addEventListener('click', function (e) {
          var fb = e.target.closest('[data-food]');
          var clear = e.target.closest('[data-clear]');
          if (!fb && !clear) return;
          var date = todayKey();
          S.meals[date] = S.meals[date] || {};
          D.children.forEach(function (c) {
            S.meals[date][c.id] = S.meals[date][c.id] || { slots: [] };
            var slots = S.meals[date][c.id].slots;
            var cur = slots.filter(function (s) { return s.key === slotKey; })[0];
            if (!cur) { cur = { key: slotKey, dishId: null, level: 'half' }; slots.push(cur); }
            if (clear) {
              cur.dishId = null; cur.level = 'none';
            } else {
              cur.dishId = fb.getAttribute('data-food');
              if (cur.level === 'none') cur.level = 'half';
            }
          });
          save();
          close();
          render({ keepScroll: true });
        });
      }
    });
  }

  function setMealLevel(childId, slotKey, level) {
    if (!needParent('식판은 부모님 모드에서 기록할 수 있어요')) return;
    var date = todayKey();
    var st = slotOf(childId, date, slotKey);
    if (!st.dishId) { UI.toast('먼저 음식을 골라 주세요', { emoji: '🍽️', kind: 'warn' }); return; }
    S.meals[date] = S.meals[date] || {};
    S.meals[date][childId] = S.meals[date][childId] || { slots: [] };
    var slots = S.meals[date][childId].slots;
    var cur = slots.filter(function (s) { return s.key === slotKey; })[0];
    if (!cur) { cur = { key: slotKey, dishId: st.dishId, level: level }; slots.push(cur); }
    cur.level = level;
    save();
    render({ keepScroll: true });
  }

  function addMedModal() {
    if (!needParent()) return;
    UI.modal({
      title: '약 추가',
      bodyHTML: '<div class="field"><label>누구 약인가요?</label><select class="select" id="medMember">' +
          D.children.concat(D.parents).map(function (m) {
            return '<option value="' + m.id + '">' + esc(m.name) + '</option>';
          }).join('') + '</select></div>' +
        '<div class="field"><label>약 이름</label><input class="input" id="medName" placeholder="예: 유산균, 비타민D"></div>' +
        '<div class="field"><label>먹는 때</label><select class="select" id="medTime">' +
          D.medTimes.map(function (t) { return '<option value="' + t.key + '">' + esc(t.label) + '</option>'; }).join('') +
        '</select></div>',
      actions: [
        {
          label: '추가하기', kind: 'primary', onClick: function (close) {
            var name = document.getElementById('medName').value.trim();
            if (!name) { UI.toast('약 이름을 적어 주세요', { kind: 'warn' }); return false; }
            var mid = document.getElementById('medMember').value;
            var who = D.children.concat(D.parents).filter(function (m) { return m.id === mid; })[0];
            S.meds.push({
              id: UI.uid('med'), name: name, memberId: mid, memberName: who ? who.name : '가족',
              time: document.getElementById('medTime').value
            });
            save();
            close();
            render({ keepScroll: true });
            UI.toast('약을 등록했어요', { emoji: '💊', kind: 'good' });
          }
        },
        { label: '취소', kind: 'ghost' }
      ]
    });
  }

  function growthBlock(c, metric) {
    var recs = (S.growth[c.id] || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var unit = metric === 'height' ? 'cm' : 'kg';
    var latest = recs.length ? recs[recs.length - 1] : null;

    var chart = '<div class="empty"><span class="big">📏</span>' + esc(c.name) + '의 기록이 아직 없어요.' +
      (S.mode === 'parent' ? '<br>‘기록’을 눌러 키와 몸무게를 남겨 주세요.' : '') + '</div>';

    if (recs.length) {
      var pts = recs.map(function (r) { return { date: r.date, value: Number(r[metric]) }; })
        .filter(function (p) { return p.value > 0; });
      if (pts.length) chart = growthChart(pts, metric, c.color);
    }

    var rows = recs.slice().reverse().map(function (r) {
      return '<tr><td>' + UI.shortDateKo(r.date) + '</td>' +
        '<td>' + (r.height ? r.height + 'cm' : '-') + '</td>' +
        '<td>' + (r.weight ? r.weight + 'kg' : '-') + '</td>' +
        (S.mode === 'parent' ? '<td><button type="button" class="icon-btn" style="width:24px;height:24px" data-act="del-growth" data-child="' + c.id + '" data-date="' + r.date + '" aria-label="삭제">🗑</button></td>' : '') +
        '</tr>';
    }).join('');

    return '<div class="chart-wrap">' + chart + '</div>' +
      (latest ? '<p class="help" style="margin-top:8px">최근 기록 ' + UI.shortDateKo(latest.date) + ' · ' +
        (latest.height ? latest.height + 'cm' : '') + (latest.weight ? ' / ' + latest.weight + 'kg' : '') + '</p>' : '') +
      (recs.length ? '<table class="growth-table"><thead><tr><th>날짜</th><th>키</th><th>몸무게</th>' +
        (S.mode === 'parent' ? '<th></th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table>' : '');
  }

  function growthChart(pts, metric, color) {
    var W = 640, H = 240, padL = 40, padR = 18, padT = 22, padB = 32;
    var vals = pts.map(function (p) { return p.value; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var span = Math.max(max - min, metric === 'height' ? 8 : 4);
    var lo = Math.max(0, min - span * 0.35), hi = max + span * 0.35;
    var times = pts.map(function (p) { return UI.parseKey(p.date).getTime(); });
    var t0 = Math.min.apply(null, times), t1 = Math.max.apply(null, times);

    function X(i) {
      if (t1 === t0) return padL + (W - padL - padR) / 2;
      return padL + (times[i] - t0) / (t1 - t0) * (W - padL - padR);
    }
    function Y(v) { return padT + (hi - v) / (hi - lo) * (H - padT - padB); }

    var stroke = color === 'coral' ? '#FF977F' : color === 'lav' ? '#9E8FE0' : '#5FBF98';
    var unit = metric === 'height' ? 'cm' : 'kg';
    var grid = '', labels = '';
    for (var g = 0; g <= 3; g++) {
      var v = lo + (hi - lo) * g / 3;
      var y = Y(v);
      grid += '<line class="grid-line" x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '"/>';
      labels += '<text class="axis-text" x="' + (padL - 6) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + Math.round(v) + '</text>';
    }

    var path = '', dots = '', lastLabel = '';
    pts.forEach(function (p, i) {
      var x = X(i), y = Y(p.value);
      path += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      dots += '<circle class="point" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.5" fill="' + stroke + '"/>';
      if (i === pts.length - 1) {
        lastLabel = '<text class="axis-text" x="' + x.toFixed(1) + '" y="' + (y - 11).toFixed(1) + '" text-anchor="middle" style="font-weight:800;fill:' + stroke + '">' +
          p.value + unit + '</text>';
      }
    });

    var xlabels = '';
    var idxs = pts.length === 1 ? [0] : [0, Math.floor((pts.length - 1) / 2), pts.length - 1];
    idxs.filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (i) {
      xlabels += '<text class="axis-text" x="' + X(i).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + UI.shortDateKo(pts[i].date) + '</text>';
    });

    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (metric === 'height' ? '키' : '몸무게') + ' 성장 그래프">' +
      grid + labels +
      (t1 === t0 ? '<line class="grid-line" x1="' + padL + '" y1="' + Y(pts[0].value).toFixed(1) + '" x2="' + (W - padR) + '" y2="' + Y(pts[0].value).toFixed(1) + '" stroke-dasharray="4 4"/>' : '') +
      '<path class="line" d="' + path + '" stroke="' + stroke + '"/>' +
      dots + lastLabel + xlabels +
    '</svg>';
  }

  function addGrowthModal() {
    if (!needParent()) return;
    var c = childById(growthChild);
    var last = (S.growth[c.id] || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).pop();
    UI.modal({
      title: c.name + ' 성장 기록',
      bodyHTML: '<div class="field"><label>날짜</label><input class="input" id="grDate" type="date" value="' + todayKey() + '"></div>' +
        '<div class="field-row">' +
          '<div class="field"><label>키 (cm)</label><input class="input" id="grHeight" type="number" step="0.1" inputmode="decimal" placeholder="' + (last && last.height ? last.height : '128') + '"></div>' +
          '<div class="field"><label>몸무게 (kg)</label><input class="input" id="grWeight" type="number" step="0.1" inputmode="decimal" placeholder="' + (last && last.weight ? last.weight : '27') + '"></div>' +
        '</div>',
      actions: [
        {
          label: '저장', kind: 'primary', onClick: function (close) {
            var date = document.getElementById('grDate').value;
            var h = parseFloat(document.getElementById('grHeight').value);
            var w = parseFloat(document.getElementById('grWeight').value);
            if (!date) { UI.toast('날짜를 골라 주세요', { kind: 'warn' }); return false; }
            if (!h && !w) { UI.toast('키나 몸무게를 적어 주세요', { kind: 'warn' }); return false; }
            S.growth[c.id] = S.growth[c.id] || [];
            var ex = S.growth[c.id].filter(function (r) { return r.date === date; })[0];
            if (ex) { if (h) ex.height = h; if (w) ex.weight = w; }
            else S.growth[c.id].push({ date: date, height: h || null, weight: w || null });
            save();
            close();
            render({ keepScroll: true });
            UI.toast('성장 기록을 저장했어요', { emoji: '📏', kind: 'good' });
          }
        },
        { label: '취소', kind: 'ghost' }
      ]
    });
  }

  /* ================= 설정 ================= */
  function renderSettings() {
    var st = Storage.status;
    var isFb = st.mode === 'firebase';
    var keyId = st.familyId ? (st.familyId.slice(0, 10) + '…' + st.familyId.slice(-4)) : '—';
    var lastSync = st.lastSyncAt ? UI.timeKo(st.lastSyncAt) : '아직 없어요';
    var cfg = Storage.config || {};

    return '<div class="settings-grid">' +

      '<div class="card span-2 soft-lav">' +
        cardHead('🔐', '우리집 입장 코드', '가족만 들어오는 열쇠') +
        '<div class="status-line' + (isFb ? '' : ' local') + '">' +
          (isFb ? '☁️ 가족 클라우드와 실시간으로 연결돼 있어요' : '📱 지금은 이 기기에만 저장하고 있어요') +
        '</div>' +
        '<dl class="key-info">' +
          '<div><dt>가족 열쇠 ID</dt><dd><code>' + esc(keyId) + '</code>' +
            '<button type="button" class="link-btn copy-btn" data-act="copy-key">📋 전체 ID 복사</button>' +
          '</dd></div>' +
          '<div><dt>마지막 동기화</dt><dd>' + esc(lastSync) + '</dd></div>' +
        '</dl>' +
        '<div class="key-full" id="keyFull" hidden>' +
          '<label for="keyFullText">전체 가족 열쇠 ID (상자를 길게 눌러 복사)</label>' +
          '<input class="input" id="keyFullText" readonly value="' + esc(st.familyId || '') + '">' +
        '</div>' +
        (st.error ? '<p class="help err-text">연결 오류: ' + esc(st.error) + '</p>' : '') +
        '<p class="help">같은 코드를 넣은 기기끼리 같은 집(같은 열쇠 ID)으로 연결돼요.<br>코드를 모르는 사람은 우리 가족 데이터가 있는 곳을 찾을 수도, 열어 볼 수도 없어요.</p>' +
        '<div class="code-change">' +
          '<div class="field" style="margin:0"><label>새 가족 입장 코드</label>' +
            '<input class="input" id="newGateCode" type="text" inputmode="text" autocomplete="off" placeholder="4자 이상 (숫자·단어)"></div>' +
          '<button type="button" class="btn btn-lav" data-act="change-code">코드 바꾸기</button>' +
        '</div>' +
        '<div class="btn-row">' +
          '<button type="button" class="btn btn-ghost" data-act="lock-device">🔒 이 기기 잠그기 (로그아웃)</button>' +
          (isFb ? '' : '<button type="button" class="btn btn-soft" data-act="fb-retry">☁️ 클라우드 다시 연결</button>') +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        cardHead('💾', '저장 방식', isFb ? 'Firebase 실시간 동기화' : '이 기기 저장') +
        '<p class="help">가족 데이터는 우리 가족 Firebase(' + esc(st.projectId || 'family-dashboard') + ') 한 곳에 모여 있어요.<br>' +
        '태블릿·엄마 폰·아빠 폰이 같은 열쇠로 들어오면 바뀐 내용이 몇 초 안에 서로에게 나타나요.<br>' +
        '잠깐 인터넷이 끊겨도 이 기기에 먼저 저장했다가 다시 연결되면 올려 보내요.</p>' +
        '<details class="more"><summary>고급: Firebase 설정 직접 바꾸기</summary>' +
          '<p class="help">보통은 건드릴 필요 없어요. 프로젝트를 옮길 때만 쓰세요.</p>' +
          '<div class="field"><label>apiKey</label><input class="input" id="fbApiKey" value="' + esc(cfg.apiKey || '') + '"></div>' +
          '<div class="field"><label>authDomain</label><input class="input" id="fbAuthDomain" value="' + esc(cfg.authDomain || '') + '"></div>' +
          '<div class="field"><label>projectId</label><input class="input" id="fbProjectId" value="' + esc(cfg.projectId || '') + '"></div>' +
          '<div class="field"><label>appId</label><input class="input" id="fbAppId" value="' + esc(cfg.appId || '') + '"></div>' +
          '<button type="button" class="btn btn-soft btn-sm" data-act="fb-connect">이 설정으로 연결</button>' +
        '</details>' +
      '</div>' +

      '<div class="card">' +
        cardHead('🧭', '기기 잠금 안내', 'Public 저장소에 올라가는 앱') +
        '<p class="help">앱 코드는 GitHub에 공개돼 있지만, 가족 데이터는 코드에 없어요.<br>' +
        '가족 데이터는 <b>입장 코드로 만든 열쇠 ID</b>의 문서에만 들어 있고, 그 코드는 이 기기들에만 있어요.<br>' +
        '태블릿을 잃어버리면 다른 기기에서 <b>코드를 바꾸기</b>만 해도 이전 열쇠로는 더 이상 들어올 수 없어요.</p>' +
        '<p class="help" style="margin-top:8px">집 주소·전화번호·이메일·생년월일 같은 정보는 앱에 넣지 마세요. 이름과 아이 키·몸무게만 기록해요.</p>' +
      '</div>' +

      '<div class="card">' +
        cardHead('🔔', '알림 · 소리', '메시지가 오면 알려 주는 방법') +
        '<div class="toggle-list">' +
          alertToggleHTML('sound', '🔔', '알림 소리', '새 편지·태블릿 메시지가 오면 딩동') +
          alertToggleHTML('speak', '🗣️', '소리 내어 읽기', '받은 메시지를 한국어로 읽어 줘요') +
          alertToggleHTML('push', '📱', '브라우저 알림', '화면 밖에서도 알림 (권한 허용 필요)') +
        '</div>' +
        '<div class="field" style="margin-top:12px"><label>이 기기 이름</label>' +
          '<input class="input" id="deviceName" value="' + esc(deviceName()) + '" maxlength="20" placeholder="예: 거실 태블릿, 엄마 폰">' +
          '<p class="help">태블릿 메시지를 확인하면 이 이름이 부모님 화면에 보여요.</p>' +
        '</div>' +
        '<button type="button" class="btn btn-soft btn-sm" data-act="alert-test">🔔 알림 미리 듣기</button>' +
      '</div>' +

      ntfyCardHTML() +

      '<div class="card">' +
        cardHead('🎛️', '새 기능 관리', '등교 시작 · 정리시간 · 포켓몬') +
        '<p class="help">등교 시각과 등교 준비 항목, 정리시간 버튼·보상·노래, 포켓몬 레벨업 별을 여기서 바로 고쳐요.<br>' +
        '저장하면 <b>아이 태블릿에도 새로고침 없이</b> 바로 보여요.</p>' +
        '<div class="admin-grid">' +
          '<button type="button" class="admin-btn" data-act="school-settings"><span>🌅</span><b>등교 시작 설정</b><small>' + esc(S.schoolTime) + ' · 준비 ' + schoolItems(D.children[0].id).length + '개</small></button>' +
          '<button type="button" class="admin-btn" data-act="tidy-settings"><span>🧹</span><b>정리시간 설정</b><small>' + ((S.tidyCfg && S.tidyCfg.mins) || [5, 10, 15]).join('·') + '분 · 별 ' + tidyReward(true) + '개</small></button>' +
          '<button type="button" class="admin-btn" data-act="pk-settings"><span>⚡</span><b>포켓몬 관리</b><small>별 ' + pkPerLevel() + '개 = 진화 1단계</small></button>' +
          '<button type="button" class="admin-btn" data-act="edit-routines"><span>✅</span><b>아침·저녁 할 일</b><small>할 일 탭에서 바로 고치기</small></button>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        cardHead('🧰', '데이터 관리', '내보내기 · 가져오기') +
        '<p class="help">기기를 바꾸거나 백업할 때 써요.</p>' +
        '<div class="btn-row">' +
          '<button type="button" class="btn btn-soft" data-act="export">내보내기 (JSON)</button>' +
          '<button type="button" class="btn btn-soft" data-act="import">가져오기</button>' +
          '<button type="button" class="btn btn-danger" data-act="reset">전체 초기화</button>' +
        '</div>' +
        '<input type="file" id="importFile" accept="application/json,.json" hidden>' +
      '</div>' +

      '<div class="card span-2">' +
        cardHead('🏡', '우리집 다모아', '가족 대시보드 v2') +
        '<p class="help">아이 루틴 · 칭찬하기 · 가족 일정 · 우체통 · 식판/약/성장 기록을 한 곳에 모은 웹앱이에요.<br>' +
        '모드: ' + (S.mode === 'parent' ? '🔒 부모님 모드(' + esc(S.actor || '부모님') + ')' : '🧒 아이 모드') + ' · 연결: ' + (isFb ? '가족 클라우드' : '이 기기') + '</p>' +
        '<p class="help" style="margin-top:8px">앱 주소: ' + esc(location.origin + location.pathname) + '</p>' +
      '</div>' +
    '</div>';
  }

  /* ---- 가족 입장 코드: 변경 / 이 기기 잠금 / 클라우드 재연결 ---- */
  /* ---- 가족 열쇠 ID 전체 복사 ---- */
  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (e) { return false; }
  }

  function showFullKey() {
    var box = document.getElementById('keyFull');
    var input = document.getElementById('keyFullText');
    if (box) box.hidden = false;
    return input;
  }

  function copyFamilyId() {
    var id = Storage.familyId();
    if (!id) {
      UI.toast('아직 가족 열쇠가 없어요. 입장 코드를 먼저 넣어 주세요', { kind: 'warn' });
      return;
    }
    var input = showFullKey();
    var okToast = function () {
      UI.toast('가족 열쇠 ID 전체를 복사했어요', { emoji: '📋', kind: 'good', duration: 2600 });
    };
    var fail = function () {
      if (input) { try { input.focus(); input.select(); } catch (e) {} }
      UI.toast('자동 복사가 안 됐어요. 아래 전체 ID 상자를 길게 눌러 복사해 주세요', { kind: 'warn', duration: 4500 });
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(id).then(okToast).catch(function () {
        if (legacyCopy(id)) okToast(); else fail();
      });
    } else if (legacyCopy(id)) {
      okToast();
    } else {
      fail();
    }
  }

  function changeGateCode() {
    var input = document.getElementById('newGateCode');
    var code = ((input && input.value) || '').trim();
    if (code.replace(/\s+/g, '').length < Storage.MIN_CODE_LEN) {
      UI.toast('가족 입장 코드는 4자 이상으로 정해 주세요', { kind: 'warn' });
      if (input) input.focus();
      return;
    }
    UI.modal({
      title: '가족 입장 코드를 바꿀까요?',
      bodyHTML: '<p class="modal-text">코드를 바꾸면 <b>새 열쇠</b>가 만들어져요. 태블릿·가족 폰에는 <b>새 코드를 똑같이</b> 넣어 주셔야 다시 연결됩니다.<br><br>지금 기록은 어떻게 할까요?</p>',
      actions: [
        { label: '지금 기록 그대로 옮기기', kind: 'primary', onClick: function () { doChangeCode(code, true); } },
        { label: '빈 집으로 새로 시작', kind: 'ghost', onClick: function () { doChangeCode(code, false); } }
      ]
    });
  }

  function doChangeCode(code, migrate) {
    UI.toast('새 열쇠로 연결하는 중...', { emoji: '🔄', duration: 2200 });
    Storage.changeCode(code).then(function () {
      if (migrate) {
        Storage.save(S, { immediate: true });
      } else {
        S = defaultState();
        S.introSeen = true;
        Storage.save(S, { immediate: true });
      }
      setSyncBanner(null);
      render({ keepScroll: true });
      UI.confetti(18);
      UI.toast('가족 입장 코드를 바꿨어요. 다른 기기에도 새 코드를 넣어 주세요', { emoji: '🔑', kind: 'good', duration: 4200 });
    }).catch(function (err) {
      UI.toast('코드를 바꾸지 못했어요: ' + shortErr(err), { kind: 'warn', duration: 5000 });
    });
  }

  function lockDevice() {
    var isFb = Storage.mode === 'firebase';
    UI.confirm(
      '이 기기를 잠글까요?',
      isFb
        ? '이 기기에서 가족 열쇠를 지우고 저장된 기록도 지웁니다. 클라우드에 있는 가족 기록은 그대로 남아요. 다시 들어오려면 가족 입장 코드가 필요해요.'
        : '이 기기에서 가족 열쇠를 지우고 저장된 기록도 지웁니다. 아직 클라우드에 올리지 못한 기록은 사라져요.',
      '잠그기', 'danger'
    ).then(function (ok) {
      if (!ok) return;
      Storage.lock({ clearLocal: true });
      location.reload();
    });
  }

  function retryCloud() {
    UI.toast('가족 클라우드에 다시 연결하는 중...', { emoji: '🔄', duration: 2200 });
    Storage.init(onRemoteState).then(function (res) {
      if (res.mode === 'firebase') {
        setSyncBanner(null);
        S = normalize(res.state);
        render({ keepScroll: true });
        UI.toast('가족 클라우드에 연결됐어요', { emoji: '☁️', kind: 'good', duration: 3000 });
      } else {
        setSyncBanner(res.error || '연결 정보를 확인해 주세요');
        render({ keepScroll: true });
      }
    });
  }

  function shortErr(err) {
    var t = (err && (err.message || err.code)) || String(err || '알 수 없는 오류');
    return t.length > 120 ? t.slice(0, 120) + '…' : t;
  }

  function setSyncBanner(err) {
    var el = document.getElementById('syncBanner');
    var txt = document.getElementById('syncBannerText');
    if (!el || !txt) return;
    if (!err) { el.hidden = true; txt.textContent = ''; return; }
    txt.textContent = '☁️ 가족 클라우드에 연결하지 못했어요 — 지금 기록은 이 기기에만 저장돼요. (' + shortErr(err) + ')';
    el.hidden = false;
  }

  /* =========================================================
     🌅 등교 시작 모드 (오전 8:30 기준 남은 시간)
     ---------------------------------------------------------
     · '등교 시작' 버튼 → 화면 전체가 등교 준비 모드로 열립니다.
     · 오늘 등교 시간(기본 08:30)까지 남은 시간 + 남은 시간 막대 + 준비 체크리스트.
     · 체크리스트는 그 아이의 '아침 할 일'과 그대로 연동되고, 하나 누를 때 별 1개,
       아침 할 일을 다 끝내면 하루 한 번 보너스 별 2개를 더 줍니다.
     ========================================================= */
  function hhmmOk(v) {
    return typeof v === 'string' && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
  }
  function clampNum(v, min, max, dflt) {
    var n = Number(v);
    if (!isFinite(n)) return dflt;
    n = Math.round(n);
    return Math.max(min, Math.min(max, n));
  }
  /* 부모님이 바꾼 설정은 바로 클라우드에 올려 아이 태블릿에도 바로 보이게 */
  function saveNow() {
    pruneHandwriting();
    Storage.save(S, { immediate: true });
  }
  function hhmmMin(v, fallback) {
    if (!hhmmOk(v)) return fallback;
    var p = v.split(':');
    return Number(p[0]) * 60 + Number(p[1]);
  }
  function minHHMM(m) {
    m = ((Math.round(m) % 1440) + 1440) % 1440;
    return UI.pad(Math.floor(m / 60)) + ':' + UI.pad(m % 60);
  }
  function schoolTargetMin() { return hhmmMin(S.schoolTime, hhmmMin(D.school && D.school.targetTime, 510)); }
  function schoolStartMin() {
    var t = schoolTargetMin();
    var st = hhmmMin(S.schoolStart, null);
    if (st == null || st >= t) st = t - 90;
    return Math.max(0, st);
  }
  /* 오늘 등교 시간까지 남은 ms (이미 지났으면 음수) */
  function msLeftToSchool() {
    var now = new Date();
    var tm = schoolTargetMin();
    var target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(tm / 60), tm % 60, 0, 0);
    return target.getTime() - now.getTime();
  }
  function clockText(ms) {
    var total = Math.floor(Math.max(0, ms) / 1000);
    var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return h > 0 ? h + ':' + UI.pad(m) + ':' + UI.pad(s) : UI.pad(m) + ':' + UI.pad(s);
  }
  function leftText(ms) {
    var total = Math.floor(Math.max(0, ms) / 1000);
    var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    if (h > 0) return h + '시간 ' + m + '분 남았어요';
    if (m > 0) return m + '분 ' + s + '초 남았어요';
    return s + '초 남았어요';
  }

  var schoolInt = null;
  function schoolLayer() {
    var el = document.getElementById('schoolLayer');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'schoolLayer';
    el.className = 'sc-layer';
    el.hidden = true;
    el.addEventListener('click', onSchoolClick);
    document.body.appendChild(el);
    return el;
  }
  /* 등교 준비 체크 = 그 아이의 아침 할 일 (기본값 4개, 부모님이 직접 고쳐요) */
  function schoolItems(childId) {
    return routineItems(childId).morning.slice();
  }
  function schoolAllDone(childId) {
    var today = todayKey();
    var morning = schoolItems(childId);
    return morning.length > 0 && morning.every(function (i) { return isDone(i.id, today); });
  }
  function schoolBonusGiven(childId) {
    var t = todayKey();
    return !!(S.schoolBonus && S.schoolBonus[t] && S.schoolBonus[t][childId]);
  }
  /* 아침 할 일을 다 끝냈으면 하루 한 번 보너스 별 */
  function schoolRewardStars() {
    return clampNum(S.schoolReward, 0, 20, 2);
  }
  function grantSchoolBonus(childId) {
    if (!schoolAllDone(childId) || schoolBonusGiven(childId)) return false;
    var t = todayKey();
    S.schoolBonus = S.schoolBonus || {};
    S.schoolBonus[t] = S.schoolBonus[t] || {};
    S.schoolBonus[t][childId] = 1;
    S.stars[childId] = (S.stars[childId] || 0) + schoolRewardStars();
    save();
    return true;
  }
  function schoolKidHTML(c) {
    var today = todayKey();
    var morning = schoolItems(c.id);
    var done = morning.filter(function (i) { return isDone(i.id, today); }).length;
    var all = morning.length > 0 && done >= morning.length;
    var steps = morning.map(function (i) {
      var d = isDone(i.id, today);
      return '<button type="button" class="sc-step' + (d ? ' done' : '') + '" data-sch="step" data-child="' + c.id + '" data-item="' + esc(i.id) + '" aria-pressed="' + (d ? 'true' : 'false') + '">' +
          '<span class="sc-emoji" aria-hidden="true">' + esc(i.emoji || '⭐') + '</span>' +
          '<span class="sc-label">' + esc(i.label) + '</span>' +
          '<span class="sc-tick" aria-hidden="true">' + (d ? '✓' : '') + '</span>' +
        '</button>';
    }).join('');
    return '<div class="sc-kid ' + c.color + (all ? ' all' : '') + '">' +
      '<div class="sc-kid-head">' +
        kidAvaHTML(c) +
        '<b>' + esc(c.name) + '</b>' +
        '<span class="sc-kid-cnt">' + done + '/' + morning.length + '</span>' +
      '</div>' +
      '<div class="sc-steps">' +
        (steps || '<p class="help">아침 할 일이 없어요. 부모님 모드에서 추가해 주세요.</p>') +
      '</div>' +
      (all ? '<div class="sc-kid-done">🎉 다 챙겼어요! ' + (schoolBonusGiven(c.id) ? '보너스 별 ' + schoolRewardStars() + '개 받았어요 ⭐' : '보너스 별이 기다려요') + '</div>' : '') +
    '</div>';
  }
  function schoolPanelHTML() {
    var bothDone = D.children.every(function (c) { return schoolAllDone(c.id); });
    return '<div class="sc-panel" role="dialog" aria-modal="true" aria-label="등교 시작 모드">' +
      '<div class="sc-head">' +
        '<span class="sc-head-ico" aria-hidden="true">🌅</span>' +
        '<div class="sc-head-txt"><b>등교 시작</b><small>' + esc(S.schoolTime) + '까지 준비해요</small></div>' +
        '<button type="button" class="sc-x" data-sch="close" aria-label="닫기">✕</button>' +
      '</div>' +
      '<div class="sc-clock">' +
        '<div class="sc-big" id="scBig">--:--</div>' +
        '<div class="sc-sub" id="scSub">남았어요</div>' +
        '<div class="sc-bar"><i id="scBar" style="width:100%"></i></div>' +
        '<p class="sc-note" id="scNote"></p>' +
      '</div>' +
      '<div class="sc-kids">' + D.children.map(schoolKidHTML).join('') + '</div>' +
      '<div class="sc-foot">' +
        (S.mode === 'parent' ? '<button type="button" class="btn btn-ghost btn-sm" data-sch="settings">⚙️ 등교 설정</button>' : '') +
        '<button type="button" class="btn btn-primary" data-sch="close">학교 가자! 🎒</button>' +
      '</div>' +
      (bothDone ? '<div class="sc-all">🎉 오늘 등교 준비 끝! 정말 잘했어요</div>' : '') +
    '</div>';
  }
  function paintSchool(full) {
    var el = schoolLayer();
    if (!el || el.hidden) return;

    /* 아침 할 일을 다 끝낸 아이에게 보너스 별 (하루 한 번) */
    var granted = [];
    D.children.forEach(function (c) { if (grantSchoolBonus(c.id)) granted.push(c.id); });
    if (granted.length) {
      UI.confetti(40);
      chime();
      UI.toast(granted.map(function (id) { return childById(id).name; }).join('·') + ' 등교 준비 완료! 보너스 별 ' + schoolRewardStars() + '개 ⭐', { emoji: '🎉', kind: 'good', duration: 3800 });
      render({ keepScroll: true });
    }

    if (full || !el.querySelector('.sc-panel')) el.innerHTML = schoolPanelHTML();

    var ms = msLeftToSchool();
    var big = el.querySelector('#scBig');
    var sub = el.querySelector('#scSub');
    var bar = el.querySelector('#scBar');
    var note = el.querySelector('#scNote');
    var winMs = Math.max(60000, (schoolTargetMin() - schoolStartMin()) * 60000);
    var pct = ms <= 0 ? 0 : Math.max(0, Math.min(100, (ms / winMs) * 100));
    if (big) big.textContent = clockText(ms);
    if (sub) sub.textContent = ms > 0 ? leftText(ms) : (S.schoolTime + '이 지났어요!');
    if (bar) {
      bar.style.width = pct + '%';
      bar.className = ms <= 0 ? 'over' : (pct < 20 ? 'soon' : '');
    }
    if (note) {
      if (ms <= 0) {
        note.textContent = S.schoolTime + '이 지났어요! 그래도 준비는 할 수 있어요. 하나씩 차근차근 😊';
      } else if (pct < 20) {
        note.textContent = '거의 다 왔어요! 얼른 챙기고 나가요 🏃';
      } else {
        note.textContent = '남은 시간이 줄어들수록 막대도 줄어들어요. 하나 누를 때마다 별 ⭐ 1개!';
      }
    }
  }
  function openSchoolMode() {
    closeTidyMode();
    var el = schoolLayer();
    el.hidden = false;
    document.body.classList.add('modal-open');
    paintSchool(true);
    clearInterval(schoolInt);
    schoolInt = setInterval(function () { paintSchool(false); }, 1000);
  }
  function closeSchoolMode() {
    clearInterval(schoolInt); schoolInt = null;
    var el = document.getElementById('schoolLayer');
    if (el) el.hidden = true;
    if (!document.querySelector('.modal-wrap')) document.body.classList.remove('modal-open');
  }
  function onSchoolClick(e) {
    var b = e.target.closest('[data-sch]');
    if (!b) return;
    var act = b.getAttribute('data-sch');
    if (act === 'close') { closeSchoolMode(); return; }
    if (act === 'settings') { schoolSettingsModal(); return; }
    if (act === 'step') { schoolStep(b.getAttribute('data-child'), b.getAttribute('data-item')); return; }
  }
  function schoolStep(childId, itemId) {
    var today = todayKey();
    if (isDone(itemId, today)) {
      if (S.mode === 'parent') { undoRoutine(childId, itemId); paintSchool(true); }
      else UI.toast('이미 끝냈어요! ✓', { emoji: '✅', duration: 1300 });
      return;
    }
    completeRoutine(childId, itemId);   // 별 1개 + 저장 + 화면 갱신
    chime();
    paintSchool(true);
  }
  /* =========================================================
     🧹 정리시간 모드 (5 / 10 / 15분)
     ---------------------------------------------------------
     · 5·10·15분 버튼 → 바로 집중 타이머 화면.
     · 남은 시간 막대가 줄어들고, 신나는 동요 멜로디를 Web Audio로 직접 연주합니다
       (외부 음원 링크를 쓰지 않아 끊기지 않아요. 음소거·일시정지 토글 있음).
     · '정리 끝!'을 누르면 별 보상(시간 안에 끝내면 별 3개, 시간이 지나면 별 1개).
     ========================================================= */
  var tidy = null;
  var tidyInt = null;

  function tidyReward(inTime) {
    var c = (S && S.tidyCfg) || {};
    return clampNum(inTime ? c.reward : c.rewardLate, 0, 20, inTime ? 3 : 1);
  }

  var TM = { ctx: null, master: null, timer: null, playing: false, muted: false, paused: false };
  var TM_BEAT = 0.34;
  var TM_NOTES = [
    [523.25, 1], [523.25, 1], [783.99, 1], [783.99, 1], [880, 1], [880, 1], [783.99, 2],
    [698.46, 1], [698.46, 1], [659.25, 1], [659.25, 1], [587.33, 1], [587.33, 1], [523.25, 2],
    [783.99, 1], [783.99, 1], [698.46, 1], [698.46, 1], [659.25, 1], [659.25, 1], [587.33, 2],
    [783.99, 1], [783.99, 1], [698.46, 1], [698.46, 1], [659.25, 1], [659.25, 1], [587.33, 2],
    [523.25, 1], [523.25, 1], [783.99, 1], [783.99, 1], [880, 1], [880, 1], [783.99, 2],
    [698.46, 1], [698.46, 1], [659.25, 1], [659.25, 1], [587.33, 1], [587.33, 1], [523.25, 2]
  ];
  var TM_BASS = [130.81, 174.61, 130.81, 174.61, 130.81, 174.61];
  function tmBeats() {
    var n = 0;
    TM_NOTES.forEach(function (x) { n += x[1]; });
    return n;
  }
  function tmPlayNote(freq, start, dur, type, vol) {
    var ctx = TM.ctx;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), start + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(TM.master);
    o.start(start);
    o.stop(start + dur + 0.03);
  }
  function tmScheduleLoop() {
    if (!TM.ctx || !TM.playing || TM.paused) return;
    var t = TM.ctx.currentTime + 0.1;
    var beat = TM_BEAT;
    TM_NOTES.forEach(function (n) {
      var dur = n[1] * beat;
      tmPlayNote(n[0], t, Math.max(0.12, dur * 0.86), 'triangle', 0.16);
      tmPlayNote(n[0] * 2, t, Math.max(0.1, dur * 0.5), 'sine', 0.05);
      t += dur;
    });
    /* 저음 베이스: 한 마디(8박)마다 */
    var barLen = 8 * beat;
    var total = tmBeats() * beat;
    for (var i = 0; i * barLen < total; i++) {
      var f = TM_BASS[i % TM_BASS.length];
      var st = TM.ctx.currentTime + 0.1 + i * barLen;
      tmPlayNote(f, st, barLen * 0.5, 'sine', 0.12);
      tmPlayNote(f * 1.5, st + barLen * 0.5, barLen * 0.4, 'sine', 0.09);
    }
  }
  function tmStart() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { TM.ctx = TM.ctx || new AC(); } catch (e) { return; }
    if (!TM.ctx) return;
    try { if (TM.ctx.state === 'suspended') TM.ctx.resume(); } catch (e) {}
    if (!TM.master) {
      TM.master = TM.ctx.createGain();
      TM.master.connect(TM.ctx.destination);
    }
    TM.master.gain.value = TM.muted ? 0 : 0.5;
    TM.playing = true;
    TM.paused = false;
    tmScheduleLoop();
    clearInterval(TM.timer);
    var loopMs = Math.round(tmBeats() * TM_BEAT * 1000) - 80;
    TM.timer = setInterval(tmScheduleLoop, Math.max(1000, loopMs));
  }
  function tmStop() {
    clearInterval(TM.timer); TM.timer = null;
    TM.playing = false;
    TM.paused = false;
    if (TM.master) { try { TM.master.gain.value = 0; } catch (e) {} }
    if (TM.ctx) { try { TM.ctx.suspend(); } catch (e) {} }
  }
  function tmToggleMute() {
    TM.muted = !TM.muted;
    if (TM.master) TM.master.gain.value = TM.muted ? 0 : 0.5;
    UI.toast(TM.muted ? '음악을 껐어요 🔇' : '음악을 켰어요 🔊', { emoji: '🎵', duration: 1400 });
    paintTidy(true);
  }
  function tmTogglePause() {
    if (!TM.playing) { tmStart(); paintTidy(true); return; }
    TM.paused = !TM.paused;
    if (TM.paused) {
      clearInterval(TM.timer); TM.timer = null;
      if (TM.ctx) { try { TM.ctx.suspend(); } catch (e) {} }
    } else {
      try { if (TM.ctx && TM.ctx.state === 'suspended') TM.ctx.resume(); } catch (e) {}
      tmScheduleLoop();
      var loopMs = Math.round(tmBeats() * TM_BEAT * 1000) - 80;
      clearInterval(TM.timer);
      TM.timer = setInterval(tmScheduleLoop, Math.max(1000, loopMs));
    }
    paintTidy(true);
  }

  function tidyLayer() {
    var el = document.getElementById('tidyLayer');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'tidyLayer';
    el.className = 'td-layer';
    el.hidden = true;
    el.addEventListener('click', onTidyClick);
    document.body.appendChild(el);
    return el;
  }
  function tidyPanelHTML() {
    var who = tidy.childId;
    var chips = D.children.map(function (c) {
      return '<button type="button" class="chip ' + c.color + (who === c.id ? ' active' : '') + '" data-td="who" data-id="' + c.id + '">' + c.emoji + ' ' + esc(c.name) + '</button>';
    }).join('') + '<button type="button" class="chip' + (who === 'family' ? ' active' : '') + '" data-td="who" data-id="family">👪 가족 모두</button>';
    var reward = tidy.endsAt - Date.now() > 0 ? tidyReward(true) : tidyReward(false);
    return '<div class="td-panel" role="dialog" aria-modal="true" aria-label="정리시간">' +
      '<div class="td-head">' +
        '<span class="td-ico" aria-hidden="true">🧹</span>' +
        '<div class="td-head-txt"><b>정리시간</b><small>' + tidy.minutes + '분 동안 힘내요!</small></div>' +
        '<button type="button" class="sc-x" data-td="close" aria-label="그만하기">✕</button>' +
      '</div>' +
      '<div class="td-who">누가 정리할까요? <span class="td-who-chips">' + chips + '</span></div>' +
      '<div class="td-time" id="tdBig">--:--</div>' +
      '<div class="td-bar"><i id="tdBar" style="width:100%"></i></div>' +
      '<p class="td-note" id="tdNote">🎵 노래가 나와요! 신나게 정리해요</p>' +
      '<div class="td-actions">' +
        '<button type="button" class="td-mini" data-td="music" aria-label="음악 켜기/끄기">' + (TM.muted ? '🔇' : '🔊') + '</button>' +
        '<button type="button" class="td-mini" data-td="pause" aria-label="음악 멈춤">' + (TM.paused ? '▶️' : '⏸️') + '</button>' +
        '<button type="button" class="btn btn-primary td-finish" data-td="finish">정리 끝! 🎉 <span id="tdReward">별 ' + reward + '개</span></button>' +
      '</div>' +
    '</div>';
  }
  function paintTidy(full) {
    var el = tidyLayer();
    if (!el || el.hidden || !tidy) return;
    if (full || !el.querySelector('.td-panel')) el.innerHTML = tidyPanelHTML();
    var left = Math.max(0, tidy.endsAt - Date.now());
    var big = el.querySelector('#tdBig');
    var bar = el.querySelector('#tdBar');
    var note = el.querySelector('#tdNote');
    var rew = el.querySelector('#tdReward');
    var total = tidy.minutes * 60000;
    var pct = Math.max(0, Math.min(100, (left / total) * 100));
    if (big) big.textContent = clockText(left);
    if (bar) {
      bar.style.width = pct + '%';
      bar.className = pct < 20 ? 'soon' : '';
    }
    if (note) {
      note.textContent = left > 0
        ? '🎵 노래가 나와요! 신나게 정리해요'
        : '⏰ 시간이 다 됐어요! 정리를 마무리하고 [정리 끝!]을 눌러요';
    }
    if (rew) rew.textContent = '별 ' + (left > 0 ? tidyReward(true) : tidyReward(false)) + '개';
  }
  function startTidy(minutes, childId) {
    minutes = Number(minutes) || 10;
    if (minutes < 1 || minutes > 60) minutes = 10;
    closeSchoolMode();
    tidy = { minutes: minutes, endsAt: Date.now() + minutes * 60000, childId: childId || routineChild || D.children[0].id };
    var el = tidyLayer();
    el.hidden = false;
    document.body.classList.add('modal-open');
    TM.muted = !(S.tidyCfg && S.tidyCfg.music !== false); TM.paused = false;
    paintTidy(true);
    tmStart();
    clearInterval(tidyInt);
    tidyInt = setInterval(function () { paintTidy(false); }, 500);
  }
  function closeTidyMode() {
    clearInterval(tidyInt); tidyInt = null;
    tmStop();
    tidy = null;
    var el = document.getElementById('tidyLayer');
    if (el) el.hidden = true;
    if (!document.querySelector('.modal-wrap')) {
      var sc = document.getElementById('schoolLayer');
      if (!sc || sc.hidden) document.body.classList.remove('modal-open');
    }
  }
  function onTidyClick(e) {
    var b = e.target.closest('[data-td]');
    if (!b || !tidy) return;
    var act = b.getAttribute('data-td');
    if (act === 'close') { closeTidyMode(); return; }
    if (act === 'music') { tmToggleMute(); return; }
    if (act === 'pause') { tmTogglePause(); return; }
    if (act === 'who') { tidy.childId = b.getAttribute('data-id') || D.children[0].id; paintTidy(true); return; }
    if (act === 'finish') { finishTidy(); return; }
  }
  function finishTidy() {
    if (!tidy) return;
    var left = tidy.endsAt - Date.now();
    var totalMs = tidy.minutes * 60000;
    var elapsed = totalMs - Math.max(0, left);
    var inTime = left > 0;
    var per = tidyReward(inTime);
    /* 너무 빨리(전체 시간의 1/3도 안 되게) 끝내면 한 번만 막고, 별을 적게 줘서
       시작→끝 버튼만 누르는 식으로 별을 모으지 못하게 합니다 */
    var quick = elapsed < totalMs * 0.33;
    if (quick) per = Math.min(per, 1);
    var ids = tidy.childId === 'family' ? D.children.map(function (c) { return c.id; }) : [tidy.childId];
    ids.forEach(function (id) { S.stars[id] = (S.stars[id] || 0) + per; });
    var who = tidy.childId === 'family' ? '가족 모두' : childById(tidy.childId).name;
    save();
    closeTidyMode();
    render({ keepScroll: true });
    UI.confetti(inTime ? 52 : 24);
    chime();
    UI.toast((quick ? '정말 빨랐어요! ' : inTime ? '시간 안에 정리 끝! ' : '정리 끝! ') + who + ' 별 ' + per + '개 ⭐', { emoji: inTime ? '🎉' : '👏', kind: 'good', duration: 3600 });
    pushToPhones('🧹 정리 끝!', who + (inTime ? '가 시간 안에 정리를 마쳤어요! 별 ' : ' 정리를 마무리했어요! 별 ') + per + '개 ⭐');
  }

  /* =========================================================
     ✍️ 우체통 손글씨 편지 (스티커 아님 · 진짜 손글씨)
     ---------------------------------------------------------
     · 캔버스에 손가락/마우스로 쓰고, 색·굵기·지우개·처음부터를 고를 수 있어요.
     · 보내면 그림(이미지)으로 가족방에 저장되고 잠금화면 알림도 갑니다.
     · 그림은 JPEG로 작게 압축하고, 문서가 너무 무거워지면 오래된 그림부터 정리합니다.
     ========================================================= */
  var HW_W = 900, HW_H = 560;
  var HW = { draft: null, dctx: null, ink: false, color: '#4A3F35', size: 7, eraser: false, bound: false, op: false, last: null };
  var HW_COLORS = ['#4A3F35', '#E2554B', '#2F8F5B', '#2F7BC4', '#8A5BD0', '#E27AA8'];
  var HW_SIZES = [{ v: 5, label: '얇게' }, { v: 9, label: '보통' }, { v: 16, label: '굵게' }];
  var HW_LIMIT = 480000;   // 손글씨 그림 전체 길이 상한(글자 수)

  function hwEnsure() {
    if (HW.draft) return HW.draft;
    var c = document.createElement('canvas');
    c.width = HW_W; c.height = HW_H;
    var g = c.getContext('2d');
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, HW_W, HW_H);
    HW.draft = c; HW.dctx = g; HW.ink = false;
    return c;
  }
  function hwReset() {
    hwEnsure();
    HW.dctx.fillStyle = '#FFFFFF';
    HW.dctx.fillRect(0, 0, HW_W, HW_H);
    HW.ink = false;
    HW.last = null;
    hwMount();
  }
  function hwMount() {
    var cv = document.getElementById('hwCanvas');
    if (!cv) return;
    hwEnsure();
    var wrap = cv.parentNode;
    var cssW = Math.max(240, Math.floor(cv.getBoundingClientRect().width || (wrap && wrap.clientWidth) || 320));
    var cssH = Math.round(cssW * HW_H / HW_W);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssW, cssH);
    g.drawImage(HW.draft, 0, 0, cssW, cssH);
    cv.__cssW = cssW; cv.__cssH = cssH;
    hwRefreshHint();
    if (cv.__bound) return;
    cv.__bound = true;

    function norm(ev) {
      var r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
    }
    function drawDot(p) {
      var r = cv.getBoundingClientRect();
      var col = HW.eraser ? '#FFFFFF' : HW.color;
      var wCss = HW.eraser ? HW.size * 3 : HW.size;
      var g2 = cv.getContext('2d');
      g2.fillStyle = col;
      g2.beginPath();
      g2.arc(p.x * r.width, p.y * r.height, wCss / 2, 0, Math.PI * 2);
      g2.fill();
      var d = HW.dctx;
      d.fillStyle = col;
      d.beginPath();
      d.arc(p.x * HW_W, p.y * HW_H, (wCss * (HW_W / r.width)) / 2, 0, Math.PI * 2);
      d.fill();
      HW.ink = HW.ink || !HW.eraser;
      hwRefreshHint();
    }
    function drawSeg(a, b) {
      var r = cv.getBoundingClientRect();
      if (!r.width) return;
      var col = HW.eraser ? '#FFFFFF' : HW.color;
      var wCss = HW.eraser ? HW.size * 3 : HW.size;
      var g2 = cv.getContext('2d');
      g2.strokeStyle = col; g2.lineWidth = wCss; g2.lineCap = 'round'; g2.lineJoin = 'round';
      g2.beginPath();
      g2.moveTo(a.x * r.width, a.y * r.height);
      g2.lineTo(b.x * r.width, b.y * r.height);
      g2.stroke();
      var d = HW.dctx;
      d.strokeStyle = col; d.lineWidth = wCss * (HW_W / r.width); d.lineCap = 'round'; d.lineJoin = 'round';
      d.beginPath();
      d.moveTo(a.x * HW_W, a.y * HW_H);
      d.lineTo(b.x * HW_W, b.y * HW_H);
      d.stroke();
      HW.ink = HW.ink || !HW.eraser;
    }
    cv.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      try { cv.setPointerCapture(ev.pointerId); } catch (e) {}
      var p = norm(ev);
      if (!p) return;
      HW.op = true; HW.last = p;
      drawDot(p);
    });
    cv.addEventListener('pointermove', function (ev) {
      if (!HW.op) return;
      ev.preventDefault();
      var p = norm(ev);
      if (!p) return;
      if (HW.last) drawSeg(HW.last, p);
      HW.last = p;
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (k) {
      cv.addEventListener(k, function () { HW.op = false; HW.last = null; hwRefreshHint(); });
    });
  }
  function hwRefreshHint() {
    var hint = document.getElementById('hwHint');
    if (hint) hint.style.display = HW.ink ? 'none' : '';
    var block = document.querySelector('.hw-block');
    if (block) block.classList.toggle('has-ink', !!HW.ink);
  }
  function hwPaintTools() {
    $$('.hw-swatch').forEach(function (b) {
      b.classList.toggle('active', !HW.eraser && b.getAttribute('data-color') === HW.color);
    });
    $$('.hw-size').forEach(function (b) {
      b.classList.toggle('active', !HW.eraser && Number(b.getAttribute('data-size')) === HW.size);
    });
    var er = document.querySelector('.hw-eraser');
    if (er) er.classList.toggle('active', HW.eraser);
  }
  function hwExport() {
    hwEnsure();
    var w = 760, h = Math.round(w * HW_H / HW_W);
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, w, h);
    g.drawImage(HW.draft, 0, 0, w, h);
    var url = c.toDataURL('image/jpeg', 0.72);
    if (url.length > 100000) url = c.toDataURL('image/jpeg', 0.5);
    return url;
  }
  /* 문서 크기 보호: 손글씨 그림이 많아지면 오래된 것부터 그림만 비웁니다 */
  function pruneHandwriting() {
    if (!S || !Array.isArray(S.messages)) return;
    var total = 0;
    S.messages.forEach(function (m) { if (m && typeof m.hw === 'string') total += m.hw.length; });
    if (total <= HW_LIMIT) return;
    var list = S.messages.filter(function (m) { return m && typeof m.hw === 'string'; })
      .sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    for (var i = 0; i < list.length && total > HW_LIMIT; i++) {
      total -= list[i].hw.length;
      list[i].hw = null;
      list[i].hwDropped = 1;
    }
  }
  function handLetterHTML() {
    return '<div class="hw-block">' +
      '<div class="hw-head"><b>✍️ 손글씨 편지</b><span>손가락이나 펜으로 마음을 적어요</span></div>' +
      '<div class="hw-tools">' +
        '<div class="hw-colors">' + HW_COLORS.map(function (c) {
          return '<button type="button" class="hw-swatch' + (!HW.eraser && HW.color === c ? ' active' : '') + '" style="background:' + c + '" data-act="hw-color" data-color="' + c + '" aria-label="연필 색"></button>';
        }).join('') + '</div>' +
        '<div class="hw-sizes">' + HW_SIZES.map(function (s) {
          return '<button type="button" class="hw-size' + (!HW.eraser && HW.size === s.v ? ' active' : '') + '" data-act="hw-size" data-size="' + s.v + '">' + s.label + '</button>';
        }).join('') + '</div>' +
        '<button type="button" class="hw-eraser' + (HW.eraser ? ' active' : '') + '" data-act="hw-eraser">🧽 지우개</button>' +
        '<button type="button" class="hw-clear" data-act="hw-clear">🔄 처음부터</button>' +
      '</div>' +
      '<div class="hw-stage">' +
        '<canvas id="hwCanvas" class="hw-canvas" aria-label="손글씨 편지 쓰는 종이"></canvas>' +
        '<div class="hw-hint" id="hwHint">여기에 손가락으로 써 보세요 ✍️</div>' +
      '</div>' +
      '<button type="button" class="btn btn-rose btn-block hw-send" data-act="send-hand">손글씨 편지 보내기 ✍️</button>' +
    '</div>';
  }
  function sendHandLetter() {
    if (!HW.ink) {
      UI.toast('먼저 손글씨로 편지를 써 주세요 ✍️', { emoji: '✍️', kind: 'warn' });
      return;
    }
    var url = hwExport();
    var text = ((document.getElementById('mailText') || {}).value || '').trim();
    var rec = D.mailRecipients.filter(function (r) { return r.id === mailRecipient; })[0] || D.mailRecipients[0];
    var sender = childById(mailSender);
    S.messages.unshift({
      id: UI.uid('letter'),
      fromId: sender.id, fromName: sender.name,
      toId: rec.id, toName: rec.name,
      pictos: [], text: text, hw: url,
      ts: Date.now(), read: false, replies: []
    });
    var tIn = document.getElementById('mailText');
    if (tIn) tIn.value = '';
    lastMsgAt = Date.now();
    HW.ink = false;
    hwEnsure();
    HW.dctx.fillStyle = '#FFFFFF';
    HW.dctx.fillRect(0, 0, HW_W, HW_H);
    save();
    render({ keepScroll: true });
    UI.confetti(20);
    UI.toast(rec.name + '에게 손글씨 편지를 보냈어요', { emoji: '✍️', kind: 'good' });
    sendMailboxMessage('letter', { fromName: sender.name, toName: rec.name, text: text, hand: true });
  }
  function viewHandwriting(id) {
    var m = S.messages.filter(function (x) { return x.id === id; })[0];
    if (!m || !m.hw) return;
    UI.modal({
      title: (m.fromName || '아이') + '의 손글씨 편지',
      bodyHTML: '<img class="hw-big" src="' + m.hw + '" alt="손글씨 편지">' +
        (m.text ? '<p class="help" style="margin-top:8px">' + esc(m.text) + '</p>' : ''),
      actions: [{ label: '닫기', kind: 'ghost' }]
    });
  }

  /* =========================================================
     ⚡ 별 모아서 포켓몬 키우기 (알 → 3단계 진화)
     ---------------------------------------------------------
     · 3단계 진화 라인 20가지. 모두 알(🥚)에서 시작해요.
       Lv.1 알 → (별 100개) → Lv.2 부화 → Lv.3 1차 진화 → Lv.4 최종 진화
     · 최종 진화하면 도감에 등록되고 새 알을 고를 수 있어요.
     · 부화·레벨업·진화 순간에는 플래시·꽃가루·효과음과 함께 축하 화면이 떠요.
     ========================================================= */
  var PK = (function () {
    var species = {};
    var lines = [];
    (D.pokemonLines || []).forEach(function (line) {
      var stages = (line.ids || []).map(function (id) { return [id]; });
      lines.push({ key: line.key, name: line.name, stages: stages });
      stages.forEach(function (ids, si) {
        ids.forEach(function (id) {
          species[id] = {
            id: id,
            ko: (D.pokemonNames && D.pokemonNames[id]) || String(id),
            line: line.key,
            stage: si,
            stageCount: stages.length,
            next: (stages[si + 1] || []).slice(),
            final: si === stages.length - 1
          };
        });
      });
    });
    var finals = Object.keys(species).map(Number).filter(function (id) { return species[id].final; });
    return { species: species, lines: lines, finals: finals };
  })();
  function pkArt(id) {
    return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/' + id + '.png';
  }
  function pkIcon(id) {
    return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/' + id + '.png';
  }
  function pkPerLevel() {
    return clampNum((S && S.pkCfg && S.pkCfg.perLevel), 10, 1000, 100);
  }
  function pkOf(childId) {
    S.pokemon = S.pokemon || {};
    if (!S.pokemon[childId]) S.pokemon[childId] = { line: '', cur: 0, fed: 0, dex: [] };
    var p = S.pokemon[childId];
    p.fed = Math.max(0, Number(p.fed) || 0);
    if (!Array.isArray(p.dex)) p.dex = [];
    /* 예전(단계 없이 종류만 있던) 값도 알아서 라인으로 옮겨 줍니다 */
    if (!p.line && p.cur && PK.species[p.cur]) p.line = PK.species[p.cur].line;
    if (!p.line) p.cur = 0;
    return p;
  }
  function pkLine(p) {
    if (!p || !p.line) return null;
    return PK.lines.filter(function (l) { return l.key === p.line; })[0] || null;
  }
  function pkLevel(fed) { return 1 + Math.floor(Math.max(0, fed) / pkPerLevel()); }
  function pkProg(fed) { return Math.max(0, Math.floor(fed)) % pkPerLevel(); }
  /* 0 = 알, 1~3 = 진화 단계 */
  function pkStage(p) { return Math.min(3, Math.max(0, pkLevel(p.fed) - 1)); }
  function pkSpecies(p) {
    var line = pkLine(p);
    if (!line) return null;
    var st = pkStage(p);
    if (st <= 0) return null;
    return PK.species[line.stages[st - 1][0]] || null;
  }
  /* 다음에 될 모습 (알이면 부화할 1단계) */
  function pkNextSpecies(p) {
    var line = pkLine(p);
    if (!line) return null;
    var st = pkStage(p);
    if (st >= 3) return null;
    return PK.species[line.stages[st === 0 ? 0 : st][0]] || null;
  }
  function pkStageName(st) { return st <= 0 ? '알' : st + '단계'; }
  /* 아이 화면 문구: 알 단계에서는 어떤 포켓몬인지 절대 말하지 않습니다.
     부모님 관리 화면에서만 reveal=true 로 실제 라인을 함께 봅니다. */
  function pkStateText(childId, reveal) {
    var p = pkOf(childId);
    var line = pkLine(p);
    var sp = pkSpecies(p);
    var stars = S.stars[childId] || 0;
    if (!line) return '아직 알을 안 골랐어요 · 별 ' + stars;
    if (sp) return sp.ko + ' Lv.' + pkLevel(p.fed) + ' · ' + pkStageName(pkStage(p)) + ' · 별 ' + stars;
    return '🥚 신비한 알 Lv.' + pkLevel(p.fed) +
      (reveal && line ? ' (속: ' + line.name + ' 라인)' : '') + ' · 별 ' + stars;
  }
  function pkRegisterDex(childId, id) {
    var p = pkOf(childId);
    if (p.dex.indexOf(id) >= 0) return false;
    p.dex.push(id);
    return true;
  }
  /* ---------- 효과음 (Web Audio) ---------- */
  function pkTone(freq, start, dur, type, vol) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!pkTone.ctx) pkTone.ctx = new AC();
      var ctx = pkTone.ctx;
      if (ctx.state === 'suspended') ctx.resume();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'triangle';
      o.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(vol || 0.13, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(start);
      o.stop(start + dur + 0.02);
    } catch (e) {}
  }
  function pkSound(kind, n) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!pkTone.ctx) pkTone.ctx = new AC();
      var t0 = pkTone.ctx.currentTime + 0.02;
      if (kind === 'feed') {
        pkTone(1046.5, t0, 0.12, 'sine', 0.1);
        pkTone(1568, t0 + 0.07, 0.16, 'sine', 0.08);
        /* 별이 쏟아지는 소리 — 반짝이는 고음이 연달아 (연타할 땐 조금 쉬어요) */
        var now = Date.now();
        if (!pkSound.showerAt || now - pkSound.showerAt > 110) {
          pkSound.showerAt = now;
          var many = Math.max(4, Math.min(14, 4 + Math.round((n || 1) * 0.9)));
          for (var i = 0; i < many; i++) {
            pkTone(1400 + Math.random() * 1400, t0 + 0.03 + i * (0.028 + Math.random() * 0.02), 0.09 + Math.random() * 0.12, 'sine', 0.032);
          }
        }
      } else if (kind === 'level') {
        [784, 988, 1175].forEach(function (f, i) { pkTone(f, t0 + i * 0.09, 0.2, 'triangle', 0.11); });
      } else {
        /* 부화·진화 팡파레 */
        [523, 659, 784, 1046, 1318].forEach(function (f, i) {
          pkTone(f, t0 + i * 0.11, 0.3, 'triangle', 0.13);
          pkTone(f / 2, t0 + i * 0.11, 0.26, 'sine', 0.08);
        });
        pkTone(1568, t0 + 0.62, 0.6, 'sine', 0.12);
      }
    } catch (e) {}
  }
  /* ---------- 별 폭죽 (캔버스 파티클) ----------
     별을 먹일 때마다 수십~수백 개의 ⭐이 분수처럼 솟아 사방으로 쏟아집니다.
     · 캔버스 하나에 모든 별을 그려 빠르게 연타해도 렉이 없어요.
     · 동시에 살아 있는 별은 MAX 개까지만 (넘치면 오래된 별부터 정리). */
  var pkFx = (function () {
    var cv = null, ctx = null, parts = [], raf = 0, W = 0, H = 0, lastT = 0;
    var MAX = 700;
    var COLORS = ['#FFB300', '#FFC61A', '#FF7A00', '#FF5FA2', '#3FA9F5', '#FFD54A', '#FFFFFF'];
    function ensure() {
      if (cv && cv.isConnected) { if (!ctx) ctx = cv.getContext('2d'); return; }
      cv = document.createElement('canvas');
      cv.className = 'pk-fx';
      cv.setAttribute('aria-hidden', 'true');
      document.body.appendChild(cv);
      ctx = cv.getContext('2d');
      window.addEventListener('resize', resize);
      resize();
    }
    function resize() {
      if (!cv || !ctx) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(H * dpr));
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function drawStar(x, y, r, rot) {
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var rr = i % 2 ? r * 0.44 : r;
        var a = rot + i * Math.PI / 5 - Math.PI / 2;
        var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    function add(p) {
      if (parts.length >= MAX) parts.shift();
      parts.push(p);
    }
    function kick() {
      if (raf) return;
      lastT = 0;
      raf = requestAnimationFrame(tick);
    }
    /* 1초 기준으로 움직여요 — 화면 주사율이 달라도 별이 너무 빨리 사라지지 않습니다 */
    function tick(t) {
      raf = 0;
      if (!ctx) return;
      var dt = lastT ? Math.min(0.06, (t - lastT) / 1000) : 0.016;
      lastT = t;
      ctx.clearRect(0, 0, W, H);
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.life += dt;
        p.vy += p.g * dt;
        p.vx *= (1 - 0.8 * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        /* 화면 밖으로 나가면 살짝 튕겨서 별이 화면 안에 머물게 */
        if (p.x < -24) { p.x = -24; p.vx = Math.abs(p.vx) * 0.55; }
        if (p.x > W + 24) { p.x = W + 24; p.vx = -Math.abs(p.vx) * 0.55; }
        var k = 1 - p.life / p.ttl;
        /* 쏟아지는 별은 화면 아래로 내려가면 위에서 다시 내려오게 (쏟아지는 동안 계속) */
        if (p.recycle && p.y > H + 30) {
          if (Date.now() < p.until) {
            p.x = Math.random() * W;
            p.y = -20 - Math.random() * 70;
            p.vy = 80 + Math.random() * 110;
            p.vx = (Math.random() - 0.5) * 46;
            p.life = 0;
            continue;
          }
          parts.splice(i, 1); continue;
        }
        if (k <= 0) {
          if (p.recycle && Date.now() < p.until) { p.life = 0; k = 1; }
          else { parts.splice(i, 1); continue; }
        }
        if (p.y > H + 30) { parts.splice(i, 1); continue; }
        ctx.globalAlpha = k > 0.55 ? 1 : Math.max(0, k / 0.55);
        ctx.fillStyle = p.color;
        if (p.kind === 'dot') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 0.42, 0, 6.283);
          ctx.fill();
        } else {
          drawStar(p.x, p.y, p.r * (0.6 + 0.4 * k), p.rot);
          if (p.r > 9) {
            ctx.fillStyle = 'rgba(255,255,255,.85)';
            ctx.beginPath();
            ctx.arc(p.x - p.r * 0.18, p.y - p.r * 0.2, p.r * 0.22, 0, 6.283);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
      if (parts.length) raf = requestAnimationFrame(tick);
      else { ctx.clearRect(0, 0, W, H); lastT = 0; }
    }
    function mk(x, y, vx, vy, g, opts) {
      var big = Math.random() < 0.22;
      return {
        x: x, y: y, vx: vx, vy: vy, g: g,
        r: big ? 14 + Math.random() * 9 : 6 + Math.random() * 8,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 6,
        life: 0,
        ttl: (opts && opts.ttl) || 2.6 + Math.random() * 1.2,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        kind: Math.random() < 0.3 ? 'dot' : 'star'
      };
    }
    /* 한 점에서 사방으로 터지는 별 */
    function burst(cx, cy, n, opts) {
      opts = opts || {};
      ensure();
      if (document.hidden) return;
      var power = opts.power || 1;
      for (var i = 0; i < n; i++) {
        var ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 2;
        var sp = (70 + Math.random() * 210) * power;
        add(mk(cx + (Math.random() - 0.5) * 30, cy + (Math.random() - 0.5) * 30,
          Math.cos(ang) * sp, Math.sin(ang) * sp - (opts.up ? 60 : 20),
          360 + Math.random() * 260, { ttl: 2.4 + Math.random() * 1.2 }));
      }
      kick();
    }
    /* 아래에서 위로 솟구치는 별 분수 */
    function fountain(cx, cy, n) {
      ensure();
      if (document.hidden) return;
      for (var i = 0; i < n; i++) {
        var ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.0;
        var sp = 300 + Math.random() * 300;
        add(mk(cx + (Math.random() - 0.5) * 160, cy + Math.random() * 12,
          Math.cos(ang) * sp * 0.6, Math.sin(ang) * sp,
          700 + Math.random() * 240, { ttl: 2.4 + Math.random() * 1.3 }));
      }
      kick();
    }
    /* 화면 위에서 별이 쏟아지는 비 — 쏟아지는 동안은 아래로 내려가면 다시 위에서 내려와요 */
    function rain(n, durationMs) {
      ensure();
      if (document.hidden) return;
      var until = Date.now() + (durationMs || 2600);
      for (var i = 0; i < n; i++) {
        var p = mk(Math.random() * W, -20 - Math.random() * 480,
          (Math.random() - 0.5) * 46, 80 + Math.random() * 110,
          30 + Math.random() * 40, { ttl: 7 });
        p.recycle = true;
        p.until = until;
        add(p);
      }
      kick();
    }
    return { burst: burst, fountain: fountain, rain: rain, resize: resize };
  })();
  /* 별을 먹인 만큼 화면에 별을 마구 뿌립니다 (1개→약 50개, 10개→약 250개)
     한 번에 다 터뜨리지 않고 몇 차례 더 터뜨려 별이 계속 쏟아지는 느낌을 냅니다. */
  function pkStarStorm(artEl, n, big) {
    var box = artEl ? artEl.getBoundingClientRect() : null;
    if (!box || !box.width) {
      var card = document.querySelector('.pk-duo-col.active .pk-card') || document.querySelector('.pk-card');
      box = card ? card.getBoundingClientRect() : null;
    }
    if (!box || !box.width) return;
    var cx = Math.round(box.left + box.width / 2);
    var cy = Math.round(box.top + box.height / 2);
    var base = Math.min(window.innerHeight - 6, box.bottom);
    var amount = Math.max(1, Math.min(30, Number(n) || 1));
    var count = Math.min(180, 34 + Math.round(amount * 15) + (big ? 70 : 0));
    var power = 1 + Math.min(0.6, amount / 22);
    pkFx.rain(Math.min(300, count + 90), 4200);
    pkFx.burst(cx, cy, Math.round(count * 0.5), { power: power, up: true });
    pkFx.fountain(cx, base, Math.round(count * 0.55));
    /* 0.25초 간격으로 카드 위에서 한 번씩 더 터뜨려요 */
    [[260, 0.7], [560, 0.6], [900, 0.5], [1260, 0.4]].forEach(function (wv) {
      setTimeout(function () {
        pkFx.fountain(cx, base, Math.round(count * wv[1] * 0.4));
        pkFx.burst(cx, cy, Math.round(count * wv[1] * 0.35), { power: power * 0.9, up: true });
      }, wv[0]);
    });
  }
  /* ---------- 반짝이 파티클 ---------- */
  function pkSparkle(host, n) {
    if (!host) return;
    var box = host.getBoundingClientRect();
    if (!box.width) return;
    var layer = document.createElement('div');
    layer.className = 'pk-sparks';
    document.body.appendChild(layer);
    var emojis = ['✨', '⭐', '💫', '🌟'];
    for (var i = 0; i < (n || 12); i++) {
      var sp = document.createElement('span');
      sp.textContent = emojis[i % emojis.length];
      sp.style.left = (box.left + Math.random() * box.width) + 'px';
      sp.style.top = (box.top + box.height * (0.15 + Math.random() * 0.6)) + 'px';
      sp.style.fontSize = (11 + Math.random() * 16) + 'px';
      sp.style.animationDelay = (Math.random() * 0.25) + 's';
      sp.style.animationDuration = (0.8 + Math.random() * 0.6) + 's';
      layer.appendChild(sp);
    }
    setTimeout(function () { layer.remove(); }, 2200);
  }
  /* 화면 전체가 번쩍이는 플래시 */
  function pkFlash() {
    var f = document.createElement('div');
    f.className = 'pk-flash';
    document.body.appendChild(f);
    setTimeout(function () { f.remove(); }, 900);
  }
  /* ---------- 별 먹이기 ---------- */
  function pkFeed(childId, n) {
    var p = pkOf(childId);
    if (!p.line) {
      UI.toast('먼저 알을 골라 주세요 🥚', { emoji: '⚡', kind: 'warn' });
      return;
    }
    n = Math.max(1, Math.min(50, Math.floor(Number(n) || 1)));
    var have = S.stars[childId] || 0;
    if (have < n) {
      UI.toast('별이 모자라요. 지금 별 ' + have + '개 있어요', { emoji: '⭐', kind: 'warn' });
      return;
    }
    var beforeLv = pkLevel(p.fed);
    var beforeStage = pkStage(p);
    S.stars[childId] = have - n;
    p.fed += n;
    var afterLv = pkLevel(p.fed);
    var afterStage = pkStage(p);
    var line = pkLine(p);
    var newIds = [];
    for (var st = beforeStage + 1; st <= afterStage; st++) {
      if (line && line.stages[st - 1]) newIds.push(line.stages[st - 1][0]);
    }
    if (afterStage >= 3) pkRegisterDex(childId, line.stages[2][0]);
    save();
    render({ keepScroll: true });

    var art = document.querySelector('.pk-art[data-child="' + childId + '"]');
    /* 누르는 순간 별이 마구 쏟아져요 (진화·부화 순간엔 더 크게) */
    pkStarStorm(art, n, newIds.length > 0);
    if (newIds.length) {
      pkStageCelebrate(childId, beforeStage, afterStage, newIds);
    } else if (afterLv > beforeLv) {
      pkSound('level', n);
      pkFlash();
      pkSparkle(art, 16);
      UI.confetti(24);
      UI.toast('Lv.' + afterLv + '! 별 ' + pkProg(p.fed) + '/' + pkPerLevel() + ' ⭐', { emoji: '⚡', kind: 'good', duration: 2600 });
    } else {
      pkSound('feed', n);
      pkSparkle(art, 7);
      UI.toast('별 ' + n + '개를 먹였어요 · ' + pkProg(p.fed) + '/' + pkPerLevel() + ' ⭐', { emoji: '⭐', kind: 'good', duration: 1500 });
    }
  }
  /* 부화 · 진화 축하 화면 */
  function pkStageCelebrate(childId, beforeStage, afterStage, ids) {
    var p = pkOf(childId);
    var line = pkLine(p);
    var sp = PK.species[ids[ids.length - 1]];
    var isHatch = beforeStage === 0;
    var isFinal = afterStage >= 3;
    pkSound('evo');
    pkFlash();
    UI.confetti(isFinal ? 90 : 60);
    setTimeout(function () { UI.confetti(40); }, 350);
    /* 알부터 지금까지 한 줄로 보여 주기 */
    var chainIds = [];
    if (line) {
      for (var ci = 0; ci < afterStage; ci++) chainIds.push(line.stages[ci][0]);
    }
    var rows = (line ? '<span class="pk-evo-step egg"><i>🥚</i><b>알</b></span><span class="pk-evo-arrow">→</span>' : '') +
      chainIds.map(function (id, i) {
        var last = i === chainIds.length - 1;
        return '<span class="pk-evo-step' + (last ? ' now' : '') + '"><img src="' + pkArt(id) + '" alt="' + esc(PK.species[id].ko) + '"><b>' + esc(PK.species[id].ko) + '</b></span>';
      }).join('<span class="pk-evo-arrow">→</span>');
    var prev = (line && beforeStage >= 1) ? PK.species[line.stages[beforeStage - 1][0]] : null;
    var lead = isHatch
      ? esc(childById(childId).name) + '의 ' + (line ? esc(line.name) : '') + ' 알이 깨어났어요!'
      : esc(childById(childId).name) + '의 ' + (prev ? esc(prev.ko) : '') + '가 ' + esc(sp.ko) + '(으)로 ' + (isFinal ? '최종 진화했어요!' : '진화했어요!');
    UI.modal({
      title: isHatch ? '🐣 알이 부화했어요!' : (isFinal ? '✨ 최종 진화!' : '⚡ 진화했어요!'),
      bodyHTML: '<div class="pk-evo-modal">' +
          '<p class="pk-evo-lead">' + lead + '</p>' +
          '<div class="pk-evo-stage"><img class="pk-evo-big" src="' + pkArt(sp.id) + '" alt="' + esc(sp.ko) + '"></div>' +
          '<p class="pk-evo-name">' + esc(sp.ko) + '</p>' +
          '<div class="pk-evo-chain">' + rows + '</div>' +
          '<p class="help">Lv.' + pkLevel(p.fed) + ' · ' + pkStageName(afterStage) + '</p>' +
          (isFinal ? '<p class="pk-evo-final">🏅 도감에 등록됐어요! 이제 새 알을 골라 다른 친구도 키울 수 있어요.</p>' : '') +
        '</div>',
      actions: [{ label: '좋아! 🎉', kind: 'primary' }]
    });
  }
  /* ---------- 신비한 알: 어떤 포켓몬이 나올지 화면에는 안 보이게 하고
     알을 받는 순간 안에서 랜덤으로 정합니다 ---------- */
  function pkRandomLine(childId) {
    var p = pkOf(childId);
    var got = {};
    (p.dex || []).forEach(function (id) { got[id] = 1; });
    function finalId(l) { return l.stages[l.stages.length - 1][0]; }
    var pool = PK.lines.filter(function (l) { return !got[finalId(l)] && l.key !== p.line; });
    if (!pool.length) pool = PK.lines.filter(function (l) { return l.key !== p.line; });
    if (!pool.length) pool = PK.lines.slice();
    return pool[Math.floor(Math.random() * pool.length)] || null;
  }
  function pkNewCount(childId) {
    var p = pkOf(childId);
    var got = {};
    (p.dex || []).forEach(function (id) { got[id] = 1; });
    return PK.lines.filter(function (l) { return !got[l.stages[l.stages.length - 1][0]]; }).length;
  }
  function pkPick(childId) {
    /* 알 그림은 다 똑같고, 실제 포켓몬은 여기서 랜덤으로 정해집니다 */
    var line = pkRandomLine(childId);
    if (!line) return;
    var p = pkOf(childId);
    if (p.line && pkStage(p) > 0) {
      UI.confirm('새 신비한 알을 받을까요?', '지금 키우고 있는 ' + (pkSpecies(p) ? pkSpecies(p).ko : '포켓몬') +
        '(Lv.' + pkLevel(p.fed) + ')가 알로 돌아가요. 새 알은 어떤 포켓몬일지 부화할 때까지 비밀이에요. 지금 별 진행(' +
        pkProg(p.fed) + '/' + pkPerLevel() + ')은 처음부터 다시 쌓여요.', '새 알 받기', 'danger')
        .then(function (ok) { if (ok) pkApplyPick(childId, pkRandomLine(childId).key); });
      return;
    }
    pkApplyPick(childId, line.key);
  }
  function pkApplyPick(childId, lineKey) {
    var p = pkOf(childId);
    p.line = lineKey;
    p.cur = 0;
    p.fed = 0;
    saveNow();
    render({ keepScroll: true });
    UI.confetti(24);
    pkSound('level');
    UI.toast(childById(childId).name + '에게 신비한 알이 도착했어요 🥚 별 ' + pkPerLevel() + '개를 모으면 부화해요!', { emoji: '⚡', kind: 'good', duration: 3600 });
  }
  /* 부모님 모드: 같은 진행을 두고 다른 알을 다시 뽑기 */
  function pkReroll(childId) {
    if (!needParent('알 다시 뽑기는 부모님 모드에서만 돼요')) return;
    var p = pkOf(childId);
    UI.confirm('신비한 알을 다시 뽑을까요?', childById(childId).name + '의 지금 알을 내려놓고 다른 신비한 알을 새로 받아요. ' +
      '별 진행(' + pkProg(p.fed) + '/' + pkPerLevel() + ')은 처음부터 다시 쌓이고, 도감 기록은 그대로 남아요.', '다시 뽑기', 'danger')
      .then(function (ok) {
        if (!ok) return;
        var line = pkRandomLine(childId);
        if (!line) return;
        pkApplyPick(childId, line.key);
        UI.toast('새 신비한 알을 뽑았어요 (부모님만 보임: ' + line.name + ' 라인)', { emoji: '🎲', kind: 'good', duration: 3200 });
      });
  }
  function pkEggGridHTML(childId) {
    var left = pkNewCount(childId);
    return '<div class="pk-mystery">' +
      '<button type="button" class="pk-mystery-egg" data-act="pk-pick" data-child="' + childId + '" aria-label="신비한 알 받기">' +
        '<span class="pk-mystery-emoji" aria-hidden="true">🥚</span>' +
        '<b>신비한 알 받기</b>' +
        '<small>무슨 포켓몬이 나올까?<br>아직 만나지 못한 ' + left + '가지 중에서 와요</small>' +
      '</button></div>';
  }
  function pkChooserModal(childId) {
    var c = childById(childId);
    UI.modal({
      size: 'wide',
      title: '🥚 신비한 알 고르기',
      bodyHTML: '<p class="help" style="margin-bottom:10px">' + esc(c.name) +
        '의 알을 골라요. 어떤 포켓몬이 나올지는 <b>부화하는 순간까지 비밀</b>이에요!<br>' +
        '별 ' + pkPerLevel() + '개를 모으면 부화하고, 그때 정체가 짠 하고 나타나요.</p>' +
        pkEggGridHTML(childId),
      actions: [{ label: '닫기', kind: 'ghost' }]
    });
  }
  function pkTestStars(childId) {
    if (!needParent('별 테스트 지급은 부모님 모드에서만 돼요')) return;
    var per = pkPerLevel();
    S.stars[childId] = (S.stars[childId] || 0) + per;
    saveNow();
    render({ keepScroll: true });
    UI.toast('테스트로 별 ' + per + '개를 넣었어요 (레벨업 확인용)', { emoji: '🧪', kind: 'good', duration: 3000 });
  }
  /* ---------- 카드 ---------- */
  function pkTrackHTML(p) {
    var line = pkLine(p);
    if (!line) return '';
    var st = pkStage(p);
    var cells = ['<span class="pk-tr' + (st === 0 ? ' on' : '') + '"><i>🥚</i><em>알</em></span>'];
    line.stages.forEach(function (ids, i) {
      var sp = PK.species[ids[0]];
      var on = st === i + 1;
      var done = st > i + 1;
      /* 아직 도달하지 않은 단계는 이름을 가리고, 모습은 까만 실루엣으로만 보여 줍니다.
         (알 단계에서는 실루엣도 보이지 않고 물음표만) */
      if (!on && !done) {
        if (st === 0) {
          cells.push('<span class="pk-tr locked"><i>❔</i><em>???</em></span>');
        } else {
          cells.push('<span class="pk-tr locked">' +
            '<img src="' + pkIcon(sp.id) + '" alt="" loading="lazy" aria-hidden="true">' +
            '<em>???</em></span>');
        }
        return;
      }
      cells.push('<span class="pk-tr' + (on ? ' on' : '') + (done ? ' done' : '') + '">' +
        '<img src="' + pkIcon(sp.id) + '" alt="' + esc(sp.ko) + '" loading="lazy">' +
        '<em>' + esc(sp.ko) + '</em></span>');
    });
    return '<div class="pk-track">' + cells.join('') + '</div>';
  }
  function pkCardHTML(c) {
    var p = pkOf(c.id);
    var stars = S.stars[c.id] || 0;
    var per = pkPerLevel();
    var head = '<div class="rk-head">' +
      kidAvaHTML(c) + '<strong>' + esc(c.name) + '</strong>' +
      '<span class="rk-spacer"></span>' +
      '<span class="badge sun">⭐ ' + stars + '</span>' +
      '</div>';

    if (!p.line) {
      return '<div class="card pk-card ' + c.color + '">' + head +
        '<div class="pk-choose-help"><b>🥚 알을 누르면 시작!</b> ' + esc(c.name) + '이랑 함께할 신비한 알이 와요</div>' +
        pkEggGridHTML(c.id) + '</div>';
    }

    var line = pkLine(p);
    var st = pkStage(p);
    var sp = pkSpecies(p);
    var next = pkNextSpecies(p);
    var lvl = pkLevel(p.fed);
    var prog = pkProg(p.fed);
    var maxed = st >= 3;
    var artInner;
    if (st === 0) {
      artInner = '<div class="pk-egg-art"><span class="pk-egg-emoji">🥚</span><span class="pk-egg-shine">✨</span></div>';
    } else {
      artInner = '<img class="pk-mon" src="' + pkArt(sp.id) + '" alt="' + esc(sp.ko) + '" loading="lazy" ' +
        'onerror="this.onerror=null;this.src=\'' + pkIcon(sp.id) + '\'">';
    }
    var nextBlock = next
      ? '<div class="pk-next' + (st === 0 ? ' mystery' : ' lock') + '"><span class="pk-next-label">다음 모습</span>' +
          (st === 0
            ? '<span class="pk-next-mystery" aria-hidden="true">❔</span>'
            : '<img src="' + pkIcon(next.id) + '" alt="" loading="lazy" class="pk-next-img" aria-hidden="true">') +
          '<b>???</b>' +
          '<small>' + (st === 0 ? '별 ' + (per - prog) + '개 더 모으면 부화' : '별 ' + (per - prog) + '개 더 모으면 진화') + '</small></div>'
      : '<div class="pk-next done"><span class="pk-next-label">최종 진화 완료</span><b>🏅 도감 등록</b></div>';

    return '<div class="card pk-card ' + c.color + (maxed ? ' maxed' : '') + '">' + head +
      '<div class="pk-hero">' +
        '<div class="pk-aura" aria-hidden="true"></div>' +
        '<div class="pk-art" data-child="' + c.id + '">' + artInner + '</div>' +
        '<div class="pk-hero-info">' +
          '<div class="pk-name">' + (sp ? esc(sp.ko) : '신비한 알') + '<span class="pk-lv">Lv.' + lvl + '</span></div>' +
          '<div class="pk-sub">' + (st === 0 ? '무슨 포켓몬이 나올까? · 알' : esc(line.name) + ' 라인 · ' + pkStageName(st)) + '</div>' +
          '<div class="pk-bar"><i style="width:' + prog + '%"></i></div>' +
          '<div class="pk-progtxt"><span>' + (maxed ? '다음 별까지 ' : '다음 진화까지 ') + (per - prog) + '개</span><span>먹인 별 ' + prog + ' / ' + per + ' ⭐</span></div>' +
        '</div>' +
      '</div>' +
      pkTrackHTML(p) +
      nextBlock +
      '<div class="pk-feed">' +
        [1, 5, 10].map(function (n) {
          return '<button type="button" class="btn btn-sun btn-sm" data-act="pk-feed" data-child="' + c.id + '" data-n="' + n + '"' + (stars < n ? ' disabled' : '') + '>별 ' + n + '개 먹이기</button>';
        }).join('') +
      '</div>' +
      '<p class="pk-help">내 별 <b>⭐' + stars + '</b> 중에서 먹여요 · <b>별 ' + per + '개</b>를 먹이면 ' +
        (st === 0 ? '알이 부화해요 🥚' : maxed ? '다음 별이 쌓여요 (최종 진화 완료 · 새 알을 골라도 돼요)' : '한 단계 더 진화해요 ✨') + '</p>' +
      (maxed ? '<button type="button" class="btn btn-soft btn-sm pk-new" data-act="pk-chooser" data-child="' + c.id + '">🥚 새 알 고르기</button>' : '') +
      '</div>';
  }
  /* 도감 격자 — 그 아이가 모은 것만 보입니다 (아이마다 도감이 따로예요) */
  function pkDexGridHTML(childId) {
    var p = pkOf(childId);
    var got = {};
    (p.dex || []).forEach(function (id) { got[id] = 1; });
    return '<div class="pk-dex-grid">' + PK.finals.map(function (id) {
      var sp = PK.species[id];
      var owned = !!got[id];
      return '<div class="pk-dex-cell' + (owned ? ' owned' : '') + '">' +
        '<img src="' + pkIcon(id) + '" alt="" loading="lazy"' + (owned ? '' : ' aria-hidden="true"') + '>' +
        '<span>' + (owned ? esc(sp.ko) : '???') + '</span></div>';
    }).join('') + '</div>';
  }
  function renderPokemon() {
    var c = childById(routineChild);
    var p = pkOf(c.id);
    var dexCount = (p.dex || []).length;
    var total = PK.finals.length;
    return '<div class="card soft-sun pk-rules">' +
        '<div class="pk-rules-head"><b>⭐ 별 ' + pkPerLevel() + '개 모으면 진화!</b>' +
          '<span>' + D.children.map(function (k) { return k.emoji + ' ' + esc(k.name) + ' ⭐' + (S.stars[k.id] || 0); }).join(' · ') + '</span></div>' +
        '<p>할 일 체크 · 등교 준비 · 정리하기로 <b>내 별(⭐)</b>을 모아서 포켓몬에게 먹여요.<br>' +
        '<b>🥚 알 → 1단계 → 2단계 → 3단계(최종 진화)</b> · 단계마다 먹인 별 ' + pkPerLevel() + '개를 모아야 진화해요.<br>' +
        '먹인 별은 포켓몬 안에서만 쌓여요(내 별과는 따로 보여요). 알 속 포켓몬은 <b>부화하는 순간까지 비밀</b>!</p>' +
        (S.mode === 'parent'
          ? '<div class="btn-row pk-rules-btns">' +
              D.children.map(function (k) {
                return '<button type="button" class="btn btn-ghost btn-sm" data-act="pk-test" data-child="' + k.id + '">🧪 ' + esc(k.name) + ' 별 ' + pkPerLevel() + '개</button>';
              }).join('') +
              '<button type="button" class="btn btn-soft btn-sm" data-act="pk-settings">⚙️ 포켓몬 관리</button>' +
            '</div>'
          : '') +
      '</div>' +
      /* 좁은 화면: 한 아이씩 골라 보는 칩 (넓은 화면에서는 두 아이가 나란히 다 보여서 숨겨요) */
      '<div class="chip-row pk-pick" role="group" aria-label="누구 포켓몬을 볼까요">' +
        D.children.map(function (k) {
          var kc = (pkOf(k.id).dex || []).length;
          return '<button type="button" class="chip ' + k.color + (k.id === c.id ? ' active' : '') + '" data-act="pick-pk-child" data-id="' + k.id + '" aria-pressed="' + (k.id === c.id ? 'true' : 'false') + '">' +
            k.emoji + ' ' + esc(k.name) + '의 포켓몬 <small>📖 ' + kc + '/' + total + '</small></button>';
        }).join('') +
      '</div>' +
      /* 알·키우기 카드: 좁은 화면은 고른 아이 하나, 넓은 화면(패드·데스크톱)은 두 아이 2분할 */
      '<div class="pk-duo" data-active="' + c.id + '">' +
        D.children.map(function (k) {
          return '<div class="pk-duo-col' + (k.id === c.id ? ' active' : '') + '" data-child="' + k.id + '">' +
            pkCardHTML(k) +
          '</div>';
        }).join('') +
      '</div>' +
      /* 카드 아래 전체 폭 도감 — 위쪽 칩으로 민국·이준 도감을 바로 전환 */
      '<div class="card pk-dex" data-active="' + c.id + '">' +
        '<div class="pk-dex-head">' +
          '<span class="pk-dex-ico" aria-hidden="true">📖</span>' +
          '<div class="pk-dex-title"><b>' + esc(c.name) + '의 포켓몬 도감</b>' +
            '<small>모은 포켓몬 ' + dexCount + ' / ' + total + '마리</small></div>' +
          '<div class="pk-dex-tabs" role="group" aria-label="누구 도감을 볼까요">' +
            D.children.map(function (k) {
              var kc = (pkOf(k.id).dex || []).length;
              return '<button type="button" class="chip ' + k.color + (k.id === c.id ? ' active' : '') + '" data-act="pick-pk-child" data-id="' + k.id + '" aria-pressed="' + (k.id === c.id ? 'true' : 'false') + '">' +
                k.emoji + ' ' + esc(k.name) + ' 도감 <small>' + kc + '/' + total + '</small></button>';
            }).join('') +
          '</div>' +
        '</div>' +
        D.children.map(function (k) {
          return '<div class="pk-dex-pane' + (k.id === c.id ? ' active' : '') + '" data-child="' + k.id + '">' +
            pkDexGridHTML(k.id) +
          '</div>';
        }).join('') +
        '<p class="pk-dex-help">최종 진화한 포켓몬만 반짝하며 도감에 남아요. 별과 도감은 아이마다 따로 모여요.</p>' +
      '</div>';
  }

  /* 화면을 다시 그린 뒤 해야 하는 일 (손글씨 캔버스 붙이기) */
  function afterRender() {
    if (view === 'mailbox') hwMount();
  }

  /* 두 모드를 여는 버튼 (홈 · 할 일 위쪽) */
  function modeStripHTML() {
    var ms = msLeftToSchool();
    var left = ms > 0 ? leftText(ms) : '시간이 지났어요';
    return '<div class="mode-strip">' +
      '<button type="button" class="ms-school" data-act="school-open">' +
        '<span class="ms-ico" aria-hidden="true">🌅</span>' +
        '<span class="ms-txt"><b>등교 시작</b><small>' + esc(S.schoolTime) + '까지 · ' + esc(left) + '</small></span>' +
        '<span class="ms-go" aria-hidden="true">▶</span>' +
      '</button>' +
      '<div class="ms-tidy">' +
        '<span class="ms-tidy-label">🧹 정리시간</span>' +
        ((S.tidyCfg && S.tidyCfg.mins && S.tidyCfg.mins.length) ? S.tidyCfg.mins : [5, 10, 15]).map(function (m) {
          return '<button type="button" class="ms-min" data-act="tidy-start" data-min="' + m + '">' + m + '분</button>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  /* =========================================================
     🎛️ 부모님 모드 · 새 기능 관리
     ---------------------------------------------------------
     · 등교 시각·등교 준비 4개, 정리시간 버튼·보상·노래,
       포켓몬 레벨업 별·파트너·별 조정을 폰에서 톡톡 고칩니다.
     · 저장은 바로 클라우드(saveNow)로 올려 아이 태블릿에도 바로 보입니다.
     ========================================================= */
  function editRowHTML(item) {
    return '<div class="ed-row" data-id="' + esc(item.id || '') + '">' +
      '<input class="input ed-emoji" value="' + esc(item.emoji || '⭐') + '" maxlength="4" aria-label="그림">' +
      '<input class="input ed-label" value="' + esc(item.label || '') + '" maxlength="24" placeholder="할 일" aria-label="할 일">' +
      '<button type="button" class="ed-btn" data-mv="-1" aria-label="위로">▲</button>' +
      '<button type="button" class="ed-btn" data-mv="1" aria-label="아래로">▼</button>' +
      '<button type="button" class="ed-btn del" data-del="1" aria-label="지우기">✕</button>' +
    '</div>';
  }
  function bindEditList(wrap) {
    if (wrap.__edBound) return;
    wrap.__edBound = true;
    wrap.addEventListener('click', function (e) {
      var mv = e.target.closest('[data-mv]');
      if (mv) {
        var row = mv.closest('.ed-row');
        if (!row) return;
        var dir = Number(mv.getAttribute('data-mv'));
        if (dir < 0 && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
        if (dir > 0 && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
        return;
      }
      var del = e.target.closest('[data-del]');
      if (del) { var r = del.closest('.ed-row'); if (r) r.remove(); return; }
      var add = e.target.closest('[data-add-row]');
      if (add) {
        var block = add.closest('.ed-block');
        var list = block && block.querySelector('.ed-list');
        if (!list) return;
        var tmp = document.createElement('div');
        tmp.innerHTML = editRowHTML({ emoji: '⭐', label: '' });
        list.appendChild(tmp.firstChild);
        var inp = list.lastElementChild.querySelector('.ed-label');
        if (inp) inp.focus();
      }
    });
  }

  /* 🌅 등교 시작 설정 */
  function schoolSettingsModal() {
    if (!needParent('등교 시작 설정은 부모님 모드에서 바꿀 수 있어요')) return;
    var m = UI.modal({
      size: 'wide',
      title: '🌅 등교 시작 설정',
      bodyHTML:
        '<p class="help" style="margin-bottom:10px">등교 시작을 누르면 이 시각까지 남은 시간을 세요.</p>' +
        '<div class="field-row">' +
          '<div class="field"><label>등교 시간</label><input class="input" id="edSchoolTime" type="time" value="' + esc(S.schoolTime) + '"></div>' +
          '<div class="field"><label>남은 시간 막대 시작</label><input class="input" id="edSchoolStart" type="time" value="' + esc(S.schoolStart) + '"></div>' +
        '</div>' +
        '<div class="field"><label>등교 준비를 다 했을 때 보너스 별</label><input class="input" id="edSchoolReward" type="number" min="0" max="20" value="' + S.schoolReward + '"></div>' +
        D.children.map(function (c) {
          var items = schoolItems(c.id);
          return '<div class="ed-block">' +
            '<div class="ed-block-head"><b>' + c.emoji + ' ' + esc(c.name) + ' 등교 준비</b><span>' + items.length + '개</span></div>' +
            '<div class="ed-list" data-child="' + c.id + '">' + items.map(editRowHTML).join('') + '</div>' +
            '<button type="button" class="btn btn-soft btn-sm" data-add-row="' + c.id + '">＋ 항목 추가</button>' +
          '</div>';
        }).join(''),
      actions: [
        { label: '저장', kind: 'primary', onClick: function () {
            var t = (document.getElementById('edSchoolTime') || {}).value || '';
            var st = (document.getElementById('edSchoolStart') || {}).value || '';
            var rw = (document.getElementById('edSchoolReward') || {}).value || '';
            if (!hhmmOk(t)) { UI.toast('등교 시간을 다시 골라 주세요', { kind: 'warn' }); return false; }
            S.schoolTime = t;
            S.schoolStart = hhmmOk(st) && hhmmMin(st, 0) < hhmmMin(t, 0) ? st : minHHMM(hhmmMin(t, 510) - 90);
            S.schoolReward = clampNum(rw, 0, 20, 2);
            var changed = 0;
            D.children.forEach(function (c) {
              var list = document.querySelector('.ed-list[data-child="' + c.id + '"]');
              if (!list) return;
              var rows = Array.prototype.slice.call(list.querySelectorAll('.ed-row'));
              var arr = [];
              rows.forEach(function (r) {
                var lb = (r.querySelector('.ed-label').value || '').trim();
                if (!lb) return;
                var em = (r.querySelector('.ed-emoji').value || '').trim() || '⭐';
                arr.push({ id: r.getAttribute('data-id') || UI.uid('rt'), label: lb.slice(0, 24), emoji: em.slice(0, 4) });
              });
              if (!arr.length) return;
              var cur = ensureRoutineCustom(c.id);
              cur.morning = arr;
              changed++;
            });
            saveNow();
            render({ keepScroll: true });
            paintSchool(true);
            UI.confetti(14);
            UI.toast('등교 시작 설정을 저장했어요 · 아이 태블릿에도 바로 보여요', { emoji: '🌅', kind: 'good', duration: 3400 });
          } },
        { label: '닫기', kind: 'ghost' }
      ],
      onOpen: function (wrap) { bindEditList(wrap); }
    });
    return m;
  }

  /* 🧹 정리시간 설정 */
  function tidySettingsModal() {
    if (!needParent('정리시간 설정은 부모님 모드에서 바꿀 수 있어요')) return;
    var mins = (S.tidyCfg && S.tidyCfg.mins && S.tidyCfg.mins.length) ? S.tidyCfg.mins : [5, 10, 15];
    UI.modal({
      title: '🧹 정리시간 설정',
      bodyHTML:
        '<p class="help" style="margin-bottom:10px">홈·할 일 화면에 있는 5·10·15분 버튼을 원하는 대로 바꿔요. (1~60분)</p>' +
        '<div class="field-row">' + [0, 1, 2].map(function (i) {
          return '<div class="field"><label>' + (i + 1) + '번째 버튼 (분)</label>' +
            '<input class="input ed-min" data-i="' + i + '" type="number" min="1" max="60" value="' + (mins[i] || [5, 10, 15][i]) + '"></div>';
        }).join('') + '</div>' +
        '<div class="field-row">' +
          '<div class="field"><label>시간 안에 끝냈을 때 별</label><input class="input" id="edTidyReward" type="number" min="0" max="20" value="' + S.tidyCfg.reward + '"></div>' +
          '<div class="field"><label>시간이 지나서 끝냈을 때 별</label><input class="input" id="edTidyLate" type="number" min="0" max="20" value="' + S.tidyCfg.rewardLate + '"></div>' +
        '</div>' +
        '<label class="sw-row"><input type="checkbox" id="edTidyMusic"' + (S.tidyCfg.music !== false ? ' checked' : '') + '>' +
          '<span class="sw-box" aria-hidden="true"></span><span class="sw-txt">정리 노래를 기본으로 틀기</span></label>',
      actions: [
        { label: '저장', kind: 'primary', onClick: function () {
            var vals = Array.prototype.slice.call(document.querySelectorAll('.ed-min')).map(function (inp) {
              return clampNum(inp.value, 1, 60, 10);
            });
            var uniq = [];
            vals.forEach(function (v) { if (uniq.indexOf(v) < 0) uniq.push(v); });
            S.tidyCfg = {
              mins: uniq.length ? uniq : [5, 10, 15],
              reward: clampNum((document.getElementById('edTidyReward') || {}).value, 0, 20, 3),
              rewardLate: clampNum((document.getElementById('edTidyLate') || {}).value, 0, 20, 1),
              music: !!(document.getElementById('edTidyMusic') || {}).checked
            };
            saveNow();
            render({ keepScroll: true });
            paintTidy(true);
            UI.toast('정리시간 설정을 저장했어요', { emoji: '🧹', kind: 'good' });
          } },
        { label: '닫기', kind: 'ghost' }
      ]
    });
  }

  /* ⚡ 포켓몬 관리 */
  function pkSettingsModal() {
    if (!needParent('포켓몬 관리는 부모님 모드에서 바꿀 수 있어요')) return;
    UI.modal({
      size: 'wide',
      title: '⚡ 포켓몬 관리',
      bodyHTML:
        '<div class="field"><label>진화에 필요한 별 개수 (기본 100개)</label>' +
          '<input class="input" id="edPerLevel" type="number" min="10" max="1000" step="10" value="' + pkPerLevel() + '">' +
          '<p class="help">별 100개를 모을 때마다 알 → 1단계 → 2단계 → 3단계로 진화해요. 작게 넣으면 빨리 자라요(시험해 볼 때 좋아요).<br>' +
          '아이 화면에서는 알 단계·아직 진화 전 단계의 정체가 <b>???</b> 로 가려지고, 여기서만 실제 알을 보거나 새로 뽑을 수 있어요.</p></div>' +
        D.children.map(function (c) {
          var p = pkOf(c.id);
          var sp = pkSpecies(p);
          return '<div class="ed-block">' +
            '<div class="ed-block-head"><b>' + c.emoji + ' ' + esc(c.name) + '</b>' +
              '<span id="pkSetState-' + c.id + '">' + pkStateText(c.id, true) + '</span></div>' +
            '<div class="pk-set-row">' +
              '<button type="button" class="btn btn-ghost btn-sm" data-pk="stars" data-child="' + c.id + '" data-n="10">별 ＋10</button>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-pk="stars" data-child="' + c.id + '" data-n="-10">별 －10</button>' +
              '<button type="button" class="btn btn-soft btn-sm" data-pk="reroll" data-child="' + c.id + '">🎲 알 다시 뽑기</button>' +
              '<button type="button" class="btn btn-soft btn-sm" data-pk="choose" data-child="' + c.id + '">🥚 파트너 바꾸기</button>' +
              '<button type="button" class="btn btn-danger btn-sm" data-pk="reset" data-child="' + c.id + '">↺ 처음부터</button>' +
            '</div></div>';
        }).join(''),
      actions: [
        { label: '저장', kind: 'primary', onClick: function () {
            var v = clampNum((document.getElementById('edPerLevel') || {}).value, 10, 1000, 100);
            S.pkCfg = { perLevel: v };
            saveNow();
            render({ keepScroll: true });
            UI.toast('진화에 필요한 별 ' + v + '개로 저장했어요 · 아이 태블릿에도 바로 보여요', { emoji: '⚡', kind: 'good', duration: 3200 });
          } },
        { label: '닫기', kind: 'ghost' }
      ],
      onOpen: function (wrap, close) {
        function refreshState(cid) {
          var el = document.getElementById('pkSetState-' + cid);
          if (el) el.textContent = pkStateText(cid, true);
        }
        wrap.addEventListener('click', function (e) {
          var b = e.target.closest('[data-pk]');
          if (!b) return;
          var act = b.getAttribute('data-pk');
          var cid = b.getAttribute('data-child');
          if (act === 'stars') {
            var n = Number(b.getAttribute('data-n')) || 0;
            S.stars[cid] = Math.max(0, (S.stars[cid] || 0) + n);
            saveNow();
            render({ keepScroll: true });
            refreshState(cid);
            UI.toast(childById(cid).name + ' 별 ' + (S.stars[cid]) + '개', { emoji: '⭐', kind: 'good', duration: 1400 });
          } else if (act === 'choose') {
            close();
            setTimeout(function () { pkChooserModal(cid); }, 220);
          } else if (act === 'reroll') {
            close();
            setTimeout(function () { pkReroll(cid); }, 220);
          } else if (act === 'reset') {
            var px = pkOf(cid);
            var stars0 = S.stars[cid] || 0;
            UI.confirm('포켓몬을 알 받기 전으로 돌릴까요?',
              childById(cid).name + '의 포켓몬이 알 받기 전으로 돌아가요. ' +
              '보유 별(⭐' + stars0 + ')·도감은 그대로 남고, 포켓몬에게 먹인 별만 0이 돼요. ' +
              '아이 화면에서 🥚 신비한 알 받기를 누르면 새 알이 와요.',
              '알 받기 전으로', 'danger')
              .then(function (ok) {
                if (!ok) return;
                var p2 = pkOf(cid);
                p2.line = ''; p2.cur = 0; p2.fed = 0;
                saveNow();
                render({ keepScroll: true });
                refreshState(cid);
                UI.toast(childById(cid).name + '의 포켓몬을 알 받기 전으로 돌렸어요 · 이제 🥚 알을 누르면 시작해요', { emoji: '⚡', kind: 'good', duration: 3200 });
              });
          }
        });
      }
    });
  }

  /* ================= 이벤트 ================= */
  function onViewClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');

    switch (act) {
      case 'goto': setView(el.getAttribute('data-view')); break;

      case 'pick-kid': {
        var kid = childById(el.getAttribute('data-id'));
        selectChild(kid.id);
        setView('routine');
        UI.toast(kid.name + '의 할 일을 볼게요', { emoji: kid.emoji, kind: 'good', duration: 1600 });
        break;
      }

      case 'mini-day': {
        var mk = el.getAttribute('data-date');
        calSelected = mk;
        calCursor = UI.parseKey(mk);
        setView('calendar');
        break;
      }

      case 'pick-routine-slot': routineSlot = el.getAttribute('data-slot'); render({ keepScroll: true }); break;
      case 'pick-growth-child': selectChild(el.getAttribute('data-id')); render({ keepScroll: true }); break;
      case 'pick-pk-child': selectChild(el.getAttribute('data-id')); render({ keepScroll: true }); break;
      case 'mail-mic': mailMicToggle(); break;
      case 'pick-mail-sender': selectChild(el.getAttribute('data-id')); render({ keepScroll: true }); break;
      case 'pick-mail-recipient': mailRecipient = el.getAttribute('data-id'); render({ keepScroll: true }); break;
      case 'mail-filter': mailFilter = el.getAttribute('data-id') || 'all'; render({ keepScroll: true }); break;

      case 'routine-check': {
        completeRoutine(el.getAttribute('data-child'), el.getAttribute('data-item'));
        break;
      }
      case 'routine-undo': undoRoutine(el.getAttribute('data-child'), el.getAttribute('data-item')); break;
      case 'add-routine': addRoutineModal(el.getAttribute('data-child')); break;
      case 'routine-del': removeRoutineItem(el.getAttribute('data-child'), el.getAttribute('data-item')); break;

      case 'praise': addPraise(el.getAttribute('data-child'), el.getAttribute('data-item')); break;

      case 'cal-prev': calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1); render({ keepScroll: true }); break;
      case 'cal-next': calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1); render({ keepScroll: true }); break;
      case 'cal-today': calCursor = new Date(); calSelected = todayKey(); render({ keepScroll: true }); break;
      case 'pick-day': calSelected = el.getAttribute('data-date'); render({ keepScroll: true }); break;
      case 'add-event': addEventModal(calSelected); break;
      case 'del-event': deleteEvent(el.getAttribute('data-id')); break;
      case 'prep-check': togglePrep(el.getAttribute('data-ev'), el.getAttribute('data-id')); break;

      case 'pick-picto': {
        var pid = el.getAttribute('data-id');
        window.__pictos = window.__pictos || [];
        var i = window.__pictos.indexOf(pid);
        if (i >= 0) window.__pictos.splice(i, 1);
        else window.__pictos.push(pid);
        el.classList.toggle('active');
        var cnt = document.getElementById('mailCounter');
        if (cnt) cnt.textContent = (window.__pictos.length) + '개 골랐어요';
        break;
      }
      case 'send-mail': sendLetter(); break;
      case 'read-letter': readLetter(el.getAttribute('data-id')); break;
      case 'quick-reply': sendReply(el.getAttribute('data-id'), el.getAttribute('data-text'), el.getAttribute('data-emoji')); break;
      case 'send-reply': sendReply(el.getAttribute('data-id')); break;

      /* ✍️ 손글씨 편지 */
      case 'hw-color': HW.color = el.getAttribute('data-color') || '#4A3F35'; HW.eraser = false; hwPaintTools(); break;
      case 'hw-size': HW.size = Number(el.getAttribute('data-size')) || 7; HW.eraser = false; hwPaintTools(); break;
      case 'hw-eraser': HW.eraser = !HW.eraser; hwPaintTools(); break;
      case 'hw-clear': hwReset(); UI.toast('종이를 새로 폈어요', { emoji: '📄', duration: 1500 }); break;
      case 'send-hand': sendHandLetter(); break;
      case 'view-hw': viewHandwriting(el.getAttribute('data-id')); break;

      /* 🌅 등교 시작 · 🧹 정리시간 */
      case 'school-open': openSchoolMode(); break;
      case 'tidy-start': startTidy(el.getAttribute('data-min'), el.getAttribute('data-id')); break;
      case 'school-settings': schoolSettingsModal(); break;
      case 'tidy-settings': tidySettingsModal(); break;
      case 'pk-settings': pkSettingsModal(); break;
      case 'edit-routines': setView('routine'); UI.toast(S.mode === 'parent' ? '할 일 탭에서 ＋ 할 일 추가 · 🗑️ 로 고쳐요' : '아침·저녁 할 일은 부모님 모드에서 고칠 수 있어요', { emoji: '✅', duration: 2800 }); break;

      /* ⚡ 포켓몬 */
      case 'pk-pick': pkPick(el.getAttribute('data-child'), el.getAttribute('data-id')); break;
      case 'pk-feed': pkFeed(el.getAttribute('data-child'), Number(el.getAttribute('data-n'))); break;
      case 'pk-chooser': pkChooserModal(el.getAttribute('data-child')); break;
      case 'pk-test': pkTestStars(el.getAttribute('data-child')); break;

      case 'pick-dish': pickDishModal(el.getAttribute('data-slot')); break;
      case 'set-level': setMealLevel(el.getAttribute('data-child'), el.getAttribute('data-slot'), el.getAttribute('data-level')); break;

      case 'med-check': {
        if (!needParent('약 체크는 부모님 모드에서 할 수 있어요')) return;
        var td = todayKey();
        S.medLog[td] = S.medLog[td] || {};
        S.medLog[td][el.getAttribute('data-id')] = Date.now();
        save(); render({ keepScroll: true });
        UI.toast('약을 챙겼어요', { emoji: '💊', kind: 'good' });
        break;
      }
      case 'med-undo': {
        if (!needParent()) return;
        var td2 = todayKey();
        if (S.medLog[td2]) delete S.medLog[td2][el.getAttribute('data-id')];
        save(); render({ keepScroll: true });
        break;
      }
      case 'add-med': addMedModal(); break;
      case 'del-med': {
        if (!needParent()) return;
        var mid = el.getAttribute('data-id');
        var med = S.meds.filter(function (m) { return m.id === mid; })[0];
        if (!med) return;
        UI.confirm('약을 지울까요?', '“' + med.name + '”(' + med.memberName + ')을 목록에서 지웁니다.', '지우기', 'danger').then(function (ok) {
          if (!ok) return;
          S.meds = S.meds.filter(function (m) { return m.id !== mid; });
          save(); render({ keepScroll: true });
        });
        break;
      }
      case 'add-growth': addGrowthModal(); break;
      case 'del-growth': {
        if (!needParent()) return;
        var gc = el.getAttribute('data-child');
        var gd = el.getAttribute('data-date');
        UI.confirm('기록을 지울까요?', gd + ' 기록을 삭제합니다.', '지우기', 'danger').then(function (ok) {
          if (!ok) return;
          S.growth[gc] = (S.growth[gc] || []).filter(function (r) { return r.date !== gd; });
          save(); render({ keepScroll: true });
        });
        break;
      }
      case 'growth-metric': growthMetric = el.getAttribute('data-metric'); render({ keepScroll: true }); break;

      case 'edit-notice': editNoticeModal(); break;
      case 'notice-check': toggleNoticeItem(el.getAttribute('data-id')); break;

      case 'pick-status': pickStatusModal(el.getAttribute('data-id')); break;
      case 'shop-add': addShoppingFromInput(); break;
      case 'shop-toggle': toggleShopping(el.getAttribute('data-id')); break;
      case 'shop-del': removeShopping(el.getAttribute('data-id')); break;
      case 'banner-send': sendBannerFromCompose(); break;
      case 'banner-clear': clearBanner(); break;
      case 'banner-quick': fillBannerInput(el.getAttribute('data-text')); break;
      case 'alert-toggle': toggleAlert(el.getAttribute('data-key')); break;
      case 'alert-test': chime(); UI.toast('이렇게 알려드릴게요', { emoji: '🔔' }); break;
      case 'ntfy-toggle': toggleNtfyPush(); break;
      case 'copy-ntfy-topic': copyNtfyTopic(); break;
      case 'ntfy-test': sendTestPush(); break;

      case 'change-code': changeGateCode(); break;
      case 'copy-key': copyFamilyId(); break;
      case 'lock-device': lockDevice(); break;
      case 'fb-retry': retryCloud(); break;

      case 'fb-connect': connectFirebaseUI(); break;
      case 'fb-disconnect': {
        UI.confirm('연결을 해제할까요?', '이 기기 저장 방식으로 돌아갑니다. Firestore에 있던 데이터는 그대로 남아요.', '해제', 'danger')
          .then(function (ok) {
            if (!ok) return;
            Storage.disableFirebase().then(function () {
              render({ keepScroll: true });
              UI.toast('이 기기 저장으로 돌아왔어요');
            });
          });
        break;
      }
      case 'export': exportData(); break;
      case 'import': {
        var inp = document.getElementById('importFile');
        if (inp) inp.click();
        break;
      }
      case 'reset': {
        UI.confirm('전체 초기화', '칭찬·일정·편지·식판·성장 기록이 모두 지워집니다. 되돌릴 수 없어요. 계속할까요?', '초기화', 'danger')
          .then(function (ok) {
            if (!ok) return;
            S = defaultState();
            S.introSeen = false;
            save();
            render();
            showIntro();
          });
        break;
      }
    }
  }

  function connectFirebaseUI() {
    var apiKey = (document.getElementById('fbApiKey') || {}).value || '';
    var authDomain = (document.getElementById('fbAuthDomain') || {}).value || '';
    var projectId = (document.getElementById('fbProjectId') || {}).value || '';
    var appId = (document.getElementById('fbAppId') || {}).value || '';

    if (!apiKey.trim() || !projectId.trim()) {
      UI.toast('apiKey와 projectId는 꼭 필요해요', { kind: 'warn' });
      return;
    }
    UI.toast('Firebase에 연결하는 중...', { emoji: '🔄', duration: 1800 });
    Storage.enableFirebase({
      apiKey: apiKey.trim(), authDomain: authDomain.trim(), projectId: projectId.trim(),
      appId: appId.trim()
    }).then(function (res) {
      if (res.remote) {
        UI.modal({
          title: '이미 저장된 가족 데이터가 있어요',
          bodyHTML: '<p class="modal-text">Firestore에 이전에 저장한 데이터가 있습니다. 어떻게 할까요?</p>',
          actions: [
            {
              label: '저장된 데이터 가져오기', kind: 'primary', onClick: function (close) {
                S = normalize(res.remote);
                save();
                close();
                render();
                UI.toast('Firestore 데이터를 가져왔어요', { emoji: '🔄', kind: 'good' });
              }
            },
            {
              label: '이 기기 데이터로 덮어쓰기', kind: 'ghost', onClick: function (close) {
                Storage.save(S, { immediate: true });
                close();
                render();
                UI.toast('이 기기 데이터를 올렸어요', { emoji: '☁️', kind: 'good' });
              }
            }
          ]
        });
      } else {
        Storage.save(S, { immediate: true });
        render({ keepScroll: true });
        UI.confetti(18);
        UI.toast('Firebase 실시간 동기화가 연결됐어요', { emoji: '☁️', kind: 'good', duration: 3400 });
      }
      setSyncBanner(null);
    }).catch(function (err) {
      UI.toast('연결 실패: ' + shortErr(err), { kind: 'warn', duration: 5000 });
    });
  }

  function exportData() {
    var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'urijip-damoa-' + todayKey() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    UI.toast('파일로 내려받았어요', { emoji: '📥', kind: 'good' });
  }

  function onImportFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result));
        S = normalize(data.state || data);
        save();
        render();
        UI.toast('데이터를 가져왔어요', { emoji: '📤', kind: 'good' });
      } catch (err) {
        UI.toast('파일을 읽지 못했어요', { kind: 'warn' });
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  /* ================= 시작 ================= */
  function bindChrome() {
    document.getElementById('tabs').addEventListener('click', function (e) {
      var b = e.target.closest('.tab');
      if (b) setView(b.getAttribute('data-view'));
    });
    document.getElementById('modeChild').addEventListener('click', function () { setMode('child'); });
    document.getElementById('modeParent').addEventListener('click', function () { setMode('parent'); });
    document.getElementById('view').addEventListener('click', onViewClick);
    document.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'importFile') onImportFile(e);
      if (e.target && e.target.id === 'deviceName') {
        setDeviceName(e.target.value);
        UI.toast('이 기기 이름을 저장했어요', { emoji: '📱', kind: 'good' });
      }
    });
    document.getElementById('view').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !e.target) return;
      if (e.target.id === 'shopInput') { e.preventDefault(); addShoppingFromInput(); }
      else if (e.target.id === 'bannerInput') { e.preventDefault(); sendBannerFromCompose(); }
    });

    var gateForm = document.getElementById('gateForm');
    if (gateForm) gateForm.addEventListener('submit', onGateSubmit);
    var eye = document.getElementById('gateEye');
    if (eye) eye.addEventListener('click', function () {
      var i = document.getElementById('gateInput');
      if (!i) return;
      i.type = i.type === 'password' ? 'text' : 'password';
      eye.classList.toggle('on', i.type === 'text');
      i.focus();
    });
    var retry = document.getElementById('syncBannerRetry');
    if (retry) retry.addEventListener('click', retryCloud);
    var bannerBtn = document.getElementById('bannerBtn');
    if (bannerBtn) bannerBtn.addEventListener('click', bannerComposeModal);
    bindPopupRoot();
  }

  var VIEWS = {
    home: renderHome,
    routine: renderRoutine,
    pokemon: renderPokemon,
    praise: renderPraise,
    calendar: renderCalendar,
    mailbox: renderMailbox,
    health: renderHealth,
    settings: renderSettings
  };
  window.__VIEWS = VIEWS;

  /* 다른 기기에서 바뀐 가족 데이터가 도착했을 때 */
  function onRemoteState(state, err) {
    if (err) { setSyncBanner(err); return; }
    if (!state) return;
    var keep = S ? { mode: S.mode, actor: S.actor } : null;
    S = normalize(state);
    if (keep) { S.mode = keep.mode; S.actor = keep.actor; }
    render({ keepScroll: true });
    maybeShowBanner();
    checkNewMessages();
  }

  /* 잠금을 풀었거나 열쇠가 있는 기기에서 대시보드를 엽니다 */
  async function startApp() {
    var res = await Storage.init(onRemoteState);
    S = normalize(res.state);
    var bootEv = newestMessageEvent();
    lastMsgAt = bootEv ? bootEv.ts : Date.now();
    if (res.error) {
      setSyncBanner(res.error);
      UI.toast('가족 클라우드 연결에 실패해 이 기기에만 저장해요', { kind: 'warn', duration: 5000 });
    } else {
      setSyncBanner(null);
    }
    Storage.watchLocal(function (state) {
      S = normalize(state);
      render({ keepScroll: true });
    });
    /* ?view=health 처럼 탭으로 바로 열기 */
    try {
      var wanted = new URLSearchParams(location.search).get('view');
      if (wanted && VIEWS[wanted]) view = wanted;
    } catch (e) {}
    render();
    if (!S.introSeen) showIntro();
    save();
    maybeShowBanner();
  }

  /* ---------- 가족 입장(잠금) 화면 ---------- */
  function showGate() {
    var gate = document.getElementById('gate');
    var shell = document.getElementById('appShell');
    if (shell) shell.hidden = true;
    if (gate) gate.hidden = false;
    document.body.classList.add('gated');
    if (!Storage.status.secure) {
      var w = document.getElementById('gateWarn');
      if (w) {
        w.hidden = false;
        w.textContent = '⚠️ 지금 주소에서는 암호화 기능이 제한돼요. 기기끼리 열쇠를 맞추려면 https 주소(byul1x4-cyber.github.io)로 열어 주세요.';
      }
    }
    setTimeout(function () {
      var i = document.getElementById('gateInput');
      if (i && window.innerWidth > 720) i.focus();
    }, 120);
  }

  async function onGateSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    var input = document.getElementById('gateInput');
    var errEl = document.getElementById('gateErr');
    var btn = document.getElementById('gateSubmit');
    var warnEl = document.getElementById('gateWarn');
    var code = ((input && input.value) || '').trim();

    if (warnEl && !warnEl.textContent) warnEl.hidden = true;
    if (errEl) errEl.hidden = true;

    if (code.replace(/\s+/g, '').length < Storage.MIN_CODE_LEN) {
      if (errEl) {
        errEl.textContent = '가족 입장 코드는 ' + Storage.MIN_CODE_LEN + '자 이상으로 정해 주세요.';
        errEl.hidden = false;
      }
      if (input) input.focus();
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = '들어가는 중...'; }
    try {
      await Storage.enter(code);
      var gate = document.getElementById('gate');
      var shell = document.getElementById('appShell');
      if (gate) gate.hidden = true;
      document.body.classList.remove('gated');
      if (shell) shell.hidden = false;
      if (input) input.value = '';
      await startApp();
    } catch (err) {
      if (errEl) {
        errEl.textContent = '들어가지 못했어요: ' + shortErr(err);
        errEl.hidden = false;
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '들어가기'; }
    }
  }

  async function init() {
    bindChrome();
    startClock();
    initStopTimer();
    if (Storage.hasGate()) await startApp();
    else showGate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
