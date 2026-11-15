/* =========================================================
   저장소 어댑터 (가족 열쇠 + Firestore 실시간 동기화)
   ---------------------------------------------------------
   · 앱 코드에는 가족 Firebase 프로젝트 설정이 기본으로 들어 있습니다.
   · 이 기기에 '가족 입장 코드'가 없으면 아무 데이터도 그리지 않고 잠금 화면을 띄웁니다.
   · Firestore 문서 ID는 고정값이 아니라
       families/fam_<SHA-256(입장코드) 앞 24자리>
     입니다. 코드를 모르면 문서 ID를 알 수 없고, 문서를 직접 지정해서 읽을 수도 없습니다.
   · 앱 코드는 언제나 Storage.load() / Storage.save() 만 씁니다.
   ========================================================= */
window.Storage = (function () {
  'use strict';

  var DOC_KEY = 'family-dashboard-v1';        // 이 기기에 저장하는 앱 데이터
  var CFG_KEY = 'family-dashboard-firebase';  // (고급) 직접 바꾼 Firebase 설정
  var GATE_KEY = 'family-dashboard-gate';     // { id: 'fam_...', at: 시각 } — 입장한 기기 표시

  /* 가족 Firebase 프로젝트 (웹 apiKey는 클라이언트 식별용 공개 키입니다) */
  var DEFAULT_FIREBASE_CONFIG = {
    apiKey: 'AIzaSyC4xtA0T7FcMzd0SRYykxnpolxCFRZ-bdY',
    authDomain: 'family-dashboard-44804.firebaseapp.com',
    projectId: 'family-dashboard-44804',
    storageBucket: 'family-dashboard-44804.firebasestorage.app',
    messagingSenderId: '469417903545',
    appId: '1:469417903545:web:d8667da78ac3134443e268'
  };

  var COLLECTION = 'families';
  var PREFIX = 'fam_';
  var SALT = 'urijip-damoa-family-v1';   // 해시에 섞어 문서 ID 추측을 더 어렵게
  var MIN_CODE_LEN = 4;
  var HASH_LEN = 24;                     // 24 hex = 96bit
  var CONNECT_TIMEOUT_MS = 12000;        // 첫 읽기가 이보다 늦으면 이 기기 저장으로 먼저 연다

  var mode = 'local';        // 'local' | 'firebase'
  var config = null;         // 실제 사용 중인 Firebase 설정
  var db = null;
  var docRef = null;
  var unsub = null;
  var fsApi = null;          // setDoc
  var fsMod = null;          // firebase/firestore 모듈
  var remoteChange = null;   // 화면 갱신 콜백
  var pushTimer = null;
  var lastSaved = null;
  var lastError = null;
  var lastSyncAt = null;

  /* ---------------- 작은 도우미 ---------------- */
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch (e) { return null; }
  }
  function writeJSON(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* 저장 공간 없음 - 무시 */ }
  }
  function readLocal() { return readJSON(DOC_KEY); }
  function writeLocal(obj) { writeJSON(DOC_KEY, obj); }
  function readConfig() {
    var c = readJSON(CFG_KEY);
    return (c && c.apiKey && c.projectId) ? c : null;
  }
  function currentConfig() {
    return Object.assign({}, DEFAULT_FIREBASE_CONFIG, readConfig() || {});
  }
  function readGate() {
    var g = readJSON(GATE_KEY);
    return (g && g.id) ? g : null;
  }
  function writeGate(g) { writeJSON(GATE_KEY, g); }
  function errText(e) {
    if (!e) return '알 수 없는 오류';
    return [e.code, e.message].filter(Boolean).join(': ') || String(e);
  }
  function setError(e) {
    lastError = e ? errText(e) : null;
  }

  /* ---------------- 가족 입장 코드 → 문서 ID ---------------- */
  function normalizeCode(code) {
    /* 띄어쓰기, 영문 대소문자는 구분하지 않습니다 */
    return String(code == null ? '' : code).replace(/\s+/g, '').toLowerCase();
  }
  function secureContext() {
    return !!(window.crypto && window.crypto.subtle && window.crypto.subtle.digest);
  }
  function hexOf(buf) {
    var arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var out = '';
    for (var i = 0; i < arr.length; i++) out += ('0' + arr[i].toString(16)).slice(-2);
    return out;
  }
  async function sha256Hex(text) {
    var bytes = new TextEncoder().encode(text);
    if (secureContext()) {
      var buf = await window.crypto.subtle.digest('SHA-256', bytes);
      return hexOf(buf);
    }
    /* https·localhost가 아닌 곳(file:// 등)에서만 쓰는 대체 해시.
       기기 간 문서 ID가 달라질 수 있으니 실제 사용은 https 주소에서만 하세요. */
    var h1 = 0x811c9dc5, h2 = 0x1b873593;
    for (var i = 0; i < bytes.length; i++) {
      h1 = ((h1 ^ bytes[i]) * 16777619) >>> 0;
      h2 = (((h2 + bytes[i]) * 2654435761) ^ (h2 >>> 13)) >>> 0;
    }
    var base = ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
    return (base + base + base).slice(0, 64);
  }

  /* ---------------- Firebase ---------------- */
  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        var e = new Error(label || '시간 초과');
        e.__timeout = true;
        reject(e);
      }, ms);
      promise.then(function (v) {
        if (done) return; done = true; clearTimeout(t); resolve(v);
      }, function (e) {
        if (done) return; done = true; clearTimeout(t); reject(e);
      });
    });
  }

  async function connect(connConfig, familyId, opts) {
    opts = opts || {};
    var version = '10.12.2';
    var appMod = await import('https://www.gstatic.com/firebasejs/' + version + '/firebase-app.js');
    var fs = await import('https://www.gstatic.com/firebasejs/' + version + '/firebase-firestore.js');

    var app = (appMod.getApps && appMod.getApps().length) ? appMod.getApp() : appMod.initializeApp(connConfig);
    /* 다른 프로젝트로 바꿨다면 기존 앱을 내리고 새로 만듭니다 */
    if (app.options && connConfig.projectId && app.options.projectId !== connConfig.projectId) {
      try { await appMod.deleteApp(app); } catch (e) {}
      app = appMod.initializeApp(connConfig);
    }
    /* 일부 공유기·회사망·프록시는 실시간 채널(WebChannel)을 막습니다.
       long polling으로 열어 두면 그런 망에서도 동기화가 됩니다. */
    var nextDb;
    try {
      nextDb = fs.initializeFirestore(app, { experimentalForceLongPolling: true });
    } catch (e) {
      nextDb = fs.getFirestore(app);
    }
    var nextRef = fs.doc(nextDb, COLLECTION, familyId);

    /* 여기서 문서를 실제로 읽어 봅니다 → 권한/DB 없음 오류를 이때 잡습니다.
       응답이 너무 늦으면 기다리지 않고 이 기기 저장으로 먼저 열어 줍니다. */
    var snap;
    try {
      snap = await withTimeout(fs.getDoc(nextRef), CONNECT_TIMEOUT_MS);
    } catch (e) {
      if (e && e.__timeout) throw new Error('서버 응답이 너무 늦어요. 잠시 뒤 다시 연결해 주세요');
      throw e;
    }
    var remoteDoc = snap.exists() ? snap.data() : null;
    var remoteState = (remoteDoc && remoteDoc.state) ? remoteDoc.state : null;
    /* 첫 구독 알림은 방금 읽은 그 내용이므로 '다른 기기에서 업데이트' 알림을 띄우지 않습니다 */
    if (remoteDoc && remoteDoc.updatedAt) lastSaved = remoteDoc.updatedAt;

    /* 성공한 뒤에야 이전 연결을 내리고 새 연결로 교체 */
    if (unsub) { try { unsub(); } catch (e) {} }
    unsub = null;

    db = nextDb;
    docRef = nextRef;
    fsApi = fs.setDoc;
    fsMod = fs;

    unsub = fs.onSnapshot(nextRef, function (s) {
      if (!s.exists()) return;
      if (s.metadata && s.metadata.hasPendingWrites) return;  // 내가 보낸 쓰기의 메아리
      var data = s.data();
      if (!data || !data.state) return;
      if (data.updatedAt && lastSaved && data.updatedAt === lastSaved) return;
      lastSaved = data.updatedAt || null;
      lastSyncAt = Date.now();
      lastError = null;
      writeLocal(data.state);
      if (remoteChange) remoteChange(data.state);
    }, function (e) {
      setError(e);
      if (remoteChange) remoteChange(null, errText(e));
    });

    /* 이 기기에 이미 데이터가 있고 원격이 비어 있으면 올려 줍니다 */
    if (!remoteState && opts.autoUpload !== false) {
      var local = readLocal();
      if (local) {
        lastSaved = Date.now();
        await fs.setDoc(nextRef, { state: local, updatedAt: lastSaved });
        lastSyncAt = Date.now();
      }
    }

    return { existed: !!remoteState, remote: remoteState, familyId: familyId };
  }

  function disconnect() {
    if (unsub) { try { unsub(); } catch (e) {} }
    unsub = null; db = null; docRef = null; fsApi = null; fsMod = null;
    clearTimeout(pushTimer); pushTimer = null; lastSaved = null;
    mode = 'local';
  }

  /* ---------------- 공개 API ---------------- */
  var Storage = {
    DEFAULT_FIREBASE_CONFIG: DEFAULT_FIREBASE_CONFIG,
    MIN_CODE_LEN: MIN_CODE_LEN,

    get mode() { return mode; },
    get config() { return config || currentConfig(); },
    get status() {
      var gate = readGate();
      return {
        mode: mode,
        error: lastError,
        lastSyncAt: lastSyncAt,
        projectId: (config || currentConfig()).projectId,
        familyId: gate ? gate.id : null,
        hasGate: !!gate,
        secure: secureContext()
      };
    },

    /* 이 기기가 가족 열쇠를 갖고 있는가 */
    hasGate() { return !!readGate(); },
    familyId() { var g = readGate(); return g ? g.id : null; },

    /* 입장 코드 → 문서 ID 계산 (저장은 하지 않음) */
    async docIdFor(code) {
      var norm = normalizeCode(code);
      if (norm.length < MIN_CODE_LEN) {
        throw new Error('가족 입장 코드는 ' + MIN_CODE_LEN + '자 이상이어야 해요');
      }
      var hex = await sha256Hex(SALT + '|' + norm);
      return PREFIX + hex.slice(0, HASH_LEN);
    },

    /* 잠금 화면에서 입장 코드를 넣었을 때: 이 기기에 열쇠를 새깁니다 */
    async enter(code) {
      var id = await Storage.docIdFor(code);
      var prev = readGate();
      writeGate({ id: id, at: Date.now(), v: 1 });
      return { id: id, changed: !prev || prev.id !== id };
    },

    /* 이 기기 잠그기(로그아웃) — 열쇠를 지우고, 클라우드에 있던 데이터는 이 기기에서 지웁니다 */
    lock(opts) {
      var wasCloud = mode === 'firebase';
      disconnect();
      writeGate(null);
      config = null;
      lastError = null;
      if (!opts || opts.clearLocal !== false) {
        writeLocal(null);
      }
      return { wasCloud: wasCloud };
    },

    /* 입장 코드 변경 — 새 문서에 연결까지 해 본 뒤에만 열쇠를 바꿉니다 */
    async changeCode(code) {
      var id = await Storage.docIdFor(code);
      var cfg = currentConfig();
      clearTimeout(pushTimer);
      var res = await connect(cfg, id, { autoUpload: false });
      writeGate({ id: id, at: Date.now(), v: 1 });
      config = cfg;
      mode = 'firebase';
      lastError = null;
      return res;
    },

    /* 앱 시작: 열쇠가 있으면 그 문서로 연결 */
    async init(onRemoteChange) {
      remoteChange = onRemoteChange || null;
      if (!readGate()) {
        disconnect();
        return { locked: true, mode: 'local', state: readLocal() };
      }
      config = currentConfig();
      try {
        var res = await connect(config, readGate().id);
        mode = 'firebase';
        lastError = null;
        lastSyncAt = lastSyncAt || Date.now();
        return { mode: 'firebase', state: res.remote || readLocal(), remote: res.remote, existed: res.existed };
      } catch (e) {
        setError(e);
        mode = 'local';
        return { mode: 'local', state: readLocal(), error: errText(e) };
      }
    },

    load() { return readLocal(); },

    save(state, opts) {
      writeLocal(state);                       // 항상 이 기기에도 저장 (오프라인 대비)
      if (mode !== 'firebase' || !fsApi || !docRef) return;
      var push = function () {
        lastSaved = Date.now();
        fsApi(docRef, { state: state, updatedAt: lastSaved }).then(function () {
          lastSyncAt = Date.now();
          lastError = null;
        }).catch(function (e) { setError(e); });
      };
      if (opts && opts.immediate) { clearTimeout(pushTimer); push(); return; }
      clearTimeout(pushTimer);
      pushTimer = setTimeout(push, 600);
    },

    /* (고급) Firebase 설정 직접 넣기 */
    async enableFirebase(cfg) {
      var gate = readGate();
      if (!gate) throw new Error('먼저 가족 입장 코드를 넣어 주세요');
      var merged = Object.assign({}, cfg);
      var res = await connect(merged, gate.id);
      config = merged;
      writeJSON(CFG_KEY, merged);
      mode = 'firebase';
      lastError = null;
      return res;
    },

    async disableFirebase() {
      disconnect();
      config = null;
      writeJSON(CFG_KEY, null);
    },

    /* 같은 브라우저의 다른 탭과 맞추기 */
    watchLocal(cb) {
      window.addEventListener('storage', function (e) {
        if (e.key === DOC_KEY && e.newValue) {
          try { cb(JSON.parse(e.newValue)); } catch (err) {}
        }
      });
    }
  };

  return Storage;
})();
