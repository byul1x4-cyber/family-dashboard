/* =========================================================
   오늘 날씨 · 미세먼지 (Open-Meteo, API 키 없이 무료)
   - 위치: 서울 강남구 도곡동 (lat 37.4906, lon 127.0468)
   - 실패하면 조용히 넘어갑니다(앱에는 아무 영향 없음). 15분 캐시.
   ========================================================= */
window.Weather = (function () {
  'use strict';

  var CACHE_KEY = 'family-dashboard-weather';
  var CACHE_MS = 15 * 60 * 1000;
  var LAT = 37.4906, LON = 127.0468;
  var URL_NOW = 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON +
    '&current=temperature_2m,apparent_temperature,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=Asia%2FSeoul&forecast_days=1';
  var URL_AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + LAT + '&longitude=' + LON +
    '&current=pm10,pm2_5&timezone=Asia%2FSeoul';

  var mem = null;        // { at, data }
  var pending = null;

  var SKY = {
    0: { label: '맑음', kind: 'sun' },
    1: { label: '대체로 맑음', kind: 'sun' },
    2: { label: '구름 조금', kind: 'cloud' },
    3: { label: '흐림', kind: 'cloud' },
    45: { label: '안개', kind: 'cloud' }, 48: { label: '안개', kind: 'cloud' },
    51: { label: '이슬비', kind: 'rain' }, 53: { label: '이슬비', kind: 'rain' }, 55: { label: '이슬비', kind: 'rain' },
    56: { label: '어는 이슬비', kind: 'rain' }, 57: { label: '어는 이슬비', kind: 'rain' },
    61: { label: '비', kind: 'rain' }, 63: { label: '비', kind: 'rain' }, 65: { label: '강한 비', kind: 'rain' },
    66: { label: '어는 비', kind: 'rain' }, 67: { label: '어는 비', kind: 'rain' },
    71: { label: '눈', kind: 'snow' }, 73: { label: '눈', kind: 'snow' }, 75: { label: '많은 눈', kind: 'snow' },
    77: { label: '눈발', kind: 'snow' },
    80: { label: '소나기', kind: 'rain' }, 81: { label: '소나기', kind: 'rain' }, 82: { label: '센 소나기', kind: 'rain' },
    85: { label: '소낙눈', kind: 'snow' }, 86: { label: '소낙눈', kind: 'snow' },
    95: { label: '천둥번개', kind: 'rain' }, 96: { label: '천둥번개', kind: 'rain' }, 99: { label: '천둥번개', kind: 'rain' }
  };

  function readCache() {
    try {
      var v = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (v && v.at && v.data) return v;
    } catch (e) {}
    return null;
  }
  function writeCache(obj) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function gradeOf(pm10, pm25) {
    /* 환경부 기준: PM10 30/80/150, PM2.5 15/35/75 */
    var g10 = grade1(pm10, 30, 80, 150);
    var g25 = grade1(pm25, 15, 35, 75);
    return Math.max(g10, g25);
  }
  function grade1(v, a, b, c) {
    if (typeof v !== 'number' || isNaN(v)) return 1;
    if (v <= a) return 0;
    if (v <= b) return 1;
    if (v <= c) return 2;
    return 3;
  }
  var GRADES = [
    { key: 'good', label: '좋음', ico: '😊', cls: 'good' },
    { key: 'normal', label: '보통', ico: '🙂', cls: 'normal' },
    { key: 'bad', label: '나쁨', ico: '😷', cls: 'bad' },
    { key: 'worst', label: '매우나쁨', ico: '😨', cls: 'worst' }
  ];

  function tipFor(kind, tmax, tmin, grade) {
    if (kind === 'rain') return '우산 챙겨요 ☂';
    if (kind === 'snow') return '길 미끄러워요, 단단히 입어요 ❄';
    if (grade >= 2) return '마스크 챙겨요 😷';
    if (typeof tmax === 'number' && tmax >= 28) return '시원하게 입어요 🧊';
    if (typeof tmax === 'number' && tmax <= 4) return '두꺼운 겉옷 챙겨요 🧥';
    if (typeof tmax === 'number' && tmax <= 11) return '겉옷 한 장 챙겨요 🧥';
    if (typeof tmin === 'number' && typeof tmax === 'number' && tmax - tmin >= 9) return '아침저녁 쌀쌀해요 🧣';
    return '나들이하기 딱 좋아요 🌷';
  }

  function compose(now, air) {
    var cur = (now && now.current) || {};
    var day = (now && now.daily) || {};
    var code = Number(cur.weather_code);
    var sky = SKY[code] || { label: '날씨', kind: 'cloud' };
    var tmax = day.temperature_2m_max ? day.temperature_2m_max[0] : null;
    var tmin = day.temperature_2m_min ? day.temperature_2m_min[0] : null;
    var pop = day.precipitation_probability_max ? day.precipitation_probability_max[0] : null;
    var a = (air && air.current) || {};
    var pm10 = typeof a.pm10 === 'number' ? a.pm10 : null;
    var pm25 = typeof a.pm2_5 === 'number' ? a.pm2_5 : null;
    var g = pm10 == null && pm25 == null ? null : gradeOf(pm10, pm25);
    var kind = sky.kind;
    if (kind === 'sun' && pop >= 60) kind = 'rain';
    return {
      temp: typeof cur.temperature_2m === 'number' ? Math.round(cur.temperature_2m) : null,
      feels: typeof cur.apparent_temperature === 'number' ? Math.round(cur.apparent_temperature) : null,
      tmax: typeof tmax === 'number' ? Math.round(tmax) : null,
      tmin: typeof tmin === 'number' ? Math.round(tmin) : null,
      pop: typeof pop === 'number' ? pop : null,
      label: sky.label,
      kind: kind,
      pm10: pm10 == null ? null : Math.round(pm10),
      pm25: pm25 == null ? null : Math.round(pm25),
      grade: g == null ? null : GRADES[g],
      tip: g == null ? '오늘도 좋은 하루!' : tipFor(kind, tmax, tmin, g),
      at: Date.now()
    };
  }

  function fetchJSON(url) {
    if (!window.fetch) return Promise.reject(new Error('no fetch'));
    return window.fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r || !r.ok) throw new Error('weather ' + (r && r.status));
      return r.json();
    });
  }

  function refresh() {
    if (pending) return pending;
    pending = fetchJSON(URL_NOW).then(function (now) {
      return fetchJSON(URL_AIR).then(function (air) {
        return compose(now, air);
      }, function () {
        return compose(now, null);       // 미세먼지만 실패해도 날씨는 보여 줍니다
      });
    }).then(function (data) {
      mem = { at: Date.now(), data: data };
      writeCache(mem);
      pending = null;
      return data;
    }).catch(function () {
      pending = null;
      return null;
    });
    return pending;
  }

  /* 즉시 보여 줄 수 있는 값(캐시) */
  function cached() {
    if (mem && Date.now() - mem.at < CACHE_MS) return mem.data;
    var c = readCache();
    if (c && Date.now() - c.at < CACHE_MS) { mem = c; return c.data; }
    return null;
  }

  /* cb(data) — 캐시가 있으면 바로, 없으면 받은 뒤 한 번 더 */
  function load(cb) {
    var c = cached();
    if (c) { cb(c); }
    refresh().then(function (data) {
      if (data) cb(data);
    });
  }

  return {
    load: load,
    cached: cached,
    refresh: refresh,
    gradeList: GRADES
  };
})();
