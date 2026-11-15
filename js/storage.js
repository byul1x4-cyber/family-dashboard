/* 저장소 어댑터
 * - 기본값: localStorage (이 기기 브라우저에 저장)
 * - 설정 화면에서 Firebase(Firestore) 값을 넣으면 실시간 가족 동기화로 전환됩니다.
 *   앱 코드는 언제나 Storage.load() / Storage.save() 만 사용하므로 다른 코드는 바뀌지 않습니다.
 */
window.Storage = (function () {
  var DOC_KEY = 'family-dashboard-v1';        // localStorage 키
  var CFG_KEY = 'family-dashboard-firebase';  // Firebase 설정 저장 키

  var mode = 'local';       // 'local' | 'firebase'
  var config = null;        // { apiKey, authDomain, projectId, appId, familyId, collection }
  var db = null;
  var docRef = null;
  var unsub = null;
  var remoteChange = null;  // 화면 갱신 콜백
  var pushTimer = null;
  var lastSaved = null;

  function readConfig() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function writeConfig(cfg) {
    try {
      if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
      else localStorage.removeItem(CFG_KEY);
    } catch (e) { /* 저장 공간 없음 - 무시 */ }
  }

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(DOC_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function writeLocal(obj) {
    try { localStorage.setItem(DOC_KEY, JSON.stringify(obj)); }
    catch (e) { /* 저장 공간 부족 등 - 무시하고 계속 동작 */ }
  }

  /* ---------- Firebase ---------- */
  async function connectFirebase(cfg) {
    var version = '10.12.2';
    var appMod = await import('https://www.gstatic.com/firebasejs/' + version + '/firebase-app.js');
    var fsMod = await import('https://www.gstatic.com/firebasejs/' + version + '/firebase-firestore.js');

    var app = (appMod.getApps && appMod.getApps().length) ? appMod.getApp() : appMod.initializeApp(cfg);
    db = fsMod.getFirestore(app);
    var col = (cfg.collection || 'families');
    var fam = (cfg.familyId || 'our-family');
    docRef = fsMod.doc(db, col, fam);

    var snap = await fsMod.getDoc(docRef);
    var remoteState = snap.exists() ? snap.data() : null;

    /* 실시간 구독: 다른 기기에서 바뀌면 이 화면도 갱신 */
    if (unsub) { try { unsub(); } catch (e) {} }
    unsub = fsMod.onSnapshot(docRef, function (s) {
      if (!s.exists()) return;
      var data = s.data();
      if (!data || !data.state) return;
      if (data.updatedAt && lastSaved && data.updatedAt === lastSaved) return; // 내가 방금 저장한 것
      lastSaved = data.updatedAt || null;
      writeLocal(data.state);
      if (remoteChange) remoteChange(data.state);
    });

    /* 이 기기에 이미 쓰던 데이터가 있으면 원격이 비어 있을 때 올려 줍니다 */
    if (!remoteState || !remoteState.state) {
      var local = readLocal();
      if (local) {
        await fsMod.setDoc(docRef, { state: local, updatedAt: Date.now() });
      }
    } else {
      writeLocal(remoteState.state);
    }

    return {
      setDoc: fsMod.setDoc,
      remote: remoteState ? remoteState.state : null
    };
  }

  var fsApi = null;

  /* ---------- 공개 API ---------- */
  var Storage = {
    get mode() { return mode; },
    get config() { return config; },

    async init(onRemoteChange) {
      remoteChange = onRemoteChange || null;
      config = readConfig();
      if (config && config.apiKey && config.projectId) {
        try {
          var res = await connectFirebase(config);
          fsApi = res.setDoc;
          mode = 'firebase';
          return { mode: mode, state: res.remote || readLocal() };
        } catch (e) {
          mode = 'local';
          return { mode: mode, state: readLocal(), error: (e && e.message) || String(e) };
        }
      }
      mode = 'local';
      return { mode: mode, state: readLocal() };
    },

    load() { return readLocal(); },

    save(state, opts) {
      writeLocal(state);                       // 항상 이 기기에도 저장 (오프라인 대비)
      if (mode !== 'firebase' || !fsApi || !docRef) return;
      if (opts && opts.immediate) {
        lastSaved = Date.now();
        fsApi(docRef, { state: state, updatedAt: lastSaved }).catch(function () {});
        return;
      }
      clearTimeout(pushTimer);
      pushTimer = setTimeout(function () {
        lastSaved = Date.now();
        fsApi(docRef, { state: state, updatedAt: lastSaved }).catch(function () {});
      }, 600);
    },

    /* Firebase 설정 저장 + 즉시 연결 시도 */
    async enableFirebase(cfg) {
      config = cfg;
      var res = await connectFirebase(cfg);
      fsApi = res.setDoc;
      writeConfig(cfg);
      mode = 'firebase';
      return res;
    },

    async disableFirebase() {
      if (unsub) { try { unsub(); } catch (e) {} }
      unsub = null; db = null; docRef = null; fsApi = null;
      config = null; mode = 'local';
      writeConfig(null);
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
