/* 공용 UI 도우미 */
window.UI = (function () {
  var modalRoot = null;
  var toastRoot = null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* 날짜 도우미 */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) {
    d = d ? new Date(d) : new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseKey(key) {
    var p = String(key).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  function weekday(d) { return WEEKDAYS[(d ? new Date(d) : new Date()).getDay()]; }
  function dateKo(key) {
    var d = parseKey(key);
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + weekday(d) + '요일';
  }
  function shortDateKo(key) {
    var d = parseKey(key);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function timeKo(ts) {
    var d = new Date(ts);
    var h = d.getHours();
    var ampm = h < 12 ? '오전' : '오후';
    var hh = h % 12; if (hh === 0) hh = 12;
    return ampm + ' ' + hh + ':' + pad(d.getMinutes());
  }
  function ago(ts) {
    var diff = Date.now() - ts;
    var m = Math.floor(diff / 60000);
    if (m < 1) return '방금';
    if (m < 60) return m + '분 전';
    var h = Math.floor(m / 60);
    if (h < 24) return h + '시간 전';
    var d = Math.floor(h / 24);
    if (d < 7) return d + '일 전';
    return shortDateKo(dateKey(new Date(ts)));
  }
  function won(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; }

  /* 토스트 */
  function toast(message, opts) {
    opts = opts || {};
    if (!toastRoot) toastRoot = document.getElementById('toastRoot');
    var el = document.createElement('div');
    el.className = 'toast' + (opts.kind ? ' toast-' + opts.kind : '');
    el.innerHTML = (opts.emoji ? '<span class="toast-emoji">' + opts.emoji + '</span>' : '') +
      '<span>' + esc(message) + '</span>';
    toastRoot.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 260);
    }, opts.duration || 2600);
  }

  /* 모달 */
  function modal(opts) {
    if (!modalRoot) modalRoot = document.getElementById('modalRoot');
    var wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    var actionsHtml = '';
    if (opts.actions && opts.actions.length) {
      actionsHtml = '<div class="modal-actions">' + opts.actions.map(function (a, i) {
        return '<button class="btn ' + (a.kind ? 'btn-' + a.kind : 'btn-soft') + '" data-action-index="' + i + '">' + esc(a.label) + '</button>';
      }).join('') + '</div>';
    }
    wrap.innerHTML =
      '<div class="modal-backdrop" data-close="1"></div>' +
      '<div class="modal ' + (opts.size ? 'modal-' + opts.size : '') + '" role="dialog" aria-modal="true">' +
        (opts.title ? '<div class="modal-head"><h3>' + esc(opts.title) + '</h3>' +
          '<button class="icon-btn" data-close="1" aria-label="닫기">✕</button></div>' : '') +
        '<div class="modal-body">' + (opts.bodyHTML || '') + '</div>' +
        actionsHtml +
      '</div>';
    modalRoot.appendChild(wrap);
    document.body.classList.add('modal-open');
    requestAnimationFrame(function () { wrap.classList.add('show'); });

    var closed = false;
    function close(result) {
      if (closed) return;
      closed = true;
      wrap.classList.remove('show');
      document.body.classList.remove('modal-open');
      setTimeout(function () { wrap.remove(); if (opts.onClose) opts.onClose(result); }, 200);
    }
    wrap.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { close(null); return; }
      var btn = e.target.closest('[data-action-index]');
      if (btn) {
        var a = opts.actions[Number(btn.getAttribute('data-action-index'))];
        if (a && a.onClick) {
          if (a.onClick(close) === false) return;
        }
        if (a && a.keepOpen) return;
        close(a ? a.value : null);
      }
    });
    if (opts.onOpen) opts.onOpen(wrap, close);
    var focusEl = wrap.querySelector('input, textarea, button.btn');
    if (focusEl && window.innerWidth > 640) setTimeout(function () { focusEl.focus(); }, 60);
    return { el: wrap, close: close };
  }

  function confirm(title, message, confirmLabel, kind) {
    return new Promise(function (resolve) {
      modal({
        title: title,
        bodyHTML: '<p class="modal-text">' + esc(message) + '</p>',
        actions: [
          { label: confirmLabel || '확인', kind: kind || 'primary', onClick: function (close) { resolve(true); } },
          { label: '취소', kind: 'ghost', onClick: function (close) { resolve(false); } }
        ],
        onClose: function () { resolve(false); }
      });
    });
  }

  /* 반짝이 효과 */
  function confetti(count) {
    var layer = document.createElement('div');
    layer.className = 'confetti-layer';
    document.body.appendChild(layer);
    var colors = ['#FFD166', '#FF9EC4', '#7BC9A6', '#A99BE0', '#7FB3E8', '#FF9E8A'];
    var n = count || 36;
    for (var i = 0; i < n; i++) {
      var bit = document.createElement('i');
      bit.style.left = Math.random() * 100 + '%';
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = (Math.random() * 0.5) + 's';
      bit.style.animationDuration = (1.4 + Math.random() * 0.9) + 's';
      bit.style.width = (6 + Math.random() * 7) + 'px';
      bit.style.height = (8 + Math.random() * 10) + 'px';
      layer.appendChild(bit);
    }
    setTimeout(function () { layer.remove(); }, 2600);
  }

  /* 소리 내어 읽기 (우체통 편지) */
  function speak(text) {
    if (!('speechSynthesis' in window)) { toast('이 브라우저는 읽어주기를 지원하지 않아요'); return; }
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch (e) { toast('읽어주기를 시작하지 못했어요'); }
  }

  return {
    $: $, $$: $$, esc: esc, uid: uid,
    dateKey: dateKey, parseKey: parseKey, weekday: weekday, dateKo: dateKo, shortDateKo: shortDateKo,
    timeKo: timeKo, ago: ago, won: won, pad: pad,
    toast: toast, modal: modal, confirm: confirm, confetti: confetti, speak: speak
  };
})();
