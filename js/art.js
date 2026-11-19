/* =========================================================
   우리집 다모아 · 그림(일러스트) 모음
   '다!다!다!' 감성의 큼직하고 귀여운 SVG를 코드로 그립니다.
   이미지 파일 없이 어디서나 또렷하게 보이도록 인라인 SVG로 넣습니다.
   ========================================================= */
window.Art = (function () {
  'use strict';

  var seq = 0;
  function uid(p) { seq += 1; return (p || 'a') + seq; }

  /* ---------- 아이 얼굴 아바타 ---------- */
  var KIDS = {
    minguk: {
      skin: '#FFE0C9', skinShade: '#F7C9AC',
      hair: '#3F312B', hair2: '#544038',
      shirt: '#7FD3B0', shirt2: '#B7EBD7',
      bg1: '#DCF6EA', bg2: '#EAF9F3',
      style: 'short'
    },
    ijun: {
      skin: '#FFE5D2', skinShade: '#FAD0B4',
      hair: '#7A4B2A', hair2: '#9A6238',
      shirt: '#FFD98A', shirt2: '#FFF0C4',
      bg1: '#FFF2CC', bg2: '#FFF9E6',
      style: 'fluffy'
    }
  };

  function hairPath(style) {
    if (style === 'fluffy') {
      /* 이준(동생): 짧고 동글동글한 남자아이 머리 + 정수리에 짧게 삐친 머리칼 하나
         (귀 옆으로 길게 내려오는 머리칼은 없앱니다) */
      return '<path d="M23 51c-3-19 9-29 27-29s31 10 28 29c-2 1-3-1-4-3-2-6-5-8-9-9-6 1-11 2-15 2s-9-1-15-2c-4 1-7 3-9 9-1 2-2 4-3 3z" fill="HAIR"/>' +
        '<path d="M52 22c1-4 4-7 7-6 2 1 1 4-1 5-2 1-4 2-6 1z" fill="HAIR2"/>';
    }
    /* 민국(형): 단정한 짧은 보이컷 + 옆가르마 */
    return '<path d="M22 51c-3-19 10-29 28-29s31 10 28 29c-1 1-3 0-4-2-2-6-5-9-10-10-6 1-10 2-14 2s-8-1-14-2c-5 1-8 4-10 10-1 2-3 3-4 2z" fill="HAIR"/>' +
      '<path d="M55 23c8 2 14 7 16 15-4-7-9-11-16-12z" fill="HAIR2" opacity=".9"/>';
  }

  /* size: px(숫자) 또는 CSS 크기 문자열 */
  function kid(id, opts) {
    opts = opts || {};
    var c = KIDS[id] || KIDS.minguk;
    var g = uid('kb');
    var hair = hairPath(c.style).replace(/HAIR2/g, c.hair2).replace(/HAIR/g, c.hair);
    var smile = opts.happy === false
      ? '<path d="M45 61h10" stroke="#C4704F" stroke-width="2.4" stroke-linecap="round"/>'
      : '<path d="M44 60c2 4 5 5 6 5s4-1 6-5" stroke="#C4704F" stroke-width="2.4" stroke-linecap="round" fill="none"/>';
    var svg = '' +
      '<svg class="ava-svg" viewBox="0 0 100 100" role="img" aria-label="' + (id === 'ijun' ? '이준' : '민국') + ' 그림">' +
        '<defs>' +
          '<linearGradient id="' + g + 'bg" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="' + c.bg1 + '"/><stop offset="1" stop-color="' + c.bg2 + '"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<circle cx="50" cy="50" r="49" fill="url(#' + g + 'bg)"/>' +
        '<circle cx="50" cy="50" r="49" fill="none" stroke="#FFFFFF" stroke-width="3"/>' +
        /* 몸(옷) */
        '<path d="M16 100c2-16 15-25 34-25s32 9 34 25z" fill="' + c.shirt + '"/>' +
        '<path d="M16 100c1-8 4-14 9-18l7 18z" fill="' + c.shirt2 + '" opacity=".7"/>' +
        '<path d="M84 100c-1-8-4-14-9-18l-7 18z" fill="' + c.shirt2 + '" opacity=".7"/>' +
        '<circle cx="50" cy="78" r="4" fill="#FFFFFF" opacity=".8"/>' +
        /* 귀 */
        '<circle cx="24" cy="52" r="6" fill="' + c.skin + '"/><circle cx="76" cy="52" r="6" fill="' + c.skin + '"/>' +
        /* 얼굴 */
        '<circle cx="50" cy="50" r="27" fill="' + c.skin + '"/>' +
        '<path d="M50 74c8 0 14-3 18-8-4 8-11 12-18 12s-14-4-18-12c4 5 10 8 18 8z" fill="' + c.skinShade + '" opacity=".45"/>' +
        hair +
        /* 눈썹 */
        '<path d="M37 43c2-2 7-2 9 0" stroke="' + c.hair + '" stroke-width="2" stroke-linecap="round" fill="none" opacity=".8"/>' +
        '<path d="M54 43c2-2 7-2 9 0" stroke="' + c.hair + '" stroke-width="2" stroke-linecap="round" fill="none" opacity=".8"/>' +
        /* 눈 */
        '<ellipse cx="41.5" cy="51" rx="3" ry="3.6" fill="#3B2F2A"/>' +
        '<ellipse cx="58.5" cy="51" rx="3" ry="3.6" fill="#3B2F2A"/>' +
        '<circle cx="42.6" cy="49.8" r="1.1" fill="#fff"/><circle cx="59.6" cy="49.8" r="1.1" fill="#fff"/>' +
        /* 볼 */
        '<circle cx="33" cy="58" r="4.4" fill="#FFA9B4" opacity=".55"/>' +
        '<circle cx="67" cy="58" r="4.4" fill="#FFA9B4" opacity=".55"/>' +
        smile +
      '</svg>';
    return wrapSvg(svg, opts);
  }

  function wrapSvg(svg, opts) {
    opts = opts || {};
    if (!opts.size) return svg;
    var size = typeof opts.size === 'number' ? opts.size + 'px' : opts.size;
    return svg.replace('<svg class="ava-svg"', '<svg class="ava-svg" style="width:' + size + ';height:' + size + '"');
  }

  /* ---------- 시간대 배너 그림 ---------- */
  function morningArt() {
    var g = uid('sun');
    return '<svg class="tb-art-svg" viewBox="0 0 120 120" aria-hidden="true">' +
      '<defs><radialGradient id="' + g + '"><stop offset="0" stop-color="#FFE79A"/><stop offset="1" stop-color="#FFC24D"/></radialGradient></defs>' +
      '<g stroke="#FFD778" stroke-width="4" stroke-linecap="round" opacity=".9">' +
        '<path d="M60 8v12M60 100v12M8 60h12M100 60h12M23 23l9 9M88 88l9 9M97 23l-9 9M32 88l-9 9"/>' +
      '</g>' +
      '<circle cx="60" cy="60" r="26" fill="url(#' + g + ')"/>' +
      '<circle cx="52" cy="56" r="2.6" fill="#B77A1E"/><circle cx="68" cy="56" r="2.6" fill="#B77A1E"/>' +
      '<path d="M52 66c3 4 13 4 16 0" stroke="#B77A1E" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<circle cx="45" cy="64" r="3.4" fill="#FF9C8A" opacity=".55"/><circle cx="75" cy="64" r="3.4" fill="#FF9C8A" opacity=".55"/>' +
      '<ellipse cx="24" cy="92" rx="17" ry="9" fill="#fff" opacity=".92"/><ellipse cx="36" cy="86" rx="11" ry="8" fill="#fff" opacity=".92"/>' +
      '</svg>';
  }
  function nightArt() {
    var g = uid('moon');
    return '<svg class="tb-art-svg" viewBox="0 0 120 120" aria-hidden="true">' +
      '<defs><radialGradient id="' + g + '"><stop offset="0" stop-color="#FFF6DA"/><stop offset="1" stop-color="#FFE18F"/></radialGradient></defs>' +
      '<path d="M76 22a34 34 0 1 0 22 34 27 27 0 0 1-22-34z" fill="url(#' + g + ')"/>' +
      '<g fill="#FFF3C4">' +
        '<path d="M30 26l2.6 6.4L39 35l-6.4 2.6L30 44l-2.6-6.4L21 35l6.4-2.6z"/>' +
        '<path d="M92 78l2 4.8 4.8 2-4.8 2-2 4.8-2-4.8-4.8-2 4.8-2z"/>' +
        '<circle cx="44" cy="88" r="2.6"/><circle cx="102" cy="40" r="2.2"/>' +
      '</g>' +
      '<ellipse cx="34" cy="66" rx="20" ry="10" fill="#FFFFFF" opacity=".2"/>' +
      '</svg>';
  }
  function dayArt() {
    return '<svg class="tb-art-svg" viewBox="0 0 120 120" aria-hidden="true">' +
      '<circle cx="44" cy="44" r="19" fill="#FFE18F"/>' +
      '<ellipse cx="70" cy="58" rx="24" ry="13" fill="#fff" opacity=".95"/>' +
      '<ellipse cx="88" cy="50" rx="15" ry="11" fill="#fff" opacity=".95"/>' +
      '<ellipse cx="46" cy="86" rx="26" ry="12" fill="#fff" opacity=".8"/>' +
      '<g stroke="#BFE6FF" stroke-width="3" stroke-linecap="round" opacity=".8">' +
        '<path d="M14 104h20M44 108h26M82 104h18"/></g>' +
      '</svg>';
  }

  /* ---------- 하늘·무지개·기린 (성장 카드) ---------- */
  function giraffeCard() {
    var g = uid('sky');
    return '<svg class="giraffe-svg" viewBox="0 0 200 130" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="' + g + 'sky" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#CDEEFF"/><stop offset="1" stop-color="#EAF9FF"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="200" height="130" rx="16" fill="url(#' + g + 'sky)"/>' +
      /* 무지개 */
      '<g fill="none" stroke-width="6" stroke-linecap="round" opacity=".95">' +
        '<path d="M28 104a46 46 0 0 1 92 0" stroke="#FF9E8A"/>' +
        '<path d="M34 104a40 40 0 0 1 80 0" stroke="#FFCE6B"/>' +
        '<path d="M40 104a34 34 0 0 1 68 0" stroke="#9FD98F"/>' +
        '<path d="M46 104a28 28 0 0 1 56 0" stroke="#7FC3EC"/>' +
        '<path d="M52 104a22 22 0 0 1 44 0" stroke="#B9A6E8"/>' +
      '</g>' +
      /* 구름 */
      '<ellipse cx="42" cy="30" rx="20" ry="10" fill="#fff"/><ellipse cx="56" cy="26" rx="13" ry="9" fill="#fff"/>' +
      '<ellipse cx="150" cy="24" rx="17" ry="8" fill="#fff"/>' +
      /* 해 */
      '<circle cx="172" cy="46" r="12" fill="#FFE07A"/>' +
      /* 풀밭 */
      '<path d="M0 104h200v26H0z" fill="#B9E6B1"/>' +
      '<path d="M0 110c24-6 42 4 66 0s44-8 66-2 44 4 68-2v24H0z" fill="#A6DC9D"/>' +
      /* 기린 */
      '<g>' +
        '<rect x="118" y="62" width="9" height="44" rx="4" fill="#F7C86B"/>' +
        '<rect x="130" y="66" width="8" height="40" rx="4" fill="#F2BE58"/>' +
        '<rect x="124" y="86" width="8" height="24" rx="4" fill="#F7C86B"/>' +
        '<rect x="136" y="88" width="8" height="22" rx="4" fill="#F2BE58"/>' +
        '<ellipse cx="130" cy="70" rx="18" ry="13" fill="#FFD980"/>' +
        '<rect x="120" y="46" width="11" height="28" rx="5" fill="#FFD980"/>' +
        '<circle cx="124" cy="42" r="11" fill="#FFDF9B"/>' +
        '<path d="M115 36c-2-6 2-9 6-8 3 1 4 5 3 8z" fill="#F0A94B"/>' +
        '<path d="M134 36c-2-6 2-9 6-8 3 1 4 5 3 8z" fill="#F0A94B"/>' +
        '<circle cx="121" cy="42" r="2.2" fill="#6B4A16"/>' +
        '<circle cx="130" cy="42" r="2.2" fill="#6B4A16"/>' +
        '<ellipse cx="126" cy="48" rx="3" ry="2" fill="#E08A5A"/>' +
        /* 무늬 */
        '<circle cx="128" cy="66" r="3.2" fill="#EBA44A" opacity=".8"/>' +
        '<circle cx="136" cy="74" r="2.6" fill="#EBA44A" opacity=".8"/>' +
        '<circle cx="122" cy="76" r="2.6" fill="#EBA44A" opacity=".8"/>' +
        /* 꼬리 */
        '<path d="M112 66c-6 2-8 8-6 12" stroke="#F0A94B" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '</g>' +
      /* 꽃 */
      '<g fill="#FF97C1"><circle cx="34" cy="112" r="3"/><circle cx="70" cy="116" r="2.5"/><circle cx="176" cy="114" r="2.5"/></g>' +
      '</svg>';
  }

  /* ---------- 타일 아이콘 그림 ---------- */
  function trayIcon() {
    return '<svg viewBox="0 0 64 64" class="tile-art" aria-hidden="true">' +
      '<rect x="5" y="13" width="54" height="40" rx="13" fill="#FFFDF5" stroke="#EFD9AE" stroke-width="2.5"/>' +
      '<circle cx="23" cy="29" r="8.5" fill="#FFD24D"/>' +
      '<circle cx="23" cy="29" r="3.2" fill="#FFB01F"/>' +
      '<rect x="35" y="21" width="16" height="7" rx="3.5" fill="#8FD47F"/>' +
      '<rect x="35" y="31" width="16" height="7" rx="3.5" fill="#FF9A82"/>' +
      '<rect x="14" y="41" width="36" height="6" rx="3" fill="#9FD3F5"/>' +
      '</svg>';
  }
  function mailboxIcon() {
    return '<svg viewBox="0 0 64 64" class="tile-art" aria-hidden="true">' +
      '<rect x="9" y="23" width="36" height="24" rx="11" fill="#FFFDFB" stroke="#F3A6C6" stroke-width="2.5"/>' +
      '<path d="M9 33h36" stroke="#F7BBD4" stroke-width="3"/>' +
      '<rect x="40" y="17" width="6" height="30" rx="3" fill="#F58FBD"/>' +
      '<path d="M43 17h9a4.5 4.5 0 0 1 0 9h-9z" fill="#F56CA8"/>' +
      '<circle cx="26" cy="39" r="3.4" fill="#F56CA8"/>' +
      '</svg>';
  }
  function routineIcon() {
    return '<svg viewBox="0 0 64 64" class="tile-art" aria-hidden="true">' +
      '<rect x="11" y="9" width="42" height="48" rx="13" fill="#FFFDFB" stroke="#DACFF6" stroke-width="2.5"/>' +
      '<rect x="19" y="19" width="17" height="5" rx="2.5" fill="#B7A9EF"/>' +
      '<rect x="19" y="29" width="26" height="5" rx="2.5" fill="#D8D0F4"/>' +
      '<rect x="19" y="39" width="21" height="5" rx="2.5" fill="#D8D0F4"/>' +
      '<circle cx="44" cy="44" r="12" fill="#5CC79C"/>' +
      '<path d="M38.5 44l4 4.2L50 40.5" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
  }
  function pillIcon() {
    return '<svg viewBox="0 0 64 64" class="tile-art" aria-hidden="true">' +
      '<g transform="rotate(-35 32 32)">' +
        '<rect x="12" y="23" width="40" height="18" rx="9" fill="#fff"/>' +
        '<path d="M32 23h11a9 9 0 0 1 0 18H32z" fill="#FFB3CE"/>' +
      '</g></svg>';
  }
  function cartIcon() {
    return '<svg viewBox="0 0 64 64" class="tile-art" aria-hidden="true">' +
      '<path d="M10 16h7l6 24h24l6-18H22" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="27" cy="48" r="4" fill="#fff"/><circle cx="45" cy="48" r="4" fill="#fff"/>' +
      '</svg>';
  }
  function calendarIcon() {
    return '<svg viewBox="0 0 64 64" class="tile-art" aria-hidden="true">' +
      '<rect x="10" y="14" width="44" height="40" rx="10" fill="#fff"/>' +
      '<path d="M10 26h44" stroke="#FFD778" stroke-width="5"/>' +
      '<circle cx="24" cy="36" r="3.4" fill="#FFB3CE"/><circle cx="34" cy="36" r="3.4" fill="#C7BDF0"/>' +
      '<circle cx="44" cy="36" r="3.4" fill="#9FD98F"/><circle cx="24" cy="46" r="3.4" fill="#CDEBFF"/>' +
      '</svg>';
  }

  /* ---------- 날씨 ---------- */
  function weatherArt(kind) {
    var k = kind || 'cloud';
    if (k === 'sun') {
      return '<svg viewBox="0 0 80 80" class="wx-svg" aria-hidden="true">' +
        '<circle cx="40" cy="40" r="18" fill="#FFD24D"/>' +
        '<g stroke="#FFD24D" stroke-width="5" stroke-linecap="round"><path d="M40 6v8M40 66v8M6 40h8M66 40h8M16 16l6 6M58 58l6 6M64 16l-6 6M22 58l-6 6"/></g>' +
        '</svg>';
    }
    if (k === 'rain') {
      return '<svg viewBox="0 0 80 80" class="wx-svg" aria-hidden="true">' +
        '<ellipse cx="34" cy="32" rx="20" ry="13" fill="#CFE6F7"/><ellipse cx="50" cy="28" rx="14" ry="11" fill="#DCEFFB"/>' +
        '<g stroke="#6FA8E0" stroke-width="4" stroke-linecap="round"><path d="M26 48l-4 10M40 48l-4 10M54 48l-4 10"/></g>' +
        '</svg>';
    }
    if (k === 'snow') {
      return '<svg viewBox="0 0 80 80" class="wx-svg" aria-hidden="true">' +
        '<ellipse cx="34" cy="30" rx="20" ry="13" fill="#E3F0FA"/><ellipse cx="50" cy="26" rx="14" ry="11" fill="#F1F8FE"/>' +
        '<g fill="#8EC2E8"><circle cx="26" cy="52" r="3"/><circle cx="40" cy="58" r="3"/><circle cx="54" cy="50" r="3"/></g>' +
        '</svg>';
    }
    if (k === 'night') {
      return '<svg viewBox="0 0 80 80" class="wx-svg" aria-hidden="true">' +
        '<path d="M50 18a24 24 0 1 0 14 26 19 19 0 0 1-14-26z" fill="#FFE18F"/>' +
        '<g fill="#FFF3C4"><path d="M20 24l1.8 4.4L26 30l-4.2 1.6L20 36l-1.8-4.4L14 30l4.2-1.6z"/><circle cx="60" cy="58" r="2.2"/></g>' +
        '</svg>';
    }
    return '<svg viewBox="0 0 80 80" class="wx-svg" aria-hidden="true">' +
      '<ellipse cx="34" cy="36" rx="21" ry="14" fill="#DDEAF6"/><ellipse cx="52" cy="32" rx="15" ry="12" fill="#EDF4FB"/>' +
      '<circle cx="24" cy="34" r="2.4" fill="#9CB6CC"/><circle cx="30" cy="34" r="2.4" fill="#9CB6CC"/>' +
      '</svg>';
  }

  /* =========================================================
     🌅 등교 준비 큰 그림 (10분할 카드용)
     · 카드 하나에 200×150 그림 — 남자아이가 그 동작을 하는 모습
     · 아이마다 머리·옷 색만 바꿔 같은 그림을 씁니다.
     ========================================================= */
  function schFace(c) {
    var hair = hairPath(c.style).replace(/HAIR2/g, c.hair2).replace(/HAIR/g, c.hair);
    return '<circle cx="24" cy="52" r="6" fill="' + c.skin + '"/><circle cx="76" cy="52" r="6" fill="' + c.skin + '"/>' +
      '<circle cx="50" cy="50" r="27" fill="' + c.skin + '"/>' +
      '<path d="M50 74c8 0 14-3 18-8-4 8-11 12-18 12s-14-4-18-12c4 5 10 8 18 8z" fill="' + c.skinShade + '" opacity=".38"/>' +
      hair +
      '<path d="M37 43c2-2 7-2 9 0" stroke="' + c.hair + '" stroke-width="2" stroke-linecap="round" fill="none" opacity=".8"/>' +
      '<path d="M54 43c2-2 7-2 9 0" stroke="' + c.hair + '" stroke-width="2" stroke-linecap="round" fill="none" opacity=".8"/>' +
      '<ellipse cx="41.5" cy="51" rx="3" ry="3.6" fill="#3B2F2A"/>' +
      '<ellipse cx="58.5" cy="51" rx="3" ry="3.6" fill="#3B2F2A"/>' +
      '<circle cx="42.6" cy="49.8" r="1.1" fill="#fff"/><circle cx="59.6" cy="49.8" r="1.1" fill="#fff"/>' +
      '<circle cx="33" cy="58" r="4.4" fill="#FFA9B4" opacity=".5"/>' +
      '<circle cx="67" cy="58" r="4.4" fill="#FFA9B4" opacity=".5"/>' +
      '<path d="M44 60c2 4 5 5 6 5s4-1 6-5" stroke="#C4704F" stroke-width="2.4" stroke-linecap="round" fill="none"/>';
  }
  /* feet = (0,0) 기준으로 서 있는 아이 (머리 꼭대기 약 -106) */
  function schBoy(c, o) {
    o = o || {};
    var arms = o.arms || 'down';
    var shorts = '#7E9AD8';
    var shoe = '#5B6C93';
    var head = '<g transform="translate(0,-87) scale(.72) translate(-50,-50)">' + schFace(c) + '</g>';
    function arm(side, up) {
      var sx = side * 17;
      if (up) {
        return '<g transform="rotate(' + (side * 38) + ' ' + sx + ' -62)">' +
          '<rect x="' + (sx - 5.5) + '" y="-99" width="11" height="40" rx="5.5" fill="' + c.shirt + '" stroke="#fff" stroke-width="1.6"/>' +
          '<circle cx="' + sx + '" cy="-100" r="6.4" fill="' + c.skin + '" stroke="#fff" stroke-width="1.2"/>' +
          '</g>';
      }
      return '<g transform="rotate(' + (side * 9) + ' ' + sx + ' -62)">' +
        '<rect x="' + (sx - 5.5) + '" y="-66" width="11" height="34" rx="5.5" fill="' + c.shirt + '" stroke="#fff" stroke-width="1.6"/>' +
        '<circle cx="' + sx + '" cy="-33" r="6.4" fill="' + c.skin + '" stroke="#fff" stroke-width="1.2"/>' +
        '</g>';
    }
    var s = '';
    /* 다리·신발 */
    s += '<rect x="-16" y="-38" width="12.5" height="34" rx="6" fill="' + shorts + '" stroke="#fff" stroke-width="1.4"/>' +
      '<rect x="3.5" y="-38" width="12.5" height="34" rx="6" fill="' + shorts + '" stroke="#fff" stroke-width="1.4"/>' +
      '<ellipse cx="-10" cy="-4" rx="10" ry="5.5" fill="' + shoe + '"/>' +
      '<ellipse cx="10" cy="-4" rx="10" ry="5.5" fill="' + shoe + '"/>' +
      '<ellipse cx="-10" cy="-5.5" rx="9" ry="2.6" fill="#fff" opacity=".35"/>' +
      '<ellipse cx="10" cy="-5.5" rx="9" ry="2.6" fill="#fff" opacity=".35"/>';
    /* 몸통 */
    s += '<rect x="-21" y="-72" width="42" height="42" rx="15" fill="' + c.shirt + '" stroke="#fff" stroke-width="1.6"/>' +
      '<path d="M-6.5 -72h13v8a6.5 6.5 0 0 1-13 0z" fill="' + c.skin + '" opacity=".5"/>' +
      '<circle cx="0" cy="-46" r="5.6" fill="#fff" opacity=".6"/>' +
      '<path d="M-20 -35c4 3 10 4 20 4s16-1 20-4" stroke="' + c.shirt2 + '" stroke-width="3" fill="none" opacity=".85"/>';
    /* 팔 */
    s += arm(-1, arms === 'up' || arms === 'one-up') + arm(1, arms === 'up');
    /* 머리 */
    s += '<rect x="-5" y="-74" width="10" height="7" rx="3" fill="' + c.skin + '"/>' + head;
    return s;
  }
  function schoolArt(kind, childId) {
    var c = KIDS[childId] || KIDS.minguk;
    var g = uid('sa');
    var bg = ['#FFF4DE', '#FFE8CE'], inner = '', label = '등교 준비';
    if (kind === 'wash') { bg = ['#EAF8F2', '#DCF1E8']; }
    else if (kind === 'dress') { bg = ['#FFF1F5', '#FFE1EB']; }
    else if (kind === 'eat') { bg = ['#FFFAE2', '#FFF0C2']; }
    else if (kind === 'bag') { bg = ['#EDF5FF', '#DDE9FF']; }

    if (kind === 'wake') {
      label = '스스로 일어나기 그림';
      inner =
        '<rect x="10" y="10" width="58" height="46" rx="10" fill="#EAF7FF" stroke="#fff" stroke-width="5"/>' +
        '<path d="M39 13v40M13 33h52" stroke="#fff" stroke-width="4"/>' +
        '<circle cx="27" cy="24" r="8" fill="#FFD24D"/>' +
        '<g stroke="#FFD24D" stroke-width="2.6" stroke-linecap="round"><path d="M27 12v3M27 33v3M15 24h3M36 24h3M18 15l2 2M34 31l2 2"/></g>' +
        '<g fill="#FFE9A8" opacity=".6"><circle cx="76" cy="20" r="3"/><circle cx="86" cy="38" r="2.2"/><circle cx="70" cy="44" r="2"/></g>' +
        '<ellipse cx="112" cy="132" rx="26" ry="6" fill="#000" opacity=".06"/>' +
        '<g transform="translate(112,132)">' + schBoy(c, { arms: 'up' }) + '</g>' +
        '<rect x="58" y="112" width="134" height="26" rx="12" fill="#FFC9AC"/>' +
        '<rect x="58" y="112" width="134" height="8" rx="4" fill="#FFE2D2"/>' +
        '<rect x="100" y="101" width="92" height="16" rx="8" fill="#A5DBF3"/>' +
        '<rect x="100" y="101" width="92" height="6" rx="3" fill="#CBEcFA"/>' +
        '<rect x="62" y="99" width="34" height="16" rx="8" fill="#fff"/>' +
        '<rect x="66" y="103" width="26" height="6" rx="3" fill="#F1F8FF"/>' +
        '<g transform="translate(30,120)">' +
          '<circle cx="0" cy="0" r="13" fill="#FFE9A8" stroke="#F0B44C" stroke-width="3"/>' +
          '<path d="M0 0v-6M0 0l5 3" stroke="#B4741E" stroke-width="2.4" stroke-linecap="round"/>' +
          '<circle cx="0" cy="0" r="2.6" fill="#B4741E"/>' +
          '<path d="M-10-10l-4-4M10-10l4-4" stroke="#F0B44C" stroke-width="3.4" stroke-linecap="round"/>' +
        '</g>' +
        '<rect x="6" y="134" width="48" height="7" rx="3.5" fill="#E7C79C"/>';
    } else if (kind === 'wash') {
      label = '세수·양치하기 그림';
      inner =
        '<rect x="104" y="10" width="82" height="56" rx="14" fill="#DCEFFF" stroke="#fff" stroke-width="5"/>' +
        '<path d="M112 22l16-6" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".9"/>' +
        '<g fill="#CFE9F7" opacity=".7"><circle cx="150" cy="40" r="3"/><circle cx="166" cy="50" r="2"/></g>' +
        '<ellipse cx="62" cy="142" rx="24" ry="5" fill="#000" opacity=".06"/>' +
        '<g transform="translate(62,142)">' + schBoy(c, { arms: 'one-up' }) + '</g>' +
        /* 칫솔 (들어 올린 손) */
        '<g transform="rotate(-32 28 46)"><rect x="25.6" y="32" width="5" height="22" rx="2.5" fill="#9FD8F5"/>' +
          '<rect x="24.4" y="24" width="8.4" height="9.5" rx="3.2" fill="#fff"/></g>' +
        '<rect x="96" y="96" width="96" height="18" rx="9" fill="#F7F2E6"/>' +
        '<ellipse cx="146" cy="98" rx="31" ry="11" fill="#CFE9F7" stroke="#fff" stroke-width="3"/>' +
        '<path d="M146 74v-10a8 8 0 0 1 16 0" stroke="#B9CBD8" stroke-width="5" fill="none" stroke-linecap="round" transform="translate(-16 0)"/>' +
        '<path d="M130 80c-3 4-3 8 0 10M130 94c-2 3-2 5 0 6" stroke="#9BD3F2" stroke-width="3" stroke-linecap="round" fill="none"/>' +
        '<rect x="166" y="66" width="16" height="22" rx="6" fill="#FFD98A"/>' +
        '<path d="M170 66v-8M176 66v-10" stroke="#9FD8F5" stroke-width="4" stroke-linecap="round"/>' +
        '<g fill="#fff" opacity=".85"><circle cx="96" cy="52" r="6"/><circle cx="86" cy="38" r="4"/><circle cx="104" cy="30" r="3"/></g>';
    } else if (kind === 'dress') {
      label = '옷 갈아입기 그림';
      inner =
        '<rect x="142" y="14" width="48" height="128" rx="11" fill="#F6DFC6" stroke="#fff" stroke-width="5"/>' +
        '<path d="M166 16v124" stroke="#fff" stroke-width="3" opacity=".8"/>' +
        '<circle cx="162" cy="78" r="2.6" fill="#C79A63"/><circle cx="170" cy="78" r="2.6" fill="#C79A63"/>' +
        '<g transform="translate(150,26)"><path d="M8 0l4 8h-8z" fill="#C79A63"/>' +
          '<path d="M-4 32l12-24 12 24z" fill="#9ED9F3"/><rect x="-4" y="30" width="24" height="6" rx="3" fill="#7FC3EC"/></g>' +
        '<ellipse cx="74" cy="142" rx="24" ry="5" fill="#000" opacity=".06"/>' +
        '<g transform="translate(74,142)">' + schBoy(c, { arms: 'up' }) + '</g>' +
        '<g transform="translate(24,120)"><rect x="0" y="8" width="34" height="9" rx="4.5" fill="#C9B7E8"/>' +
          '<rect x="4" y="0" width="26" height="9" rx="4.5" fill="#FFD98A"/></g>' +
        '<g fill="#FFC46B"><path d="M112 40l2.4 5.8 5.8 2.4-5.8 2.4-2.4 5.8-2.4-5.8-5.8-2.4 5.8-2.4z"/></g>' +
        '<g fill="#FFC46B" opacity=".85"><circle cx="56" cy="42" r="2.4"/><circle cx="100" cy="30" r="2"/></g>';
    } else if (kind === 'eat') {
      label = '아침밥 먹기 그림';
      inner =
        '<ellipse cx="62" cy="144" rx="26" ry="5" fill="#000" opacity=".06"/>' +
        '<g transform="translate(62,144)">' + schBoy(c, { arms: 'one-up' }) + '</g>' +
        /* 들고 있는 숟가락 (입 쪽으로) */
        '<g transform="rotate(-24 32 56)"><rect x="30" y="44" width="4.6" height="26" rx="2.3" fill="#D9CFC7"/>' +
          '<ellipse cx="32.3" cy="42" rx="5" ry="6.5" fill="#E6DED8"/></g>' +
        /* 밥그릇 */
        '<path d="M118 94h46l-5.5 13a9 9 0 0 1-8.4 6h-18.2a9 9 0 0 1-8.4-6z" fill="#FFFFFF" stroke="#CFE3F5" stroke-width="2.6"/>' +
        '<path d="M120 94c3-10 42-10 45 0z" fill="#FFFDF4" stroke="#E9F1F8" stroke-width="1.6"/>' +
        '<circle cx="134" cy="90" r="1.8" fill="#EFE7DC"/><circle cx="146" cy="88" r="1.8" fill="#EFE7DC"/>' +
        '<path d="M132 84c-2-5 3-6 1-11M144 84c-2-5 3-6 1-11" stroke="#E4D9C6" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
        /* 국그릇 */
        '<ellipse cx="176" cy="100" rx="15" ry="7.5" fill="#FFE1C4" stroke="#fff" stroke-width="2.4"/>' +
        '<ellipse cx="176" cy="99" rx="10" ry="4.4" fill="#FFD1A6"/>' +
        /* 상 */
        '<rect x="4" y="112" width="192" height="16" rx="8" fill="#E9C79E"/>' +
        '<rect x="4" y="112" width="192" height="5" rx="2.5" fill="#F6E0C4"/>' +
        '<path d="M18 128h9v13H18zM172 128h9v13h-9z" fill="#D8B183"/>' +
        '<rect x="96" y="112" width="30" height="5" rx="2.5" fill="#FFF6E4" opacity=".7"/>';
    } else {
      label = '가방·물통 챙기기 그림';
      inner =
        '<rect x="8" y="16" width="60" height="126" rx="10" fill="#F3E1C6" stroke="#fff" stroke-width="5"/>' +
        '<rect x="16" y="26" width="44" height="46" rx="6" fill="#FFF8EC"/>' +
        '<circle cx="60" cy="80" r="4" fill="#C79A63"/>' +
        '<ellipse cx="108" cy="142" rx="26" ry="5" fill="#000" opacity=".06"/>' +
        /* 등 뒤 가방 */
        '<g transform="translate(108,142)"><rect x="6" y="-78" width="34" height="48" rx="13" fill="#FF9E72"/>' +
          '<rect x="6" y="-62" width="34" height="16" rx="7" fill="#FFB992"/>' +
          '<rect x="16" y="-74" width="14" height="6" rx="3" fill="#FFD8C2"/></g>' +
        '<g transform="translate(108,142)">' + schBoy(c, { arms: 'one-up' }) + '</g>' +
        /* 가슴끈 */
        '<path d="M96 62c8 6 20 6 28 0" stroke="#FF9E72" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="0"/>' +
        /* 물통 */
        '<g transform="translate(158,120)"><rect x="0" y="0" width="16" height="26" rx="6" fill="#9FD8F5"/>' +
          '<rect x="3" y="-5" width="10" height="7" rx="3" fill="#7FC3EC"/></g>' +
        '<g fill="#FFD24D"><path d="M150 34l2.4 5.6 5.6 2.4-5.6 2.4-2.4 5.6-2.4-5.6-5.6-2.4 5.6-2.4z"/></g>' +
        '<g fill="#fff" opacity=".9"><circle cx="132" cy="26" r="3"/><circle cx="176" cy="60" r="2.4"/></g>';
    }
    return '<svg class="scard-svg" viewBox="0 0 200 150" role="img" aria-label="' + label + '">' +
      '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="' + bg[0] + '"/><stop offset="1" stop-color="' + bg[1] + '"/>' +
      '</linearGradient></defs>' +
      '<rect x="0" y="0" width="200" height="150" rx="20" fill="url(#' + g + ')"/>' +
      inner +
    '</svg>';
  }

  /* ---------- 작은 장식 ---------- */
  function starRay() {
    return '<svg viewBox="0 0 24 24" class="mini-star" aria-hidden="true"><path d="M12 2l2.9 6.3L22 9.3l-5 4.9 1.2 7L12 17.8 5.8 21.2 7 14.2 2 9.3l7.1-1z" fill="#FFD24D"/></svg>';
  }

  return {
    kid: kid,
    morningArt: morningArt,
    nightArt: nightArt,
    dayArt: dayArt,
    giraffeCard: giraffeCard,
    trayIcon: trayIcon,
    mailboxIcon: mailboxIcon,
    routineIcon: routineIcon,
    pillIcon: pillIcon,
    cartIcon: cartIcon,
    calendarIcon: calendarIcon,
    weatherArt: weatherArt,
    schoolArt: schoolArt
  };
})();
