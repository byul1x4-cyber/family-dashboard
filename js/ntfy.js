/* =========================================================
   우리집 다모아 · 폰·패드 잠금화면 알림 (ntfy.sh)
   ---------------------------------------------------------
   · 별도 서버 없이 ntfy.sh 공개 푸시 서비스를 씁니다.
   · 우리 가족 토픽 이름은 '가족 열쇠 ID(fam_...)'를 SHA-256으로
     해시한 앞 16자리입니다. 같은 가족 코드를 넣은 기기는
     저절로 같은 토픽을 알게 되고, 남은 추측할 수 없습니다.
       예) fam_e4f076e2b66030eaf37fb286
           → woori-damoa-860792dfea1ce9d9
   · 보낼 때는 반드시 JSON 발송(POST https://ntfy.sh/)을 씁니다.
     HTTP 헤더(Title: 등)에 한글을 넣으면 브라우저가
     ISO-8859-1 오류를 내기 때문입니다.
   · 발송이 실패해도 앱의 저장(Firestore)은 그대로 진행됩니다.
   ========================================================= */
window.Ntfy = (function () {
  'use strict';

  var ENDPOINT = 'https://ntfy.sh/';
  var TOPIC_PREFIX = 'woori-damoa-';
  var TOPIC_HEX = 16;                       // 16 hex = 64bit
  var CLICK_URL = 'https://byul1x4-cyber.github.io/family-dashboard/';

  /* ---------------- SHA-256 (순수 JS) ----------------
     crypto.subtle은 https에서만, 그것도 비동기라서 화면을 그릴 때
     바로 토픽을 보여줄 수 없습니다. 어디서나 같은 값이 나오도록
     작은 SHA-256을 직접 넣었습니다. */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function utf8Bytes(str) {
    var s = String(str == null ? '' : str);
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else if (c < 0xd800 || c >= 0xe000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      else {
        i++;
        var c2 = s.charCodeAt(i) || 0;
        var cp = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      }
    }
    return out;
  }

  function sha256Hex(text) {
    var bytes = utf8Bytes(text);
    var len = bytes.length;
    var bitLen = len * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    /* 64비트 길이 (앞 32비트는 늘 0) */
    bytes.push(0, 0, 0, 0);
    bytes.push((bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);

    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var W = new Array(64);

    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

    for (var off = 0; off < bytes.length; off += 64) {
      for (var t = 0; t < 16; t++) {
        W[t] = ((bytes[off + t * 4] << 24) | (bytes[off + t * 4 + 1] << 16) |
                (bytes[off + t * 4 + 2] << 8) | bytes[off + t * 4 + 3]) >>> 0;
      }
      for (var t2 = 16; t2 < 64; t2++) {
        var s0 = (rotr(W[t2 - 15], 7) ^ rotr(W[t2 - 15], 18) ^ (W[t2 - 15] >>> 3)) >>> 0;
        var s1 = (rotr(W[t2 - 2], 17) ^ rotr(W[t2 - 2], 19) ^ (W[t2 - 2] >>> 10)) >>> 0;
        W[t2] = (W[t2 - 16] + s0 + W[t2 - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (var i = 0; i < 64; i++) {
        var S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        var ch = ((e & f) ^ (~e & g)) >>> 0;
        var t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
        var S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        var t3 = (S0 + maj) >>> 0;
        h = g; g = f; f = e;
        e = (d + t1) >>> 0;
        d = c; c = b; b = a;
        a = (t1 + t3) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }

    var hex = '';
    for (var k = 0; k < 8; k++) hex += ('00000000' + H[k].toString(16)).slice(-8);
    return hex;
  }

  /* ---------------- 가족 열쇠 ID → 우리 가족 토픽 ---------------- */
  function topicForFamilyId(familyId) {
    var id = String(familyId == null ? '' : familyId).trim();
    if (!id) return '';
    return TOPIC_PREFIX + sha256Hex(id).slice(0, TOPIC_HEX);
  }

  function currentFamilyId() {
    try {
      if (window.Storage && typeof window.Storage.familyId === 'function') return window.Storage.familyId() || '';
    } catch (e) {}
    return '';
  }

  function topic() { return topicForFamilyId(currentFamilyId()); }

  /* ---------------- 발송 ---------------- */
  /* JSON 발송만 씁니다. 헤더에 한글을 넣으면 브라우저가 막습니다. */
  function publish(opts) {
    opts = opts || {};
    var t = String(opts.topic || topic() || '');
    if (!t) return Promise.resolve({ ok: false, error: '가족 토픽이 없어요' });

    var body = {
      topic: t,
      title: String(opts.title || '우리집 다모아'),
      message: String(opts.message || '새 소식이 있어요'),
      click: String(opts.click || CLICK_URL),
      priority: opts.priority || 4
    };
    if (opts.tags && opts.tags.length) body.tags = opts.tags;

    var fn = (typeof window.fetch === 'function') ? window.fetch : null;
    if (!fn) return Promise.resolve({ ok: false, error: '이 브라우저에서는 알림을 보낼 수 없어요' });

    var req;
    try {
      req = fn.call(window, ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      return Promise.resolve({ ok: false, error: String((e && e.message) || e) });
    }

    return Promise.resolve(req).then(function (res) {
      if (res && res.ok === false) {
        return { ok: false, error: 'ntfy 응답 ' + (res.status || '오류'), status: res.status || 0 };
      }
      return { ok: true, status: (res && res.status) || 200, topic: t };
    }).catch(function (e) {
      return { ok: false, error: String((e && e.message) || e || '전송 실패') };
    });
  }

  /* 화면에서 부르는 발송: 값이 없으면 조용히 건너뜁니다. */
  function notify(opts) {
    opts = opts || {};
    if (!String(opts.message || '').trim() && !opts.title) return Promise.resolve({ ok: false, skipped: 'empty' });
    return publish(opts);
  }

  return {
    ENDPOINT: ENDPOINT,
    CLICK_URL: CLICK_URL,
    topicForFamilyId: topicForFamilyId,
    topic: topic,
    sha256Hex: sha256Hex,
    publish: publish,
    notify: notify
  };
})();
