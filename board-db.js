/* 전광판 DB 연결 (Supabase REST) — TV(board.html)와 입력판(board-input.html) 공용
 *  · DB에 저장된 시트만 DB를 사용하고, 없는 시트는 기존 구글시트/Apps Script 경로를 그대로 쓴다.
 *  · 읽기는 누구나(brd_get), 쓰기는 로그인 토큰(brd_login → brd_save)이 있어야 한다.
 *  · 마지막 정상 데이터를 localStorage에 보관해 네트워크가 끊겨도 TV가 비지 않게 한다. */
(function () {
  'use strict';
  var URL_ = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';
  var SHEET_ID = '1Wez5j_CbgdQkAr1AGq4kkl_xYD1axX_LMBIOFGspnTI';
  var CK = 'asea_board_db_v1', TK = 'asea_board_tok';
  var NAMES = { notice: '주요안내', welcome: '환영', slides: '슬라이드', rental: '대관', fonts: '서체', settings: '설정', theme: '테마설정' };
  var K2N = {}; Object.keys(NAMES).forEach(function (k) { K2N[NAMES[k]] = k; });
  var cache = {}, sig = '';
  try { cache = JSON.parse(localStorage.getItem(CK) || '{}') || {}; } catch (e) { cache = {}; }

  /* ---------- 통신 ---------- */
  function rpc(fn, args, ms) {
    var ctrl = new AbortController(), to = setTimeout(function () { ctrl.abort(); }, ms || 12000);
    return fetch(URL_ + '/rest/v1/rpc/' + fn, {
      method: 'POST', cache: 'no-store', signal: ctrl.signal,
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    }).then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('http ' + r.status); return r.json(); },
      function (e) { clearTimeout(to); throw e; });
  }
  function mkSig(o) { return Object.keys(o).sort().map(function (k) { return k + ':' + o[k].v; }).join('|'); }
  function load() {
    return rpc('brd_get').then(function (o) {
      if (!o || typeof o !== 'object') throw new Error('bad data');
      var changed = mkSig(o) !== mkSig(cache) || JSON.stringify(o) !== JSON.stringify(cache);
      cache = o; sig = mkSig(o);
      try { localStorage.setItem(CK, JSON.stringify(o)); } catch (e) {}
      return changed;
    });
  }
  function token() { try { return sessionStorage.getItem(TK) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { if (t) sessionStorage.setItem(TK, t); else sessionStorage.removeItem(TK); } catch (e) {} }
  function login(pw) {
    return rpc('brd_login', { p_pw: String(pw || '') }).then(function (r) {
      if (r && r.ok) { setToken(r.token); return { ok: true }; }
      return { ok: false, err: (r && r.err) || 'bad_password' };
    });
  }
  function save(key, content, ver) {
    return rpc('brd_save', { p_token: token(), p_name: key, p_content: content, p_ver: ver == null ? null : ver }, 20000).then(function (r) {
      if (r && r.ok) { cache[key] = { c: content, v: r.ver, t: r.t }; try { localStorage.setItem(CK, JSON.stringify(cache)); } catch (e) {} }
      else if (r && r.err === 'auth') setToken('');
      return r;
    });
  }
  function hist(key) { return rpc('brd_hist', { p_token: token(), p_name: key }); }
  function restore(key, id) { return rpc('brd_restore', { p_token: token(), p_name: key, p_id: id }).then(function (r) { if (r && r.ok) return load().then(function () { return r; }); return r; }); }
  function setPw(pw) { return rpc('brd_setpw', { p_token: token(), p_new: String(pw || '') }); }

  /* ---------- 공통 변환 도구 ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDT(s) {
    var m = String(s || '').trim().match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime() : null;
  }
  function endOfDay(s) { var t = parseDT(s); return t == null ? null : t + 86399999; }
  function yes(v) { return v === true || /^(y|yes|true|1|켜기|사용)$/i.test(String(v == null ? '' : v).trim()); }
  function driveId(url) { var m = String(url || '').match(/[?&]id=([\w-]+)|\/d\/([\w-]+)/); return m ? (m[1] || m[2]) : ''; }
  function toImgUrl(v) {
    var s = String(v || '').trim(); if (!s) return '';
    if (/^https?:\/\//.test(s) && s.indexOf('drive.google.com') < 0) return s;
    var id = driveId(s); return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1920' : s;
  }
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  function md(s) { var m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/); if (!m) return String(s); var d = new Date(+m[1], +m[2] - 1, +m[3]); return m[2] + '.' + m[3] + '(' + DOW[d.getDay()] + ')'; }

  /* 안내 문구 속 날짜(예: 10/23(금)) → 자동 종료일. 명시 종료일이 없고 '상시 게시'가 아닐 때만 쓴다. */
  function inferEnd(text, now) {
    var re = /(\d{1,2})\/(\d{1,2})/g, m, best = null, base = new Date(now || Date.now());
    while ((m = re.exec(String(text || '')))) {
      var mo = +m[1], da = +m[2]; if (mo < 1 || mo > 12 || da < 1 || da > 31) continue;
      var d = new Date(base.getFullYear(), mo - 1, da, 23, 59, 59, 999);
      if (d.getTime() < base.getTime() - 180 * 86400000) d = new Date(base.getFullYear() + 1, mo - 1, da, 23, 59, 59, 999);
      if (d.getTime() > base.getTime() + 400 * 86400000) continue;
      if (best == null || d.getTime() > best) best = d.getTime();
    }
    return best;
  }
  /* 주요안내 한 줄의 상태: on(게시 중) | pending(시작 전) | expired(종료) | off(게시 꺼짐) */
  function noticeState(r, now) {
    now = now || Date.now();
    if (!yes(r.on)) return { s: 'off' };
    var st = parseDT(r.start), en = endOfDay(r.end), auto = null;
    if (st != null && now < st) return { s: 'pending' };
    if (en != null) return now > en ? { s: 'expired', end: r.end } : { s: 'on', end: r.end };
    if (!yes(r.keep)) { auto = inferEnd(r.text, now); if (auto != null) return now > auto ? { s: 'expired', end: ymd(new Date(auto)), auto: 1 } : { s: 'on', end: ymd(new Date(auto)), auto: 1 }; }
    return { s: 'on' };
  }

  /* ---------- DB 내용 → TV가 쓰는 데이터 ---------- */
  function noticeOut(c) {
    var list = [], now = Date.now();
    (c.rows || []).forEach(function (r) { if (String(r.text || '').trim() && noticeState(r, now).s === 'on') list.push({ t: String(r.text), d: String(r.dept || '') }); });
    return { list: list, secs: (c.secs || []).map(function (x) { return Number(x) || 0; }) };
  }
  function slidesOut(grid) {
    var out = [], now = Date.now();
    (grid || []).forEach(function (r) {
      var type = String(r[1] || '').trim();
      if (!yes(r[0]) || ['공지', '현황', '행사', '사진'].indexOf(type) < 0) return;
      var st = parseDT(r[6]), en = parseDT(r[7]);
      if ((st != null && now < st) || (en != null && now > en)) return;
      var secs = String(r[5] == null ? '' : r[5]).trim().split(/\s+/).map(Number).filter(function (x) { return x > 0; });
      var s = { type: type, title: String(r[2] || ''), body: String(r[3] || ''), sec: secs[0] || 10, link: String(r[8] || '').trim() };
      if (type === '사진') {
        var urls = String(r[4] || '').split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean);
        if (!urls.length) return;
        s.photos = urls.map(function (u, i) { return { url: toImgUrl(u), sec: secs[i] || secs[0] || 10 }; });
      }
      out.push(s);
    });
    return out;
  }
  function rentalOut(c) {
    var cfg = c.cfg || {}, now = Date.now();
    if (!yes(cfg.on)) return null;
    var st = parseDT(cfg.start), en = parseDT(cfg.end);
    if ((st != null && now < st) || (en != null && now > en)) return null;
    var evs = [];
    (c.rows || []).forEach(function (r) {
      var p = String(r.date || '').split('~'), a = p[0].trim(), b = (p[1] || p[0]).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a)) return;
      if (endOfDay(b) != null && endOfDay(b) < now) return;          // 종료된 행은 자동 미표시
      var d = p.length > 1 && b !== a ? md(a) + ' ~ ' + md(b) : md(a);
      var t = r.from || r.to ? (String(r.from || '') + '~' + String(r.to || '')).replace(/^~|~$/g, '') : '종일';
      evs.push({ k: a, d: d, t: t, p: String(r.place || ''), n: String(r.what || '') });
    });
    if (!evs.length) return null;
    evs.sort(function (x, y) { return x.k < y.k ? -1 : x.k > y.k ? 1 : 0; });
    return { type: '대관', title: String(cfg.title || '시설 대관 안내'), events: evs, sec: Number(cfg.secs) || 12 };
  }
  /* API(Apps Script)가 준 data 위에 DB에 있는 시트만 덮어쓴다. DB에 없으면 data 그대로. */
  function overlay(data) {
    data = data || {};
    var o = {}; Object.keys(data).forEach(function (k) { o[k] = data[k]; });
    try {
      if (cache.notice) { var n = noticeOut(cache.notice.c || {}); o.notices = n.list; o.noticeSecs = n.secs; }
      if (cache.settings) {
        var kv = {}; ((cache.settings.c || {}).rows || []).forEach(function (r) { kv[String(r.key || '').trim()] = String(r.value == null ? '' : r.value); });
        if (kv['테마'] != null) o.theme = kv['테마'] || '하늘';
        if (kv['티커문구'] != null) o.ticker = kv['티커문구'];
        if (kv['날씨효과'] != null) o.fxMode = kv['날씨효과'];
        if (kv['사운드'] != null) o.sound = yes(kv['사운드']) ? '켜기' : '끄기';
        if (kv['볼륨'] != null) o.volume = Number(kv['볼륨']) || 0;
        if (kv['배경음악'] != null) o.music = kv['배경음악'];
        if (kv['음악볼륨'] != null) o.musicVol = Number(kv['음악볼륨']) || 0;
        if (kv['인사기능'] != null) o.greet = yes(kv['인사기능']) ? '켜기' : '끄기';
      }
      if (cache.theme) {
        o.schedule = ((cache.theme.c || {}).rows || []).filter(function (r) { return yes(r.on); })
          .map(function (r) { return r.theme + ':' + Math.max(1, Number(r.mins) || 5); }).join(',');
      }
      if (cache.slides || cache.rental) {
        var sl = cache.slides ? slidesOut((cache.slides.c || {}).grid) : (o.slides || []).filter(function (s) { return s.type !== '대관'; });
        var rs = cache.rental ? rentalOut(cache.rental.c || {}) : ((o.slides || []).filter(function (s) { return s.type === '대관'; })[0] || null);
        var plain = sl.filter(function (s) { return s.type !== '사진'; }), photos = sl.filter(function (s) { return s.type === '사진'; });
        o.slides = plain.concat(rs ? [rs] : [], photos);
      }
    } catch (e) { return data; }
    return o;
  }
  /* 환영·슬라이드·서체는 기존 gviz 파서가 그대로 읽도록 시트 모양(2차원 배열)을 돌려준다. */
  function grid(sheetName) {
    var k = K2N[sheetName];
    if (k && (k === 'welcome' || k === 'slides' || k === 'fonts') && cache[k] && cache[k].c && cache[k].c.grid) return cache[k].c.grid;
    return null;
  }

  /* ---------- 구글시트 → DB 가져오기(최초 1회 이전용) ---------- */
  function gviz(name, cb) {
    var fn = '__bgv' + (gviz.n = (gviz.n || 0) + 1), s = document.createElement('script'), done = false;
    function clean() { try { delete window[fn]; } catch (e) { window[fn] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); }
    window[fn] = function (res) {
      done = true;
      try { cb(((res && res.table && res.table.rows) || []).map(function (r) { return (r.c || []).map(function (c) { return c && c.v != null ? c.v : ''; }); })); } catch (e) { cb(null); }
      clean();
    };
    s.onerror = function () { if (!done) { cb(null); clean(); } };
    s.src = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?headers=0&sheet=' + encodeURIComponent(name) + '&tqx=responseHandler:' + fn + '&t=' + Date.now();
    document.head.appendChild(s);
    setTimeout(function () { if (!done) { cb(null); clean(); } }, 15000);
  }
  function isNote(a) { return /^\s*(\[입력|\[사용법|\[서체|·)/.test(String(a || '')); }
  function importSheet(key, cb) {
    gviz(NAMES[key], function (g) {
      if (!g) { cb(null); return; }
      var c;
      try {
        if (key === 'welcome' || key === 'slides' || key === 'fonts') c = { grid: g };
        else if (key === 'notice') {
          var rows = [];
          for (var i = 1; i < g.length; i++) {
            var a = String(g[i][0] || ''); if (isNote(a)) break; if (!a.trim()) continue;
            var hid = /^\s*[\[\-]/.test(a);
            rows.push({ text: hid ? a.replace(/^\s*[\[\-]\s*/, '') : a, dept: String(g[i][1] || ''), start: '', end: '', keep: false, on: !hid });
          }
          var secs = [1, 2, 3].map(function (n) { return Number((g[n] || [])[4]) || 0; });
          c = { secs: secs, rows: rows };
        } else if (key === 'rental') {
          var cfg = { on: yes((g[0] || [])[1]), title: String((g[1] || [])[1] || ''), secs: Number((g[2] || [])[1]) || 12, mode: String((g[3] || [])[1] || '순환'), start: String((g[4] || [])[1] || ''), end: String((g[5] || [])[1] || '') };
          var rr = [];
          for (var j = 8; j < g.length; j++) {
            var d = String(g[j][0] || ''); if (isNote(d)) break; if (!d.trim()) continue;
            rr.push({ date: d, from: String(g[j][1] || ''), to: String(g[j][2] || ''), place: String(g[j][3] || ''), what: String(g[j][4] || '') });
          }
          c = { cfg: cfg, rows: rr };
        } else if (key === 'settings') {
          var sr = [];
          for (var k = 0; k < g.length; k++) { var kk = String(g[k][0] || ''); if (isNote(kk)) break; if (kk.trim()) sr.push({ key: kk.trim(), value: String(g[k][1] == null ? '' : g[k][1]) }); }
          c = { rows: sr };
        } else if (key === 'theme') {
          var tr = [];
          for (var t = 1; t < g.length; t++) { var nm = String(g[t][0] || '').trim(); if (nm) tr.push({ theme: nm, on: yes(g[t][1]), mins: Number(g[t][2]) || 5 }); }
          c = { rows: tr };
        }
      } catch (e) { c = null; }
      cb(c);
    });
  }

  window.BoardDB = {
    names: NAMES, load: load, has: function (k) { return !!cache[k]; }, content: function (k) { return cache[k] ? cache[k].c : null; },
    ver: function (k) { return cache[k] ? cache[k].v : null; }, stamp: function (k) { return cache[k] ? cache[k].t : null; },
    any: function () { return Object.keys(cache).length > 0; }, sig: function () { return sig; },
    overlay: overlay, grid: grid, token: token, setToken: setToken, login: login, save: save, hist: hist, restore: restore, setPw: setPw,
    importSheet: importSheet, noticeState: noticeState, inferEnd: inferEnd, yes: yes, ymd: ymd, md: md
  };
})();
