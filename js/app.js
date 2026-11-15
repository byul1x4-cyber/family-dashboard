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
  var praiseChild = D.children[0].id;
  var mealChild = D.children[0].id;
  var growthChild = D.children[0].id;
  var growthMetric = 'height';
  var mailTab = D.mailRecipients[0].id;
  var mailSender = D.children[0].id;
  var mailRecipient = D.mailRecipients[0].id;

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
      money: { minguk: 0, ijun: 0 },
      moneyLog: [],
      praiseLog: [],
      events: [],
      messages: [],
      meals: {},
      meds: [],
      medLog: {},
      growth: g
    };
  }

  function normalize(raw) {
    var base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    var s = Object.assign({}, base, raw);

    ['stars', 'praiseCount', 'money', 'routine', 'celebrated', 'meals', 'medLog'].forEach(function (k) {
      s[k] = Object.assign({}, base[k], (raw[k] && typeof raw[k] === 'object') ? raw[k] : {});
    });
    ['moneyLog', 'praiseLog', 'events', 'messages', 'meds'].forEach(function (k) {
      s[k] = Array.isArray(raw[k]) ? raw[k] : [];
    });
    s.growth = Object.assign({}, base.growth, (raw.growth && typeof raw.growth === 'object') ? raw.growth : {});
    D.children.forEach(function (c) { if (!Array.isArray(s.growth[c.id])) s.growth[c.id] = []; });
    if (s.mode !== 'parent') s.mode = 'child';
    return s;
  }

  function save() { Storage.save(S); }

  function needParent(message) {
    if (S.mode === 'parent') return true;
    UI.toast(message || '부모님 모드에서 할 수 있어요', { emoji: '🔒', kind: 'warn' });
    return false;
  }

  /* ---------------- 공통 계산 ---------------- */
  function childById(id) {
    return D.children.filter(function (c) { return c.id === id; })[0] || D.children[0];
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
    var r = D.routines[childId] || { morning: [], evening: [] };
    return { morning: r.morning || [], evening: r.evening || [] };
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
      askActor();
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
      bodyHTML: '<p class="modal-text">부모님 모드로 바꾸면 루틴 완료 확인, 칭찬, 저금통, 일정·식판·성장 기록을 관리할 수 있어요.</p>' +
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
      bodyHTML: '<p class="modal-text">루틴 체크, 칭찬과 돼지저금통, 가족 일정, 우체통, 식판·약·성장 기록을 한 곳에 모았어요.<br>누구로 시작할까요?</p>' +
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
    if (opts.keepScroll) window.scrollTo(0, y);
    else if (opts.scrollTop) window.scrollTo(0, 0);
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
  }

  /* ================= 홈 ================= */
  function renderHome() {
    var today = todayKey();
    var hour = new Date().getHours();
    var greet = hour < 11 ? '좋은 아침이에요' : hour < 17 ? '즐거운 오후예요' : hour < 21 ? '오늘 하루도 수고했어요' : '편안한 밤 보내세요';
    var who = S.mode === 'parent' ? ((S.actor || '부모님') + '님') : '우리 가족';

    var doneTotal = 0, allTotal = 0;
    D.children.forEach(function (c) {
      var st = routineStats(c.id, today);
      doneTotal += st.done; allTotal += st.total;
    });

    var tiles = [
      { act: 'goto', view: 'routine', cls: 't-sun', ico: '✅', title: '오늘 할 일', sub: (allTotal - doneTotal) + '개 남았어요', badge: allTotal - doneTotal > 0 ? (allTotal - doneTotal) : '' },
      { act: 'goto', view: 'mailbox', cls: 't-rose', ico: '📮', title: '가족 우체통', sub: unreadTotal() > 0 ? '새 편지 ' + unreadTotal() + '통' : '새 편지가 없어요', badge: unreadTotal() || '' },
      { act: 'goto', view: 'health', cls: 't-mint', ico: '🍱', title: '오늘의 식판', sub: mealsTodayCount() + '/' + D.children.length + '명 기록' },
      { act: 'goto', view: 'health', cls: 't-lav', ico: '💊', title: '오늘의 약', sub: S.meds.length ? (medPending() ? medPending() + '개 남았어요' : '모두 챙겼어요') : '등록된 약이 없어요' }
    ];

    var upcoming = upcomingEvents(3, 60);

    return '' +
      '<div class="home-hero">' +
        '<div class="hello">' +
          '<p class="hi">' + UI.dateKo(today) + '</p>' +
          '<h2>' + esc(who) + ', ' + greet + ' 💛</h2>' +
          '<div class="today-line">' +
            '<span class="badge mint">오늘 루틴 ' + doneTotal + '/' + allTotal + '</span>' +
            '<span class="badge sun">다가오는 일정 ' + upcomingEvents(99, 60).length + '개</span>' +
            (unreadTotal() ? '<span class="badge rose">새 편지 ' + unreadTotal() + '통</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="home-children">' + D.children.map(kidCardHTML).join('') + '</div>' +
      '</div>' +

      '<div class="quick-grid" style="margin-bottom:12px">' +
        tiles.map(function (t) {
          return '<button type="button" class="quick-tile ' + t.cls + '" data-act="' + t.act + '" data-view="' + t.view + '">' +
            (t.badge ? '<span class="q-badge">' + t.badge + '</span>' : '') +
            '<span class="q-ico">' + t.ico + '</span>' +
            '<strong>' + esc(t.title) + '</strong>' +
            '<small>' + esc(t.sub) + '</small>' +
            '</button>';
        }).join('') +
      '</div>' +

      '<div class="two-col">' +
        '<div class="card soft-sun">' +
          cardHead('📅', '다가오는 일정', '우리 가족', '<button type="button" class="link-btn" data-act="goto" data-view="calendar">달력 보기</button>') +
          (upcoming.length ? '<div class="ev-list">' + upcoming.map(function (e) { return evItemHTML(e, true); }).join('') + '</div>'
            : '<div class="empty"><span class="big">🗓️</span>아직 등록된 일정이 없어요.<br>부모님 모드에서 일정을 추가해 보세요.</div>') +
        '</div>' +
        '<div class="card">' +
          cardHead('⭐', '최근 기록', '칭찬과 저금통', '<button type="button" class="link-btn" data-act="goto" data-view="praise">전체 보기</button>') +
          recentLogsHTML(5) +
        '</div>' +
      '</div>';
  }

  function cardHead(ico, title, sub, right) {
    return '<div class="card-head"><span class="ico">' + ico + '</span>' +
      '<div><h2>' + esc(title) + '</h2>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>' +
      '<div class="spacer"></div>' + (right || '') + '</div>';
  }

  function kidCardHTML(c) {
    var today = todayKey();
    var st = routineStats(c.id, today);
    var pct = st.total ? Math.round(st.done / st.total * 100) : 0;
    return '<div class="kid-card ' + c.color + '">' +
      '<div class="avatar ' + c.color + '">' + c.emoji + '</div>' +
      '<div class="kid-main">' +
        '<div class="kid-name"><strong>' + esc(c.name) + '</strong><span>' + esc(c.tag) + '</span></div>' +
        '<div class="kid-stats">' +
          '<span class="stat-pill">⭐ <b>' + (S.stars[c.id] || 0) + '</b></span>' +
          '<span class="stat-pill">🏅 <b>' + (S.praiseCount[c.id] || 0) + '</b></span>' +
          '<span class="stat-pill">🐷 <b>' + UI.won(S.money[c.id] || 0) + '</b></span>' +
        '</div>' +
        '<div class="progress ' + (c.color === 'coral' ? 'coral' : '') + '"><i style="width:' + pct + '%"></i></div>' +
        '<div class="progress-label"><span>오늘 루틴 ' + st.done + '/' + st.total + '</span><span>' + pct + '%</span></div>' +
      '</div>' +
    '</div>';
  }

  function evItemHTML(e, compact) {
    var color = memberColor(e.member);
    return '<div class="ev-item ' + color + '">' +
      '<div class="ev-main">' +
        '<div class="ev-title">' + esc(e.title) + '</div>' +
        '<div class="ev-meta">' +
          '<span class="badge ' + color + '">' + esc(memberName(e.member)) + '</span>' +
          '<span>' + (compact ? UI.shortDateKo(e.date) : '') + (e.time ? ' ' + esc(e.time) : '') + '</span>' +
          (e.note ? '<span>· ' + esc(e.note) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<span class="ev-dday' + (dday(e.date) === '오늘' ? ' today' : '') + '">' + dday(e.date) + '</span>' +
      (S.mode === 'parent' && !compact
        ? '<button type="button" class="icon-btn" data-act="del-event" data-id="' + e.id + '" aria-label="일정 삭제">🗑</button>' : '') +
    '</div>';
  }

  function recentLogsHTML(limit) {
    var list = [];
    S.praiseLog.forEach(function (l) {
      list.push({ ts: l.ts, html: logItemHTML({
        emoji: l.emoji || '⭐',
        main: '<b>' + esc(childById(l.childId).name) + '</b> 칭찬 · ' + esc(l.item || ''),
        by: l.by ? ' · ' + esc(l.by) : '',
        ts: l.ts
      }) });
    });
    S.moneyLog.forEach(function (l) {
      list.push({ ts: l.ts, html: logItemHTML({
        emoji: '🐷',
        main: '<b>' + esc(childById(l.childId).name) + '</b> ' + esc(l.note || '저금통'),
        delta: l.delta,
        ts: l.ts
      }) });
    });
    list.sort(function (a, b) { return b.ts - a.ts; });
    if (!list.length) {
      return '<div class="empty"><span class="big">🌱</span>아직 기록이 없어요.<br>칭찬을 하면 여기에 차곡차곡 쌓여요.</div>';
    }
    return '<div class="log-list">' + list.slice(0, limit).map(function (x) { return x.html; }).join('') + '</div>';
  }

  function logItemHTML(o) {
    var deltaHtml = '';
    if (typeof o.delta === 'number') {
      deltaHtml = '<span class="l-delta ' + (o.delta > 0 ? 'plus' : 'minus') + '">' + (o.delta > 0 ? '+' : '−') + Math.abs(o.delta).toLocaleString('ko-KR') + '원</span>';
    }
    return '<div class="log-item">' +
      '<span>' + (o.emoji || '•') + '</span>' +
      '<div class="l-main">' + o.main + (o.by || '') + '</div>' +
      deltaHtml +
      '<span class="l-time">' + UI.ago(o.ts) + '</span>' +
    '</div>';
  }

  /* ================= 루틴 ================= */
  function renderRoutine() {
    var today = todayKey();
    var c = childById(routineChild);
    var items = routineItems(c.id);
    var st = routineStats(c.id, today);
    var pct = st.total ? Math.round(st.done / st.total * 100) : 0;

    function group(title, emoji, list, slot) {
      return '<div class="routine-group">' +
        '<h3><span>' + emoji + '</span>' + esc(title) + ' <span class="badge mint" style="margin-left:4px">' +
          list.filter(function (i) { return isDone(i.id, today); }).length + '/' + list.length + '</span></h3>' +
        '<div class="routine-list">' + list.map(function (i) {
          var done = isDone(i.id, today);
          var ts = done ? S.routine[today][i.id] : null;
          return '<div class="routine-item' + (done ? ' done' : '') + '">' +
            '<div class="r-emoji">' + i.emoji + '</div>' +
            '<div class="r-label">' + esc(i.label) +
              (done ? '<div class="r-time">' + UI.timeKo(ts) + ' 완료</div>' : '') + '</div>' +
            (done
              ? '<button type="button" class="routine-check" aria-label="완료함">✓</button>' +
                (S.mode === 'parent' ? '<button type="button" class="icon-btn" data-act="routine-undo" data-child="' + c.id + '" data-item="' + i.id + '" aria-label="되돌리기">↩</button>' : '')
              : '<button type="button" class="btn btn-soft btn-sm" data-act="routine-check" data-child="' + c.id + '" data-item="' + i.id + '">다 했어요!</button>') +
          '</div>';
        }).join('') + '</div>' +
      '</div>';
    }

    return '<div class="card soft-mint routine-card">' +
        '<div class="routine-head">' +
          D.children.map(function (k) {
            return '<button type="button" class="chip ' + k.color + (k.id === c.id ? ' active' : '') + '" data-act="pick-routine-child" data-id="' + k.id + '">' +
              k.emoji + ' ' + esc(k.name) + '</button>';
          }).join('') +
          '<span style="flex:1"></span>' +
          '<span class="badge mint">오늘 ' + st.done + '/' + st.total + ' · ' + pct + '%</span>' +
        '</div>' +
        '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
        '<p class="help" style="margin-top:8px">‘다 했어요!’를 누르면 부모님 확인 문제가 나와요. 답을 맞혀야 완료돼요.</p>' +
      '</div>' +

      '<div class="two-col">' +
        '<div class="card">' + cardHead('🌅', '아침 루틴', esc(c.name) + '의 아침') + group('아침', '🌅', items.morning, 'morning') + '</div>' +
        '<div class="card">' + cardHead('🌙', '저녁 루틴', esc(c.name) + '의 저녁') + group('저녁', '🌙', items.evening, 'evening') + '</div>' +
      '</div>' +

      '<div class="lock-note">🔒 완료한 일은 부모님 모드에서 되돌릴 수 있어요. 완료할 때마다 별 ⭐ 1개가 쌓여요.</div>';
  }

  /* 부모 확인 곱셈 문제 */
  function askQuiz(onPass, itemLabel) {
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
          '<p class="quiz-sub">' + esc(itemLabel || '') + ' 완료!<br>부모님이 답을 확인해 주세요.</p>' +
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

  /* ================= 칭찬 · 저금통 ================= */
  function renderPraise() {
    var c = childById(praiseChild);
    return '<div class="praise-grid">' +
      '<div class="card soft-rose">' +
        cardHead('🏅', '칭찬하기', '칭찬하면 별 ⭐ 1개') +
        '<div class="pick-child">' + D.children.map(function (k) {
          return '<button type="button" class="' + (k.id === c.id ? 'active ' + (k.color === 'coral' ? 'coral' : '') : '') + '" data-act="pick-praise-child" data-id="' + k.id + '">' +
            '<span class="avatar sm ' + k.color + '">' + k.emoji + '</span>' + esc(k.name) +
            ' <span class="badge sun">⭐ ' + (S.stars[k.id] || 0) + '</span></button>';
        }).join('') + '</div>' +
        '<div class="praise-items">' + D.praiseItems.map(function (p) {
          return '<button type="button" class="praise-item" data-act="praise" data-child="' + c.id + '" data-item="' + p.id + '">' +
            '<span>' + p.emoji + '</span>' + esc(p.label) + '</button>';
        }).join('') + '</div>' +
        (S.mode === 'parent' ? '' : '<div class="lock-note">🔒 칭찬은 부모님 모드에서 할 수 있어요.</div>') +
      '</div>' +

      '<div class="card piggy-card">' +
        cardHead('🐷', '돼지저금통', '칭찬받은 만큼 차곡차곡') +
        D.children.map(function (k) {
          return '<div class="piggy-row">' +
            '<div class="piggy-who"><span class="avatar sm ' + k.color + '">' + k.emoji + '</span>' + esc(k.name) +
              '<span class="badge mint">⭐ ' + (S.stars[k.id] || 0) + '</span></div>' +
            '<div class="piggy-amount">🐷 ' + UI.won(S.money[k.id] || 0) + '</div>' +
            '<div class="piggy-actions">' +
              '<button type="button" class="btn btn-primary" data-act="money" data-child="' + k.id + '" data-key="plus100">+100원</button>' +
              '<button type="button" class="btn btn-sun" data-act="money" data-child="' + k.id + '" data-key="plus500">+500원</button>' +
              '<button type="button" class="btn btn-ghost" data-act="money" data-child="' + k.id + '" data-key="minus100">-100원</button>' +
              '<button type="button" class="btn btn-soft" data-act="money" data-child="' + k.id + '" data-key="cash">현금 줬어요</button>' +
            '</div>' +
          '</div>';
        }).join('') +
        '<div style="margin-top:10px">' + cardHead('🧾', '최근 기록', '칭찬 · 저금통') + recentLogsHTML(12) + '</div>' +
      '</div>' +
    '</div>';
  }

  function addPraise(childId, itemId) {
    if (!needParent('칭찬은 부모님 모드에서 할 수 있어요')) return;
    var item = D.praiseItems.filter(function (p) { return p.id === itemId; })[0];
    if (!item) return;
    S.praiseLog.unshift({
      id: UI.uid('praise'), childId: childId, item: item.label, emoji: item.emoji, by: S.actor || '부모님', ts: Date.now()
    });
    S.stars[childId] = (S.stars[childId] || 0) + 1;
    S.praiseCount[childId] = (S.praiseCount[childId] || 0) + 1;
    save();
    render({ keepScroll: true });
    UI.confetti(14);
    UI.toast(childById(childId).name + '이를 칭찬했어요! 별 ⭐ 1개', { emoji: item.emoji, kind: 'good' });
  }

  function moneyAction(childId, key) {
    if (!needParent('저금통은 부모님 모드에서 관리할 수 있어요')) return;
    var c = childById(childId);
    var cur = S.money[childId] || 0;

    if (key === 'cash') {
      if (cur <= 0) { UI.toast('줄 현금이 없어요', { emoji: '🐷' }); return; }
      UI.confirm('현금으로 줬나요?', c.name + '의 저금통 ' + UI.won(cur) + '을 현금으로 드리고 저금통을 0원으로 비울까요?',
        '현금 줬어요', 'sun').then(function (ok) {
        if (!ok) return;
        S.money[childId] = 0;
        S.moneyLog.unshift({ id: UI.uid('money'), childId: childId, delta: -cur, note: '현금으로 줬어요', ts: Date.now() });
        save();
        render({ keepScroll: true });
        UI.toast(c.name + '에게 ' + UI.won(cur) + '을 현금으로 줬어요', { emoji: '💵', kind: 'good' });
      });
      return;
    }

    var delta = key === 'plus100' ? 100 : key === 'plus500' ? 500 : key === 'minus100' ? -100 : 0;
    if (!delta) return;
    if (delta < 0 && cur <= 0) { UI.toast('저금통이 비어 있어요', { emoji: '🐷' }); return; }
    var next = Math.max(0, cur + delta);
    var realDelta = next - cur;
    S.money[childId] = next;
    S.moneyLog.unshift({
      id: UI.uid('money'), childId: childId, delta: realDelta,
      note: realDelta > 0 ? '저금통에 넣었어요' : '저금통에서 뺐어요', ts: Date.now()
    });
    save();
    render({ keepScroll: true });
    UI.toast(c.name + ' 돼지저금통 ' + (realDelta > 0 ? '+' : '−') + Math.abs(realDelta) + '원', { emoji: '🐷', kind: 'good' });
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
            ? '<button type="button" class="btn btn-primary btn-sm" data-act="add-event">＋ 일정 추가</button>'
            : '<span class="badge lav">🔒 추가는 부모님 모드</span>') +
        '</div>' +
        '<div class="ev-list" style="margin-top:10px">' +
          (sel.length ? sel.map(function (e) { return evItemHTML(e, false); }).join('')
            : '<div class="empty"><span class="big">📭</span>이 날은 일정이 없어요.</div>') +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        cardHead('⏰', '다가오는 일정', '앞으로 3개월') +
        (upcoming.length ? '<div class="ev-list">' + upcoming.map(function (e) {
          return '<div class="ev-item ' + memberColor(e.member) + '">' +
            '<div class="ev-main"><div class="ev-title">' + esc(e.title) + '</div>' +
            '<div class="ev-meta"><span class="badge ' + memberColor(e.member) + '">' + esc(memberName(e.member)) + '</span>' +
            '<span>' + UI.shortDateKo(e.date) + (e.time ? ' ' + esc(e.time) : '') + '</span></div></div>' +
            '<span class="ev-dday' + (dday(e.date) === '오늘' ? ' today' : '') + '">' + dday(e.date) + '</span>' +
            (S.mode === 'parent' ? '<button type="button" class="icon-btn" data-act="del-event" data-id="' + e.id + '" aria-label="일정 삭제">🗑</button>' : '') +
          '</div>';
        }).join('') + '</div>'
          : '<div class="empty"><span class="big">🗓️</span>등록된 일정이 없어요.<br>달력에서 날짜를 고르고 추가해 보세요.</div>') +
      '</div>' +
    '</div>';
  }

  function addEventModal(presetDate) {
    if (!needParent('일정은 부모님 모드에서 추가할 수 있어요')) return;
    UI.modal({
      title: '일정 추가',
      bodyHTML: '<div class="field"><label>누구 일정인가요?</label><select class="select" id="evMember">' +
          D.scheduleMembers.map(function (m) {
            return '<option value="' + m.id + '">' + esc(m.name) + '</option>';
          }).join('') + '</select></div>' +
        '<div class="field"><label>일정 이름</label><input class="input" id="evTitle" placeholder="예: 수영 대회, 할머니 생신"></div>' +
        '<div class="field-row">' +
          '<div class="field"><label>날짜</label><input class="input" id="evDate" type="date" value="' + (presetDate || calSelected) + '"></div>' +
          '<div class="field"><label>시간 (선택)</label><input class="input" id="evTime" type="time"></div>' +
        '</div>' +
        '<div class="field"><label>메모 (선택)</label><input class="input" id="evNote" placeholder="준비물, 장소 등"></div>',
      actions: [
        {
          label: '추가하기', kind: 'primary', onClick: function (close) {
            var title = document.getElementById('evTitle').value.trim();
            var date = document.getElementById('evDate').value;
            if (!title) { UI.toast('일정 이름을 적어 주세요', { kind: 'warn' }); return false; }
            if (!date) { UI.toast('날짜를 골라 주세요', { kind: 'warn' }); return false; }
            S.events.push({
              id: UI.uid('ev'),
              title: title,
              date: date,
              time: document.getElementById('evTime').value || '',
              member: document.getElementById('evMember').value,
              note: document.getElementById('evNote').value.trim(),
              createdBy: S.actor || '부모님',
              ts: Date.now()
            });
            calSelected = date;
            calCursor = UI.parseKey(date);
            save();
            close();
            render({ keepScroll: true });
            UI.toast('일정을 추가했어요', { emoji: '📅', kind: 'good' });
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
    var rec = D.mailRecipients.filter(function (r) { return r.id === mailTab; })[0] || D.mailRecipients[0];
    var letters = S.messages.filter(function (m) { return m.toId === rec.id; })
      .sort(function (a, b) { return b.ts - a.ts; });

    /* 보이는 편지는 읽음 처리 (배지 계산에만 사용) */
    var changed = false;
    letters.forEach(function (m) { if (!m.read) { m.read = true; changed = true; } });
    if (changed) save();

    var hourAgo = Date.now() - 3600 * 1000;
    var sentLastHour = S.messages.filter(function (m) { return m.fromId === mailSender && m.ts > hourAgo; }).length;

    return '<div class="mail-layout">' +
      '<div class="card soft-rose">' +
        cardHead('✏️', '그림 편지 쓰기', '누구에게, 무슨 말을 할까요?') +
        '<div class="pick-child">' + D.children.map(function (k) {
          return '<button type="button" class="' + (k.id === mailSender ? 'active ' + (k.color === 'coral' ? 'coral' : '') : '') + '" data-act="pick-mail-sender" data-id="' + k.id + '">' +
            '<span class="avatar sm ' + k.color + '">' + k.emoji + '</span>' + esc(k.name) + '</button>';
        }).join('') + '</div>' +
        '<div class="mail-recipients">' + D.mailRecipients.map(function (r) {
          return '<button type="button" class="mail-recipient' + (r.id === mailRecipient ? ' active' : '') + '" data-act="pick-mail-recipient" data-id="' + r.id + '">' +
            '<span class="emoji">' + r.emoji + '</span>' + esc(r.name) + '</button>';
        }).join('') + '</div>' +
        '<p class="help" style="margin:12px 0 8px">그림은 2개까지, 한 시간에 3통까지 보낼 수 있어요.</p>' +
        '<div class="picto-grid">' + D.pictograms.map(function (p) {
          return '<button type="button" class="picto" data-act="pick-picto" data-id="' + p.id + '">' +
            '<span class="emoji">' + p.emoji + '</span>' + esc(p.label) + '</button>';
        }).join('') + '</div>' +
        '<div class="field" style="margin-top:10px"><input class="input" id="mailText" maxlength="40" placeholder="짧은 말도 함께 보낼 수 있어요 (선택)"></div>' +
        '<div class="mail-compose-foot">' +
          '<span class="counter" id="mailCounter">' + sentLastHour + '/3통 보냈어요</span>' +
          '<button type="button" class="btn btn-rose" data-act="send-mail"' + (sentLastHour >= 3 ? ' disabled' : '') + '>편지 보내기 💌</button>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        cardHead('📮', '받은 편지함', '부모님·조부모님이 답장해요') +
        '<div class="mail-tabs">' + D.mailRecipients.map(function (r) {
          var n = unreadFor(r.id);
          return '<button type="button" class="mail-tab' + (r.id === mailTab ? ' active' : '') + '" data-act="pick-mail-tab" data-id="' + r.id + '">' +
            r.emoji + ' ' + esc(r.name) + (n ? ' <span class="badge rose">' + n + '</span>' : '') + '</button>';
        }).join('') + '</div>' +
        (letters.length ? letters.map(letterHTML).join('')
          : '<div class="empty"><span class="big">📭</span>' + esc(rec.name) + '에게 온 편지가 아직 없어요.<br>아이와 함께 그림 편지를 보내 보세요.</div>') +
      '</div>' +
    '</div>';
  }

  function letterHTML(m) {
    var from = childById(m.fromId);
    var fresh = (Date.now() - m.ts) < 24 * 3600 * 1000;
    var pictos = (m.pictos || []).map(function (id) {
      var p = D.pictograms.filter(function (x) { return x.id === id; })[0];
      return p ? '<span class="letter-picto"><span class="emoji">' + p.emoji + '</span>' + esc(p.label) + '</span>' : '';
    }).join('');
    var replies = (m.replies || []).map(function (r) {
      return '<div class="log-item" style="margin-top:6px">' +
        '<span>' + (r.emoji || '💬') + '</span>' +
        '<div class="l-main"><b>' + esc(r.by) + '</b> ' + esc(r.text) + '</div>' +
        '<span class="l-time">' + UI.ago(r.ts) + '</span></div>';
    }).join('');

    return '<div class="letter' + (fresh && !m.read ? ' unread' : '') + '">' +
      '<div class="letter-head">' +
        '<span class="avatar sm ' + from.color + '">' + from.emoji + '</span>' +
        '<span class="who">' + esc(from.name) + '</span>' +
        '<span class="to">→ ' + esc(m.toName) + '</span>' +
        '<span class="when">' + UI.ago(m.ts) + '</span>' +
      '</div>' +
      '<div class="letter-pictos">' + pictos + '</div>' +
      (m.text ? '<div class="letter-text">' + esc(m.text) + '</div>' : '') +
      '<div class="letter-actions">' +
        '<button type="button" class="btn btn-soft btn-sm" data-act="read-letter" data-id="' + m.id + '">🔊 읽어주기</button>' +
        (S.mode === 'parent'
          ? '<button type="button" class="btn btn-primary btn-sm" data-act="reply-open" data-id="' + m.id + '">답장하기</button>'
          : '<span class="badge lav">🔒 답장은 부모님 모드</span>') +
      '</div>' +
      (replies ? '<div class="reply-box">' + replies + '</div>' : '') +
      (window.__replyOpen === m.id ? replyBoxHTML(m) : '') +
    '</div>';
  }

  function replyBoxHTML(m) {
    return '<div class="reply-box" id="replyBox">' +
      '<div class="chip-row" style="margin-bottom:8px">' + D.quickReplies.map(function (q) {
        return '<button type="button" class="chip" data-act="quick-reply" data-id="' + m.id + '" data-text="' + esc(q.label) + '" data-emoji="' + esc(q.emoji) + '">' +
          q.emoji + ' ' + esc(q.label) + '</button>';
      }).join('') + '</div>' +
      '<div style="display:flex;gap:6px">' +
        '<input class="input" id="replyInput" maxlength="60" placeholder="짧은 답장을 적어 주세요">' +
        '<button type="button" class="btn btn-primary btn-sm" data-act="send-reply" data-id="' + m.id + '">보내기</button>' +
      '</div>' +
    '</div>';
  }

  function sendLetter() {
    var hourAgo = Date.now() - 3600 * 1000;
    var sent = S.messages.filter(function (m) { return m.fromId === mailSender && m.ts > hourAgo; }).length;
    if (sent >= 3) {
      UI.toast('한 시간에 3통까지 보낼 수 있어요', { emoji: '⏳', kind: 'warn' });
      return;
    }
    if (!window.__pictos || !window.__pictos.length) {
      var txt0 = (document.getElementById('mailText') || {}).value || '';
      if (!txt0.trim()) { UI.toast('그림을 하나 골라 주세요', { emoji: '🖼️', kind: 'warn' }); return; }
    }
    var pictos = (window.__pictos || []).slice(0, 2);
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
    save();
    mailTab = rec.id;
    render({ keepScroll: true });
    UI.confetti(18);
    UI.toast(rec.name + '에게 편지를 보냈어요', { emoji: '💌', kind: 'good' });
  }

  function openReply(id) {
    if (!needParent('답장은 부모님 모드에서 보낼 수 있어요')) return;
    window.__replyOpen = window.__replyOpen === id ? null : id;
    render({ keepScroll: true });
    var inp = document.getElementById('replyInput');
    if (inp) inp.focus();
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
    window.__replyOpen = null;
    save();
    render({ keepScroll: true });
    UI.toast('답장을 보냈어요', { emoji: '💬', kind: 'good' });
  }

  function readLetter(id) {
    var m = S.messages.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    var from = childById(m.fromId);
    var words = (m.pictos || []).map(function (pid) {
      var p = D.pictograms.filter(function (x) { return x.id === pid; })[0];
      return p ? p.label : '';
    }).filter(Boolean).join(', ');
    UI.speak(from.name + '이 보낸 편지. ' + (words ? words + '. ' : '') + (m.text || ''));
    UI.toast('편지를 읽어줄게요', { emoji: '🔊' });
  }

  /* ================= 식판 · 약 · 성장 ================= */
  function renderHealth() {
    var today = todayKey();
    var c = childById(mealChild);
    var stats = mealStats(14);

    return '<div class="card soft-sun" style="margin-bottom:12px">' +
        '<div class="routine-head">' +
          '<strong style="font-size:15px">🍱 오늘의 식판</strong>' +
          D.children.map(function (k) {
            return '<button type="button" class="chip ' + k.color + (k.id === c.id ? ' active' : '') + '" data-act="pick-meal-child" data-id="' + k.id + '">' +
              k.emoji + ' ' + esc(k.name) + '</button>';
          }).join('') +
          '<span style="flex:1"></span>' +
          '<span class="badge ' + (S.mode === 'parent' ? 'mint' : 'lav') + '">' + (S.mode === 'parent' ? '부모님이 기록해요' : '🔒 부모님 모드에서 기록') + '</span>' +
        '</div>' +
        trayHTML(c, today) +
        mealSummaryHTML(c, today) +
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

  function trayHTML(c, date) {
    return '<div class="tray">' + D.traySlots.map(function (slot, idx) {
      var st = slotOf(c.id, date, slot.key);
      var food = st.dishId ? foodById(st.dishId) : null;
      var area = { rice: 'rice', soup: 'soup', side1: 's1', side2: 's2', side3: 's3' }[slot.key] || 's1';
      var cls = 'tray-slot ' + area;
      return '<div class="' + cls + '">' +
        '<span class="slot-label">' + esc(slot.label) + '</span>' +
        '<button type="button" class="dish-btn" data-act="pick-dish" data-child="' + c.id + '" data-slot="' + slot.key + '">' +
          '<span class="dish">' + (food ? food.emoji : '➕') + '</span>' +
          '<span class="dish-name' + (food ? '' : ' none') + '">' + (food ? esc(food.name) : '음식 고르기') + '</span>' +
        '</button>' +
        '<div class="level-row">' + D.mealLevels.map(function (lv) {
          var active = food && st.level === lv.key;
          return '<button type="button" class="level-pill' + (active ? ' active' : '') + '" data-act="set-level" data-child="' + c.id + '" data-slot="' + slot.key + '" data-level="' + lv.key + '">' + esc(lv.label) + '</button>';
        }).join('') + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function mealSummaryHTML(c, date) {
    var m = mealOf(c.id, date);
    var picked = (m.slots || []).filter(function (s) { return s.dishId; });
    if (!picked.length) {
      return '<div class="empty" style="margin-top:10px"><span class="big">🍽️</span>아직 오늘 식판을 기록하지 않았어요.' +
        (S.mode === 'parent' ? '<br>그릇을 눌러 음식을 골라 주세요.' : '') + '</div>';
    }
    var counts = {};
    D.mealLevels.forEach(function (l) { counts[l.key] = 0; });
    picked.forEach(function (s) { counts[s.level] = (counts[s.level] || 0) + 1; });
    return '<div class="meal-summary">' +
      '<span class="badge mint">먹은 음식 ' + picked.length + '가지</span>' +
      D.mealLevels.map(function (l) {
        return '<span class="badge ' + (l.key === 'all' ? 'mint' : l.key === 'half' ? 'sun' : l.key === 'taste' ? 'rose' : '') + '">' +
          esc(l.label) + ' ' + counts[l.key] + '</span>';
      }).join('') +
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

  function pickDishModal(childId, slotKey) {
    if (!needParent('식판은 부모님 모드에서 기록할 수 있어요')) return;
    var slot = D.traySlots.filter(function (s) { return s.key === slotKey; })[0];
    var traySlot = slot ? slot.label : '음식';
    UI.modal({
      title: traySlot + ' 고르기',
      size: 'wide',
      bodyHTML: '<div class="picto-grid" style="grid-template-columns:repeat(3,1fr)">' +
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
          S.meals[date][childId] = S.meals[date][childId] || { slots: [] };
          var slots = S.meals[date][childId].slots;
          var cur = slots.filter(function (s) { return s.key === slotKey; })[0];
          if (!cur) { cur = { key: slotKey, dishId: null, level: 'half' }; slots.push(cur); }
          if (clear) {
            cur.dishId = null; cur.level = 'none';
          } else {
            cur.dishId = fb.getAttribute('data-food');
            if (cur.level === 'none') cur.level = 'half';
          }
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
    var cfg = Storage.config;
    var isFb = Storage.mode === 'firebase';
    return '<div class="settings-grid">' +
      '<div class="card span-2">' +
        cardHead('💾', '저장 방식', '가족 데이터는 어디에 저장되나요?') +
        '<div class="status-line' + (isFb ? '' : ' local') + '">' +
          (isFb ? '🔄 Firebase 실시간 동기화 연결됨' : '📱 이 기기 브라우저에 저장 중 (localStorage)') + '</div>' +
        '<p class="help">기본은 이 기기에만 저장돼요. 아래 Firebase 값을 넣으면 엄마·아빠 폰과 태블릿이 같은 데이터를 실시간으로 함께 씁니다.</p>' +
        '<details class="more"' + (isFb ? '' : '') + '><summary>Firebase 연동 준비 (5분)</summary>' +
          '<ol class="steps">' +
            '<li><a href="https://console.firebase.google.com/" target="_blank" rel="noopener">Firebase 콘솔</a>에서 새 프로젝트를 만듭니다.</li>' +
            '<li>왼쪽 메뉴 <b>빌드 → Firestore Database</b>에서 데이터베이스를 만듭니다(테스트 모드로 시작).</li>' +
            '<li><b>프로젝트 설정 → 내 앱 → 웹 앱 추가</b> 후 나오는 <code>firebaseConfig</code> 값을 복사합니다.</li>' +
            '<li>아래 칸에 붙여 넣고 <b>연결하기</b>를 누릅니다.</li>' +
            '<li>Firestore 보안 규칙은 가족만 쓰는 앱이므로 아래처럼 두면 됩니다.<br>' +
              '<code>match /families/{doc} { allow read, write: if true; }</code><br>' +
              '<span style="color:#C4533C">※ 규칙을 열어 두면 주소를 아는 사람은 접근할 수 있어요. 가족용으로만 쓰고, 민감한 개인정보는 넣지 마세요.</span></li>' +
          '</ol>' +
        '</details>' +
        '<div class="field-row" style="margin-top:12px">' +
          '<div class="field"><label>apiKey</label><input class="input" id="fbApiKey" value="' + esc(cfg && cfg.apiKey || '') + '" placeholder="AIza..."></div>' +
          '<div class="field"><label>authDomain</label><input class="input" id="fbAuthDomain" value="' + esc(cfg && cfg.authDomain || '') + '" placeholder="my-app.firebaseapp.com"></div>' +
        '</div>' +
        '<div class="field-row">' +
          '<div class="field"><label>projectId</label><input class="input" id="fbProjectId" value="' + esc(cfg && cfg.projectId || '') + '" placeholder="my-app"></div>' +
          '<div class="field"><label>appId</label><input class="input" id="fbAppId" value="' + esc(cfg && cfg.appId || '') + '" placeholder="1:1234:web:abcd"></div>' +
        '</div>' +
        '<div class="field-row">' +
          '<div class="field"><label>컬렉션 이름</label><input class="input" id="fbCollection" value="' + esc(cfg && cfg.collection || 'families') + '"></div>' +
          '<div class="field"><label>가족 문서 ID</label><input class="input" id="fbFamilyId" value="' + esc(cfg && cfg.familyId || 'our-family') + '"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button type="button" class="btn btn-primary" data-act="fb-connect">' + (isFb ? '다시 연결' : '연결하기') + '</button>' +
          (isFb ? '<button type="button" class="btn btn-danger" data-act="fb-disconnect">연결 해제</button>' : '') +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        cardHead('🔐', '개인정보 안내', '공개 저장소에 올라가는 앱') +
        '<p class="help">이 앱에는 가족 이름(민국·이준·엄마·아빠)과 아이 키·몸무게만 들어 있어요.<br>' +
        '집 주소, 전화번호, 이메일, 생년월일 같은 정보는 코드에 넣지 않았고, 앞으로도 넣지 마세요.<br>' +
        '데이터는 이 기기(또는 연결한 Firebase)에만 저장되고 GitHub에는 올라가지 않아요.</p>' +
      '</div>' +

      '<div class="card">' +
        cardHead('🧰', '데이터 관리', '내보내기 · 가져오기') +
        '<p class="help">기기를 바꾸거나 백업할 때 써요.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
          '<button type="button" class="btn btn-soft" data-act="export">내보내기 (JSON)</button>' +
          '<button type="button" class="btn btn-soft" data-act="import">가져오기</button>' +
          '<button type="button" class="btn btn-danger" data-act="reset">전체 초기화</button>' +
        '</div>' +
        '<input type="file" id="importFile" accept="application/json,.json" hidden>' +
      '</div>' +

      '<div class="card span-2">' +
        cardHead('🏡', '우리집 다모아', '가족 대시보드 v1') +
        '<p class="help">아이 루틴 · 칭찬과 돼지저금통 · 가족 일정 · 우체통 · 식판/약/성장 기록을 한 곳에 모은 웹앱이에요.<br>' +
        '모드: ' + (S.mode === 'parent' ? '🔒 부모님 모드(' + esc(S.actor || '부모님') + ')' : '🧒 아이 모드') + ' · 저장: ' + (isFb ? 'Firebase' : '이 기기') + '</p>' +
        '<p class="help" style="margin-top:8px">앱 주소: ' + esc(location.origin + location.pathname) + '</p>' +
      '</div>' +
    '</div>';
  }

  /* ================= 이벤트 ================= */
  function onViewClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');

    switch (act) {
      case 'goto': setView(el.getAttribute('data-view')); break;

      case 'pick-routine-child': routineChild = el.getAttribute('data-id'); render({ keepScroll: true }); break;
      case 'pick-praise-child': praiseChild = el.getAttribute('data-id'); render({ keepScroll: true }); break;
      case 'pick-meal-child': mealChild = el.getAttribute('data-id'); render({ keepScroll: true }); break;
      case 'pick-growth-child': growthChild = el.getAttribute('data-id'); render({ keepScroll: true }); break;
      case 'pick-mail-sender': mailSender = el.getAttribute('data-id'); render({ keepScroll: true }); break;
      case 'pick-mail-recipient': mailRecipient = el.getAttribute('data-id'); render({ keepScroll: true }); break;
      case 'pick-mail-tab':
        mailTab = el.getAttribute('data-id');
        S.messages.forEach(function (m) { if (m.toId === mailTab) m.read = true; });
        save();
        render({ keepScroll: true });
        break;

      case 'routine-check': {
        var childId = el.getAttribute('data-child');
        var itemId = el.getAttribute('data-item');
        var label = el.parentElement.querySelector('.r-label').childNodes[0].textContent;
        askQuiz(function () { completeRoutine(childId, itemId); }, label);
        break;
      }
      case 'routine-undo': undoRoutine(el.getAttribute('data-child'), el.getAttribute('data-item')); break;

      case 'praise': addPraise(el.getAttribute('data-child'), el.getAttribute('data-item')); break;
      case 'money': moneyAction(el.getAttribute('data-child'), el.getAttribute('data-key')); break;

      case 'cal-prev': calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1); render({ keepScroll: true }); break;
      case 'cal-next': calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1); render({ keepScroll: true }); break;
      case 'cal-today': calCursor = new Date(); calSelected = todayKey(); render({ keepScroll: true }); break;
      case 'pick-day': calSelected = el.getAttribute('data-date'); render({ keepScroll: true }); break;
      case 'add-event': addEventModal(calSelected); break;
      case 'del-event': deleteEvent(el.getAttribute('data-id')); break;

      case 'pick-picto': {
        var pid = el.getAttribute('data-id');
        window.__pictos = window.__pictos || [];
        var i = window.__pictos.indexOf(pid);
        if (i >= 0) window.__pictos.splice(i, 1);
        else {
          if (window.__pictos.length >= 2) { UI.toast('그림은 2개까지 고를 수 있어요', { emoji: '🖼️', kind: 'warn' }); return; }
          window.__pictos.push(pid);
        }
        el.classList.toggle('active');
        var cnt = document.getElementById('mailCounter');
        if (cnt) cnt.textContent = (window.__pictos.length) + '개 골랐어요 · 2개까지';
        break;
      }
      case 'send-mail': sendLetter(); break;
      case 'read-letter': readLetter(el.getAttribute('data-id')); break;
      case 'reply-open': openReply(el.getAttribute('data-id')); break;
      case 'quick-reply': sendReply(el.getAttribute('data-id'), el.getAttribute('data-text'), el.getAttribute('data-emoji')); break;
      case 'send-reply': sendReply(el.getAttribute('data-id')); break;

      case 'pick-dish': pickDishModal(el.getAttribute('data-child'), el.getAttribute('data-slot')); break;
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
    var collection = (document.getElementById('fbCollection') || {}).value || 'families';
    var familyId = (document.getElementById('fbFamilyId') || {}).value || 'our-family';

    if (!apiKey.trim() || !projectId.trim()) {
      UI.toast('apiKey와 projectId는 꼭 필요해요', { kind: 'warn' });
      return;
    }
    UI.toast('Firebase에 연결하는 중...', { emoji: '🔄', duration: 1800 });
    Storage.enableFirebase({
      apiKey: apiKey.trim(), authDomain: authDomain.trim(), projectId: projectId.trim(),
      appId: appId.trim(), collection: collection.trim(), familyId: familyId.trim()
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
    }).catch(function (err) {
      UI.toast('연결 실패: ' + ((err && err.message) || '설정 값을 확인해 주세요'), { kind: 'warn', duration: 5000 });
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
    });
  }

  var VIEWS = {
    home: renderHome,
    routine: renderRoutine,
    praise: renderPraise,
    calendar: renderCalendar,
    mailbox: renderMailbox,
    health: renderHealth,
    settings: renderSettings
  };
  window.__VIEWS = VIEWS;

  async function init() {
    bindChrome();
    startClock();
    var res = await Storage.init(function (remoteState) {
      var keep = S ? { mode: S.mode, actor: S.actor } : null;
      S = normalize(remoteState);
      if (keep) { S.mode = keep.mode; S.actor = keep.actor; }
      render({ keepScroll: true });
      UI.toast('다른 기기에서 가족 데이터가 업데이트됐어요', { emoji: '🔄', duration: 2200 });
    });
    S = normalize(res.state);
    if (res.error) {
      UI.toast('Firebase 연결에 실패해 이 기기 저장으로 열었어요', { kind: 'warn', duration: 5000 });
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
