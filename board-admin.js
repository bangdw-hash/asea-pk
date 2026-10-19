/* 전광판 관리자 UI — 입력판(board-input.html)과 TV 화면 직접 편집(board.html)이 함께 쓴다.
 *  BoardAdmin.page(root)  : 입력판 전체 화면(메뉴 + 목록 + 편집)
 *  BoardAdmin.tv()        : board.html 위에 클릭 영역을 덮고 팝업으로 수정
 *  저장은 시트 단위로 BoardDB.save(버전 확인 + 이력 보관)를 거친다. */
(function () {
  'use strict';
  var DB = window.BoardDB; if (!DB) return;
  var DEPTS = ['교육처', '기획처', '기종교육원', '항공정비계열', '항공보안계열', '학생처', '총무처'];
  var yes = DB.yes;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }
  function num(v, d) { var n = Number(v); return isFinite(n) && String(v).trim() !== '' ? n : (d == null ? 0 : d); }
  function str(v) { return v == null ? '' : String(v); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- 시트 정의 ---------- */
  var SHEETS = {
    notice: {
      label: '주요 안내', fixed: false,
      cfg: [{ k: 's1', l: '1페이지 표시초', t: 'num', hint: '0 = 글자 수에 따라 자동' }, { k: 's2', l: '2페이지 표시초', t: 'num', hint: '0 = 자동' }, { k: 's3', l: '3페이지 표시초', t: 'num', hint: '0 = 자동(4페이지부터도 자동)' }],
      fields: [
        { k: 'text', l: '안내 문구', t: 'area' },
        { k: 'dept', l: '담당부서', t: 'text', list: DEPTS },
        { k: 'start', l: '게시 시작일', t: 'date' },
        { k: 'end', l: '게시 종료일', t: 'date', hint: '비워 두면 문구 속 날짜(예: 10/23)를 종료일로 보고 다음 날 자동으로 내립니다.' },
        { k: 'keep', l: '종료일과 관계없이 계속 게시', t: 'sw' },
        { k: 'on', l: '게시', t: 'sw' }],
      blank: function () { return { text: '', dept: '', start: '', end: '', keep: false, on: true }; },
      from: function (c) { var s = c.secs || []; return { cfg: { s1: num(s[0]), s2: num(s[1]), s3: num(s[2]) }, rows: (c.rows || []).map(function (r) { return { text: str(r.text), dept: str(r.dept), start: str(r.start), end: str(r.end), keep: yes(r.keep), on: r.on !== false }; }) }; },
      to: function (m) { return { secs: [num(m.cfg.s1), num(m.cfg.s2), num(m.cfg.s3)], rows: m.rows.map(function (r) { return { text: str(r.text).trim(), dept: str(r.dept).trim(), start: str(r.start), end: str(r.end), keep: !!r.keep, on: !!r.on }; }) }; },
      sum: function (r) { var s = DB.noticeState(r); var t = { on: ['게시 중', 'ok'], pending: ['시작 전', 'warn'], expired: ['종료됨', 'off'], off: ['게시 꺼짐', 'off'] }[s.s]; var m = [r.dept, [t[0] + (s.end ? ' · ' + (s.auto ? '자동 ' : '') + '~' + s.end.slice(5) : ''), t[1]]]; return { t: r.text || '(빈 안내)', m: m }; },
      check: function (m, e) {
        m.cfg && ['s1', 's2', 's3'].forEach(function (k) { if (m.cfg[k] < 0 || m.cfg[k] > 600) e.push('페이지 표시초는 0~600 사이로 입력해 주세요.'); });
        m.rows.forEach(function (r, i) { var n = '주요 안내 ' + (i + 1) + '번: ';
          if (!str(r.text).trim()) e.push(n + '안내 문구를 입력해 주세요.');
          if (str(r.text).length > 400) e.push(n + '문구가 400자를 넘습니다.');
          if (!dateOk(r.start) || !dateOk(r.end)) e.push(n + '날짜 형식은 2026-10-23 입니다.');
          if (r.start && r.end && r.start > r.end) e.push(n + '시작일이 종료일보다 늦습니다.'); });
      }
    },
    welcome: {
      label: '환영 문구', fixed: false,
      cfg: [{ k: 'on', l: '환영 화면 게시', t: 'sw' }, { k: 'target', l: '대상(큰 글자)', t: 'area', wide: 1 }, { k: 'text', l: '문구', t: 'area', wide: 1 }, { k: 'mode', l: '모드', t: 'sel', o: ['순환', '고정'] }, { k: 'secs', l: '표시초', t: 'num' }, { k: 'start', l: '시작 일시', t: 'text', ph: '2026-10-21 09:00' }, { k: 'end', l: '종료 일시', t: 'text', ph: '2026-10-21 17:00' }, { k: 'banner', l: '배너 표시', t: 'sw' }, { k: 'overlap', l: '슬라이드 사이사이에 삽입', t: 'sw' }],
      fields: [{ k: 'target', l: '환영 문구(1줄)', t: 'text' }, { k: 'sub', l: '보조 문구', t: 'text' }],
      blank: function () { return { target: '', sub: '' }; },
      from: function (c) {
        var g = c.grid || [], kv = {}, rows = [];
        g.forEach(function (r) {
          var a = str(r[0]).replace(/\s/g, ''), b = str(r[1]);
          if (a.indexOf('배너') === 0) kv.banner = b; else if (a.indexOf('게시') === 0) kv.on = b; else if (a === '대상') kv.target = b; else if (a === '문구') kv.text = b;
          else if (a === '모드') kv.mode = b; else if (a === '표시초') kv.secs = b; else if (a.indexOf('시작') === 0) kv.start = b; else if (a.indexOf('종료') === 0) kv.end = b; else if (a.indexOf('겹침') === 0) kv.overlap = b;
          if (str(r[3]).trim() !== '' && !isNaN(Number(r[3]))) rows.push({ target: str(r[4]), sub: str(r[5]) });
        });
        return { cfg: { on: yes(kv.on), target: str(kv.target), text: str(kv.text), mode: /고정|환영만/.test(str(kv.mode)) ? '고정' : '순환', secs: num(kv.secs, 20), start: str(kv.start), end: str(kv.end), banner: yes(kv.banner), overlap: yes(kv.overlap) }, rows: rows };
      },
      to: function (m) {
        var c = m.cfg, YN = function (v) { return v ? 'Y' : 'N'; };
        var kv = [['게시(Y/N)', YN(c.on)], ['대상', str(c.target)], ['문구', str(c.text)], ['모드', c.mode], ['표시초', String(num(c.secs, 20))], ['시작일시', str(c.start)], ['종료일시', str(c.end)], ['배너(Y/N)', YN(c.banner)], ['겹침', YN(c.overlap)]];
        var n = Math.max(kv.length, m.rows.length + 1), g = [];
        for (var i = 0; i < n; i++) {
          var k = kv[i] || ['', ''], row = [k[0], k[1], ''];
          if (i === 0) row.push('번호', '대상', '문구'); else if (m.rows[i - 1]) row.push(i, str(m.rows[i - 1].target), str(m.rows[i - 1].sub)); else row.push('', '', '');
          g.push(row);
        }
        return { grid: g };
      },
      sum: function (r) { return { t: r.target || '(빈 문구)', m: [r.sub] }; },
      check: function (m, e) {
        var c = m.cfg; if (!dtOk(c.start) || !dtOk(c.end)) e.push('환영 시작·종료 일시는 2026-10-21 09:00 형식입니다.');
        if (num(c.secs, 20) < 3 || num(c.secs, 20) > 600) e.push('환영 표시초는 3~600 사이로 입력해 주세요.');
        if (c.on && !str(c.target).trim()) e.push('환영 화면을 게시하려면 대상(큰 글자)을 입력해 주세요.');
      }
    },
    slides: {
      label: '슬라이드', fixed: false,
      fields: [
        { k: 'on', l: '사용', t: 'sw' }, { k: 'type', l: '유형', t: 'sel', o: ['공지', '현황', '행사', '사진', '포스터', '영상'] },
        { k: 'title', l: '제목', t: 'text' }, { k: 'body', l: '내용', t: 'area', hint: '현황은 한 줄에 항목:값 형식입니다. 사진은 줄마다 사진별 설명을 씁니다.' },
        { k: 'img', l: '이미지·영상 주소', t: 'area', hint: '사진은 한 줄에 한 장입니다(구글 드라이브 공유 링크 가능). 영상은 유튜브 또는 mp4 주소 1개.' },
        { k: 'secs', l: '표시초', t: 'text', hint: '사진은 장마다 공백으로 구분(예: 10 8 8). 영상은 비우면 끝까지, 계속 입력 시 반복.' },
        { k: 'start', l: '시작 일시', t: 'text', ph: '2026-10-19 09:00' }, { k: 'end', l: '종료 일시', t: 'text', ph: '2026-10-25 18:00' },
        { k: 'link', l: '링크 주소(QR 표시)', t: 'text' }, { k: 'ts', l: '제목 크기(%)', t: 'text' }, { k: 'bs', l: '내용 크기(%)', t: 'text' }],
      blank: function () { return { on: true, type: '공지', title: '', body: '', img: '', secs: '10', start: '', end: '', link: '', ts: '', bs: '' }; },
      from: function (c) {
        var rows = []; (c.grid || []).forEach(function (r, i) {
          if (i === 0 && /사용/.test(str(r[0]))) return;
          if (!r.some(function (x) { return str(x).trim() !== ''; })) return;
          rows.push({ on: yes(r[0]), type: str(r[1]).trim(), title: str(r[2]), body: str(r[3]), img: str(r[4]), secs: str(r[5]), start: str(r[6]), end: str(r[7]), link: str(r[8]), ts: str(r[9]), bs: str(r[10]) });
        });
        return { cfg: null, rows: rows };
      },
      to: function (m) { var g = [['사용', '유형', '제목', '내용', '이미지URL', '표시초', '시작일시', '종료일시', '링크URL', '제목크기%', '내용크기%']]; m.rows.forEach(function (r) { g.push([r.on ? 'Y' : 'N', r.type, r.title, r.body, r.img, str(r.secs), r.start, r.end, r.link, r.ts, r.bs]); }); return { grid: g }; },
      sum: function (r) { return { t: (r.title || '(제목 없음)'), m: [r.type, [r.on ? '사용' : '꺼짐', r.on ? 'ok' : 'off'], r.body && r.type === '사진' ? r.body.split('\n')[0] : ''] }; },
      check: function (m, e) { m.rows.forEach(function (r, i) { var n = '슬라이드 ' + (i + 1) + '번: ';
        if (['공지', '현황', '행사', '사진', '포스터', '영상'].indexOf(r.type) < 0) e.push(n + '유형을 선택해 주세요.');
        if (r.on && (r.type === '사진' || r.type === '포스터' || r.type === '영상') && !str(r.img).trim()) e.push(n + '이미지(영상) 주소를 입력해 주세요.');
        if (r.on && !str(r.title).trim() && r.type !== '사진' && r.type !== '영상') e.push(n + '제목을 입력해 주세요.');
        if (!dtOk(r.start) || !dtOk(r.end)) e.push(n + '시작·종료 일시는 2026-10-19 09:00 형식입니다.'); }); }
    },
    rental: {
      label: '시설 대관', fixed: false,
      cfg: [{ k: 'on', l: '대관 화면 게시', t: 'sw' }, { k: 'title', l: '제목', t: 'text' }, { k: 'secs', l: '표시초', t: 'num' }, { k: 'start', l: '시작 일시', t: 'text', ph: '비우면 항상' }, { k: 'end', l: '종료 일시', t: 'text', ph: '비우면 항상' }],
      fields: [{ k: 'date', l: '날짜', t: 'text', ph: '2026-11-07 또는 2026-11-07~2026-11-08', hint: '요일별 시간이 다르면 날짜별로 행을 나눕니다. 종료된 행은 자동으로 내려갑니다.' }, { k: 'from', l: '시작 시간', t: 'text', ph: '10:00' }, { k: 'to', l: '종료 시간', t: 'text', ph: '17:00' }, { k: 'place', l: '장소', t: 'text', list: ['체육관', '대강당', '306호', '공항종합실습장'] }, { k: 'what', l: '내용', t: 'text' }],
      blank: function () { return { date: '', from: '', to: '', place: '', what: '' }; },
      from: function (c) { var g = c.cfg || {}; return { cfg: { on: yes(g.on), title: str(g.title), secs: num(g.secs, 12), start: str(g.start), end: str(g.end) }, rows: (c.rows || []).map(function (r) { return { date: str(r.date), from: str(r.from), to: str(r.to), place: str(r.place), what: str(r.what) }; }) }; },
      to: function (m) { return { cfg: { on: !!m.cfg.on, title: str(m.cfg.title), secs: num(m.cfg.secs, 12), mode: '순환', start: str(m.cfg.start), end: str(m.cfg.end) }, rows: m.rows }; },
      sum: function (r) { return { t: r.what || '(내용 없음)', m: [r.date, r.place] }; },
      check: function (m, e) { m.rows.forEach(function (r, i) { var n = '대관 ' + (i + 1) + '번: ';
        if (!/^\d{4}-\d{2}-\d{2}(~\d{4}-\d{2}-\d{2})?$/.test(str(r.date).trim())) e.push(n + '날짜는 2026-11-07 또는 2026-11-07~2026-11-08 형식입니다.'); }); if (!dtOk(m.cfg.start) || !dtOk(m.cfg.end)) e.push('대관 시작·종료 일시 형식을 확인해 주세요.'); }
    },
    fonts: {
      label: '서체·글자 크기', fixed: true,
      fields: [{ k: 'area', l: '구역', t: 'text', ro: 1 }, { k: 'font', l: '서체', t: 'text', list: ['KoPubWorldDotum Bold', 'KoPubWorldDotum Medium', 'KoPubWorldDotum Light'], hint: 'TV PC에 설치되었거나 HTML에 포함된 서체만 실제로 표시됩니다.' }, { k: 'size', l: '글자 크기(%)', t: 'num', hint: '50~200, 100이 기본입니다.' }, { k: 'text', l: '문구(상단 제목·부제만)', t: 'text' }],
      blank: function () { return { area: '', font: '', size: '', text: '' }; },
      from: function (c) { var rows = []; (c.grid || []).forEach(function (r) { var a = str(r[0]).trim(); if (!a || /^(\[|·)/.test(a)) return; rows.push({ area: a, font: str(r[1]), size: str(r[2]), text: str(r[3]) }); }); return { cfg: null, rows: rows }; },
      to: function (m) { return { grid: m.rows.map(function (r) { return [r.area, r.font, r.size === '' ? '' : String(r.size), r.text]; }) }; },
      sum: function (r) { return { t: r.area, m: [r.font, r.size !== '' ? r.size + '%' : ''] }; },
      check: function (m, e) { m.rows.forEach(function (r) { if (r.size !== '' && (num(r.size, -1) < 50 || num(r.size, -1) > 200)) e.push(r.area + ': 글자 크기는 50~200 사이입니다.'); }); }
    },
    settings: {
      label: '화면 설정', fixed: true,
      fields: [{ k: 'key', l: '항목', t: 'text', ro: 1 }, { k: 'value', l: '값', t: 'text', optsFor: function (r) { return { '날씨효과': ['자동', '비', '눈', '끄기'], '사운드': ['켜기', '끄기'], '배경음악': ['끄기', '팝', '시티팝', '로파이', '랜덤'], '인사기능': ['Y', 'N'], '테마': ['스케줄', '자동'] }[r.key]; } }],
      blank: function () { return { key: '', value: '' }; },
      from: function (c) { return { cfg: null, rows: (c.rows || []).map(function (r) { return { key: str(r.key), value: str(r.value) }; }) }; },
      to: function (m) { return { rows: m.rows }; },
      sum: function (r) { return { t: r.key, m: [r.value] }; },
      check: function (m, e) { m.rows.forEach(function (r) { if ((r.key === '볼륨' || r.key === '음악볼륨') && (num(r.value, -1) < 0 || num(r.value, -1) > 100)) e.push(r.key + '은 0~100 사이입니다.'); }); }
    },
    theme: {
      label: '테마 순환', fixed: true,
      fields: [{ k: 'theme', l: '테마', t: 'text', ro: 1 }, { k: 'on', l: '순환에 사용', t: 'sw' }, { k: 'mins', l: '표시 시간(분)', t: 'num' }],
      blank: function () { return { theme: '', on: false, mins: 5 }; },
      from: function (c) { return { cfg: null, rows: (c.rows || []).map(function (r) { return { theme: str(r.theme), on: yes(r.on), mins: num(r.mins, 5) }; }) }; },
      to: function (m) { return { rows: m.rows.map(function (r) { return { theme: r.theme, on: !!r.on, mins: Math.max(1, Math.min(120, num(r.mins, 5))) }; }) }; },
      sum: function (r) { return { t: r.theme, m: [[r.on ? '사용' : '미사용', r.on ? 'ok' : 'off'], r.mins + '분'] }; },
      check: function () { }
    }
  };
  function dateOk(s) { return !s || /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function dtOk(s) { return !str(s).trim() || /^\d{4}-\d{1,2}-\d{1,2}([ T]+\d{1,2}:\d{2})?$/.test(str(s).trim()); }

  /* ---------- 상태 ---------- */
  var ST = {};   // key -> {m, ver, dirty, sel, loaded}
  function st(key) {
    if (!ST[key]) {
      var c = DB.content(key);
      ST[key] = c ? { m: SHEETS[key].from(clone(c)), ver: DB.ver(key), dirty: false, sel: null, loaded: true } : { m: null, ver: 0, dirty: false, sel: null, loaded: false };
    }
    return ST[key];
  }
  function anyDirty() { return Object.keys(ST).some(function (k) { return ST[k].dirty; }); }

  /* ---------- 스타일 ---------- */
  var CSS = '.bk{font:14px/1.5 "Malgun Gothic",system-ui,sans-serif;color:#1b2433;--pr:#1A73E8;--prd:#1557B0;--prl:#E8F0FE;--ln:#d6dde8;--bad:#dc2626;--ok:#16a34a;--warn:#ea580c}'
    + '.bk *{box-sizing:border-box}.bk button,.bk input,.bk select,.bk textarea{font:inherit;color:inherit}'
    + '.bk-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--ln);background:#fff}.bk-bar h3{margin:0;font-size:16px}.bk-bar .sp{flex:1}'
    + '.bk-st{font-size:12px;padding:2px 8px;border:1px solid var(--ln);border-radius:6px;background:#f4f6fa;color:#5d6b82}.bk-st.dirty{background:#fff7ed;color:var(--warn);border-color:#fdba74}.bk-st.ok{background:#dcfce7;color:#166534;border-color:#86efac}'
    + '.bk-b{border:1px solid var(--ln);background:#fff;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600}.bk-b:hover{background:#f4f6fa}.bk-b.pri{background:var(--pr);border-color:var(--pr);color:#fff}.bk-b.pri:hover{background:var(--prd)}.bk-b.dng{color:var(--bad);border-color:#fca5a5}.bk-b:disabled{opacity:.5;cursor:not-allowed}'
    + '.bk-cfg{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px 12px;padding:10px 14px;background:var(--prl);border-bottom:1px solid var(--ln)}.bk-cfg .wide{grid-column:1/-1}'
    + '.bk-main{display:grid;grid-template-columns:minmax(220px,320px) minmax(0,1fr);min-height:300px}@media(max-width:720px){.bk-main{grid-template-columns:1fr}}'
    + '.bk-list{border-right:1px solid var(--ln);padding:8px;display:flex;flex-direction:column;gap:6px;overflow:auto;max-height:60vh;background:#fafbfd}'
    + '.bk-it{border:1px solid var(--ln);background:#fff;border-radius:6px;padding:7px 9px;cursor:pointer;display:flex;gap:6px;flex-direction:column}.bk-it.sel{border-color:var(--pr);box-shadow:0 0 0 2px #cfe0fb}.bk-it.over{outline:2px solid var(--pr)}.bk-it.drag{opacity:.4}'
    + '.bk-it b{font-weight:600;overflow-wrap:anywhere;font-size:13px}.bk-m{display:flex;gap:5px;flex-wrap:wrap;font-size:12px;color:#5d6b82}'
    + '.bk-pl{font-size:11.5px;padding:0 7px;border-radius:6px;border:1px solid var(--ln);background:#f4f6fa}.bk-pl.ok{background:#dcfce7;color:#166534;border-color:#86efac}.bk-pl.warn{background:#ffedd5;color:#9a3412;border-color:#fdba74}.bk-pl.off{color:#6b7280}'
    + '.bk-form{padding:12px 14px;overflow:auto;max-height:60vh}.bk-f{display:flex;flex-direction:column;gap:3px;margin-bottom:10px}.bk-f label{font-size:12px;color:#5d6b82}.bk-f small{font-size:11.5px;color:#7a8799}'
    + '.bk input[type=text],.bk input[type=date],.bk input[type=number],.bk select,.bk textarea,.bk input[type=password]{width:100%;border:1px solid var(--ln);border-radius:6px;padding:6px 8px;background:#fff}.bk textarea{min-height:64px;resize:vertical}.bk input:read-only{background:#f4f6fa}'
    + '.bk-sw{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--ln);border-radius:6px;background:#fff;padding:4px 10px;cursor:pointer}.bk-sw i{width:30px;height:16px;border-radius:8px;background:#cbd5e1;position:relative;display:block}.bk-sw i::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:.15s}.bk-sw[aria-checked=true] i{background:var(--ok)}.bk-sw[aria-checked=true] i::after{left:16px}'
    + '.bk-msg{padding:8px 14px;font-size:13px}.bk-msg.err{background:#fee2e2;color:#991b1b}.bk-msg.ok{background:#dcfce7;color:#166534}.bk-msg.inf{background:#E8F0FE;color:#1e3a8a}.bk-msg ul{margin:4px 0 0 18px;padding:0}'
    + '.bk-empty{padding:24px;text-align:center;color:#5d6b82}.bk-imp{padding:28px 20px;max-width:560px;margin:0 auto;text-align:center}.bk-imp p{color:#5d6b82}'
    + '.bk-ov{position:fixed;inset:0;background:rgba(10,15,25,.5);z-index:99995;display:flex;align-items:center;justify-content:center;padding:14px}.bk-dlg{background:#fff;border-radius:6px;max-width:min(980px,100%);width:100%;max-height:94vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.4)}.bk-dlg.sm{max-width:380px;padding:18px}'
    + '.bk-dlg.sm h4{margin:0 0 10px;font-size:16px}.bk-row{display:flex;gap:8px;margin-top:12px;justify-content:flex-end}'
    + '.bk-tvbar{position:fixed;bottom:calc(6vh + 10px);left:50%;transform:translateX(-50%);z-index:99990;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;background:rgba(255,255,255,.96);border:1px solid #d6dde8;border-radius:6px;padding:6px 8px;box-shadow:0 4px 18px rgba(0,0,0,.3);max-width:96vw}'
    + '.bk-tvbar .bk-b{padding:4px 10px;font-size:13px}.bk-hs{position:fixed;z-index:99980;border:2px dashed #1A73E8;border-radius:6px;background:rgba(26,115,232,.08);cursor:pointer}.bk-hs:hover{background:rgba(26,115,232,.22)}.bk-hs span{position:absolute;right:6px;top:6px;background:#1A73E8;color:#fff;font:600 13px "Malgun Gothic",sans-serif;padding:2px 8px;border-radius:6px}'
    + '.bk-page{max-width:1200px;margin:0 auto}.bk-nav{display:flex;gap:6px;flex-wrap:wrap;padding:10px 14px;background:#fff;border-bottom:1px solid var(--ln)}.bk-nav button{border:1px solid var(--ln);background:#fff;border-radius:6px;padding:7px 14px;cursor:pointer;font-weight:600}.bk-nav button[aria-current=true]{background:var(--pr);border-color:var(--pr);color:#fff}'
    + 'body.brd-edit{cursor:auto!important}';
  function injectCss() { if (document.getElementById('bk-css')) return; var s = document.createElement('style'); s.id = 'bk-css'; s.textContent = CSS; document.head.appendChild(s); }

  /* ---------- 공통 대화상자 ---------- */
  function modal(html, cls) {
    var ov = document.createElement('div'); ov.className = 'bk bk-ov'; ov.innerHTML = '<div class="bk-dlg ' + (cls || '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(ov); return ov;
  }
  function toast(msg) { var t = document.createElement('div'); t.className = 'bk'; t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1b2433;color:#fff;padding:8px 16px;border-radius:6px;z-index:99999;font-size:14px'; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2400); }
  function login(done) {
    if (DB.token()) { done(); return; }
    var ov = modal('<h4>관리자 로그인</h4><div class="bk-f"><label for="bkpw">비밀번호</label><input id="bkpw" type="password" autocomplete="current-password"></div><div class="bk-msg err" id="bkerr" hidden></div><div class="bk-row"><button type="button" class="bk-b" data-x="c">취소</button><button type="button" class="bk-b pri" data-x="ok">로그인</button></div>', 'sm');
    var pw = ov.querySelector('#bkpw'), er = ov.querySelector('#bkerr'); pw.focus();
    function go() {
      er.hidden = true; var b = ov.querySelector('[data-x=ok]'); b.disabled = true;
      DB.login(pw.value).then(function (r) { b.disabled = false; if (r.ok) { ov.remove(); done(); } else { er.hidden = false; er.textContent = r.err === 'locked' ? '실패가 많아 10분간 잠겼습니다. 잠시 후 다시 시도해 주세요.' : '비밀번호가 맞지 않습니다.'; pw.select(); } },
        function () { b.disabled = false; er.hidden = false; er.textContent = '서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.'; });
    }
    ov.addEventListener('click', function (e) { var x = e.target.getAttribute && e.target.getAttribute('data-x'); if (x === 'c') ov.remove(); if (x === 'ok') go(); });
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); if (e.key === 'Escape') ov.remove(); });
  }
  function changePw() {
    login(function () {
      var ov = modal('<h4>비밀번호 변경</h4><div class="bk-f"><label for="bkn1">새 비밀번호(8자 이상)</label><input id="bkn1" type="password" autocomplete="new-password"></div><div class="bk-f"><label for="bkn2">한 번 더 입력</label><input id="bkn2" type="password" autocomplete="new-password"></div><div class="bk-msg err" id="bkerr" hidden></div><div class="bk-row"><button type="button" class="bk-b" data-x="c">취소</button><button type="button" class="bk-b pri" data-x="ok">변경</button></div>', 'sm');
      var er = ov.querySelector('#bkerr');
      ov.addEventListener('click', function (e) {
        var x = e.target.getAttribute && e.target.getAttribute('data-x'); if (x === 'c') ov.remove(); if (x !== 'ok') return;
        var a = ov.querySelector('#bkn1').value, b = ov.querySelector('#bkn2').value;
        if (a.length < 8) { er.hidden = false; er.textContent = '8자 이상으로 입력해 주세요.'; return; }
        if (a !== b) { er.hidden = false; er.textContent = '두 번 입력한 값이 다릅니다.'; return; }
        DB.setPw(a).then(function (r) { if (r && r.ok) { DB.setToken(''); ov.remove(); toast('비밀번호를 바꿨습니다. 다시 로그인해 주세요.'); } else { er.hidden = false; er.textContent = '변경하지 못했습니다. 다시 로그인한 뒤 시도해 주세요.'; } }, function () { er.hidden = false; er.textContent = '서버에 연결하지 못했습니다.'; });
      });
    });
  }

  /* ---------- 시트 화면 ---------- */
  function fieldHTML(def, row, id, key) {
    var v = row[def.k], h = '<div class="bk-f"><label for="' + id + '">' + esc(def.l) + '</label>', dl = '';
    var list = def.list || (def.optsFor && def.optsFor(row));
    if (list) dl = '<datalist id="' + id + 'dl">' + list.map(function (o) { return '<option value="' + esc(o) + '">'; }).join('') + '</datalist>';
    if (def.t === 'sw') return '<div class="bk-f"><label>' + esc(def.l) + '</label><button type="button" class="bk-sw" role="switch" id="' + id + '" aria-checked="' + !!v + '" data-sw="' + def.k + '"><i></i><span>' + (v ? '켜짐' : '꺼짐') + '</span></button></div>';
    if (def.t === 'area') h += '<textarea id="' + id + '" data-f="' + def.k + '">' + esc(v) + '</textarea>';
    else if (def.t === 'sel') h += '<select id="' + id + '" data-f="' + def.k + '">' + def.o.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
    else h += '<input id="' + id + '" type="' + (def.t === 'num' ? 'number' : def.t === 'date' ? 'date' : 'text') + '" data-f="' + def.k + '" value="' + esc(v) + '"' + (def.ro ? ' readonly' : '') + (def.ph ? ' placeholder="' + esc(def.ph) + '"' : '') + (list ? ' list="' + id + 'dl"' : '') + '>' + dl;
    if (def.hint) h += '<small>' + esc(def.hint) + '</small>';
    return h + '</div>';
  }
  function SheetView(root, key, opts) {
    opts = opts || {}; var D = SHEETS[key], s = st(key), msg = null, uid = 'bk' + Math.random().toString(36).slice(2, 7);
    function visIdx() { var out = []; if (!s.m) return out; s.m.rows.forEach(function (r, i) { if (!opts.filter || opts.filter(r)) out.push(i); }); return out; }
    function stat() { return s.dirty ? ['변경됨 · 저장 필요', 'dirty'] : (DB.has(key) ? ['저장됨 · v' + s.ver + (DB.stamp(key) ? ' · ' + String(DB.stamp(key)).slice(5, 16).replace('T', ' ') : ''), 'ok'] : ['DB에 없음', '']); }
    function render() {
      if (!s.loaded) { root.innerHTML = '<div class="bk"><div class="bk-bar"><h3>' + esc(D.label) + '</h3></div><div class="bk-imp"><h4>이 시트는 아직 DB에 없습니다</h4><p>지금 TV는 구글시트 내용을 그대로 사용하고 있습니다. 구글시트의 현재 내용을 가져와 확인한 뒤 저장하면, 그때부터 TV가 이 입력판의 내용을 사용합니다.</p><button type="button" class="bk-b pri" data-act="import">구글시트에서 가져오기</button>' + msgHTML() + '</div></div>'; return; }
      var idx = visIdx(), cfg = '';
      if (D.cfg && !opts.filter) cfg = '<div class="bk-cfg">' + D.cfg.map(function (f) { return '<div class="' + (f.wide ? 'wide' : '') + '">' + fieldHTML(f, s.m.cfg, uid + 'c' + f.k, key).replace('class="bk-f"', 'class="bk-f" style="margin:0"') + '</div>'; }).join('') + '</div>';
      var list = idx.map(function (i) { var r = s.m.rows[i], u = D.sum(r), drag = !D.fixed && !opts.filter;
        return '<div class="bk-it' + (s.sel === i ? ' sel' : '') + '" data-sel="' + i + '"' + (drag ? ' draggable="true" data-drag="' + i + '"' : '') + '><b data-t="' + i + '">' + esc(u.t) + '</b><div class="bk-m">' + u.m.filter(Boolean).map(function (m) { return Array.isArray(m) ? '<span class="bk-pl ' + m[1] + '">' + esc(m[0]) + '</span>' : '<span>' + esc(m) + '</span>'; }).join('') + '</div></div>'; }).join('');
      if (!idx.length) list = '<div class="bk-empty">항목이 없습니다.</div>';
      var form = '';
      if (s.sel != null && s.m.rows[s.sel] && idx.indexOf(s.sel) >= 0) {
        var r = s.m.rows[s.sel];
        form = D.fields.map(function (f) { return fieldHTML(f, r, uid + 'f' + f.k, key); }).join('') + (D.fixed || opts.filter ? '' : '<div class="bk-row" style="justify-content:flex-start"><button type="button" class="bk-b dng" data-act="del">이 항목 삭제</button></div>');
      } else form = '<div class="bk-empty">왼쪽에서 항목을 선택하면 여기에서 수정합니다.</div>';
      var stt = stat();
      root.innerHTML = '<div class="bk"><div class="bk-bar"><h3>' + esc(D.label) + '</h3><span class="bk-st ' + stt[1] + '" id="' + uid + 's">' + esc(stt[0]) + '</span><span class="sp"></span>'
        + (D.fixed || opts.filter ? '' : '<button type="button" class="bk-b" data-act="add">+ 새 항목</button>')
        + '<button type="button" class="bk-b" data-act="hist">이전 저장본</button><button type="button" class="bk-b pri" data-act="save">저장</button></div>'
        + cfg + msgHTML() + '<div class="bk-main"><div class="bk-list">' + list + '</div><div class="bk-form">' + form + '</div></div></div>';
    }
    function msgHTML() { if (!msg) return ''; return '<div class="bk-msg ' + msg.k + '">' + esc(msg.t) + (msg.list ? '<ul>' + msg.list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + (msg.act ? ' <button type="button" class="bk-b" data-act="' + msg.act[0] + '">' + esc(msg.act[1]) + '</button>' : '') + '</div>'; }
    function setMsg(k, t, list, act) { msg = { k: k, t: t, list: list, act: act }; render(); }
    function mark() { s.dirty = true; var e = root.querySelector('#' + uid + 's'); if (e) { e.textContent = '변경됨 · 저장 필요'; e.className = 'bk-st dirty'; } }
    function doSave() {
      var errs = []; D.check(s.m, errs);
      if (errs.length) { setMsg('err', '저장하지 못했습니다. 아래 내용을 확인해 주세요.', errs.slice(0, 8)); return; }
      login(function () {
        DB.save(key, D.to(s.m), s.ver || 0).then(function (r) {
          if (r && r.ok) { s.ver = r.ver; s.dirty = false; msg = { k: 'ok', t: '저장했습니다. TV에는 최대 30초 안에 반영됩니다.' }; render(); if (opts.saved) opts.saved(key); }
          else if (r && r.err === 'conflict') setMsg('err', '다른 곳에서 먼저 저장된 내용이 있습니다. 최신 내용을 불러오면 지금 수정한 내용은 사라집니다.', null, ['reload', '최신 내용 불러오기']);
          else if (r && r.err === 'auth') { DB.setToken(''); doSave(); }
          else setMsg('err', '저장하지 못했습니다(' + ((r && r.err) || '알 수 없는 오류') + ').');
        }, function () { setMsg('err', '서버에 연결하지 못했습니다. 입력한 내용은 이 화면에 그대로 있으니 잠시 후 다시 저장해 주세요.'); });
      });
    }
    root.addEventListener('click', function (e) {
      var t = e.target, b;
      if ((b = t.closest('[data-sw]'))) { var row = t.closest('.bk-cfg') ? s.m.cfg : s.m.rows[s.sel]; row[b.dataset.sw] = !row[b.dataset.sw]; b.setAttribute('aria-checked', !!row[b.dataset.sw]); b.lastChild.textContent = row[b.dataset.sw] ? '켜짐' : '꺼짐'; mark(); if (!t.closest('.bk-cfg')) { render(); } return; }
      if ((b = t.closest('[data-act]'))) {
        var a = b.dataset.act;
        if (a === 'save') doSave();
        else if (a === 'add') { s.m.rows.push(D.blank()); s.sel = s.m.rows.length - 1; mark(); render(); }
        else if (a === 'del') { s.m.rows.splice(s.sel, 1); s.sel = null; mark(); render(); }
        else if (a === 'import') { b.disabled = true; b.textContent = '가져오는 중…'; DB.importSheet(key, function (c) { if (!c) { b.disabled = false; b.textContent = '구글시트에서 가져오기'; setMsg('err', '구글시트를 읽지 못했습니다. 시트 공유 설정과 네트워크를 확인해 주세요.'); return; } s.m = D.from(c); s.loaded = true; s.dirty = true; s.ver = 0; msg = { k: 'inf', t: '구글시트 내용을 가져왔습니다. 내용을 확인한 뒤 저장하면 그때부터 TV가 이 내용을 사용합니다.' }; render(); }); }
        else if (a === 'reload') { DB.load().then(function () { delete ST[key]; s = st(key); msg = { k: 'inf', t: '최신 내용을 불러왔습니다.' }; render(); }); }
        else if (a === 'hist') histDlg();
        return;
      }
      if ((b = t.closest('[data-sel]'))) { s.sel = +b.dataset.sel; render(); }
    });
    function histDlg() {
      login(function () {
        DB.hist(key).then(function (r) {
          if (!r || !r.ok) { setMsg('err', '이력을 불러오지 못했습니다.'); return; }
          var ov = modal('<div style="padding:16px"><h4 style="margin:0 0 8px">이전 저장본으로 되돌리기</h4><p style="color:#5d6b82;margin:0 0 8px">되돌리면 새 버전으로 저장되며 현재 내용도 이력에 남습니다.</p>' + (r.rows.length ? r.rows.map(function (x) { return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #eef1f6"><span>v' + x.ver + ' · ' + esc(String(x.at).slice(0, 16).replace('T', ' ')) + '</span><button type="button" class="bk-b" data-rs="' + x.id + '">이 버전으로 되돌리기</button></div>'; }).join('') : '<div class="bk-empty">저장 이력이 없습니다.</div>') + '<div class="bk-row"><button type="button" class="bk-b" data-x="c">닫기</button></div></div>', 'sm');
          ov.querySelector('.bk-dlg').style.maxWidth = '520px';
          ov.addEventListener('click', function (e) { var x = e.target.getAttribute && e.target.getAttribute('data-x'); if (x === 'c' || e.target === ov) ov.remove(); var id = e.target.getAttribute && e.target.getAttribute('data-rs'); if (id) DB.restore(key, +id).then(function (q) { ov.remove(); if (q && q.ok) { delete ST[key]; s = st(key); msg = { k: 'ok', t: '이전 저장본으로 되돌렸습니다.' }; render(); if (opts.saved) opts.saved(key); } else setMsg('err', '되돌리지 못했습니다.'); }); });
        }, function () { setMsg('err', '이력을 불러오지 못했습니다.'); });
      });
    }
    root.addEventListener('input', function (e) {
      var t = e.target, f = t.getAttribute && t.getAttribute('data-f'); if (!f) return;
      var row = t.closest('.bk-cfg') ? s.m.cfg : s.m.rows[s.sel]; if (!row) return;
      var def = (t.closest('.bk-cfg') ? D.cfg : D.fields).filter(function (x) { return x.k === f; })[0];
      row[f] = def && def.t === 'num' ? (t.value === '' ? '' : Number(t.value)) : t.value;
      mark();
      if (!t.closest('.bk-cfg')) { var u = D.sum(row), el = root.querySelector('[data-t="' + s.sel + '"]'); if (el) el.textContent = u.t; }
    });
    var dragI = null;
    root.addEventListener('dragstart', function (e) { var b = e.target.closest && e.target.closest('[data-drag]'); if (!b) return; dragI = +b.dataset.drag; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(dragI)); } catch (x) { } b.classList.add('drag'); });
    root.addEventListener('dragend', function () { dragI = null; root.querySelectorAll('.drag,.over').forEach(function (x) { x.classList.remove('drag', 'over'); }); });
    root.addEventListener('dragover', function (e) { var b = e.target.closest && e.target.closest('[data-drag]'); if (dragI == null || !b) return; e.preventDefault(); root.querySelectorAll('.over').forEach(function (x) { x.classList.remove('over'); }); b.classList.add('over'); });
    root.addEventListener('drop', function (e) {
      var b = e.target.closest && e.target.closest('[data-drag]'); if (dragI == null || !b) return; e.preventDefault();
      var to = +b.dataset.drag; if (to !== dragI) { var it = s.m.rows.splice(dragI, 1)[0]; s.m.rows.splice(to, 0, it); if (s.sel === dragI) s.sel = to; mark(); render(); }
    });
    render();
    return { render: render };
  }

  /* ---------- 입력판 ---------- */
  function page(root) {
    injectCss();
    var keys = ['notice', 'welcome', 'slides', 'rental'], cur = 'notice';
    root.innerHTML = '<div class="bk bk-page"><div class="bk-nav" id="bkNav"></div><div id="bkView"></div></div>';
    var nav = root.querySelector('#bkNav'), view = root.querySelector('#bkView');
    function drawNav() { nav.innerHTML = keys.map(function (k) { return '<button type="button" data-k="' + k + '" aria-current="' + (k === cur) + '">' + esc(SHEETS[k].label) + '</button>'; }).join('') + '<span style="flex:1"></span><button type="button" data-k="_pw">비밀번호 변경</button><button type="button" data-k="_out">로그아웃</button>'; }
    function show(k) { cur = k; drawNav(); view.innerHTML = ''; SheetView(view, k, {}); }
    nav.addEventListener('click', function (e) { var b = e.target.closest('[data-k]'); if (!b) return; var k = b.dataset.k; if (k === '_pw') changePw(); else if (k === '_out') { DB.setToken(''); toast('로그아웃했습니다.'); } else show(k); });
    window.addEventListener('beforeunload', function (e) { if (anyDirty()) { e.preventDefault(); e.returnValue = ''; } });
    DB.load().catch(function () { }).then(function () { ST = {}; login(function () { show(cur); }); });
  }

  /* ---------- TV 화면 직접 편집 ---------- */
  var tvState = null;
  function openZone(z) {
    var sheet = typeof z.sheet === 'function' ? z.sheet() : z.sheet;
    login(function () {
      DB.load().catch(function () { }).then(function () {
        var ov = modal('<div id="bkPop"></div>'); ov.firstChild.style.maxWidth = '960px';
        var pop = ov.querySelector('#bkPop');
        var head = '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;background:#E8F0FE;font-weight:700">' + esc(z.title || SHEETS[sheet].label) + ' 수정<button type="button" class="bk-b" id="bkX">닫기</button></div><div id="bkBody"></div>';
        pop.innerHTML = head; var body = pop.querySelector('#bkBody');
        SheetView(body, sheet, { filter: z.filter, saved: function () { if (window.__brdRefresh) window.__brdRefresh(); } });
        function close() { if (anyDirty() && !confirmClose()) return; ov.remove(); }
        ov.addEventListener('click', function (e) { if (e.target.id === 'bkX') close(); });
        ov.addEventListener('mousedown', function (e) { ov._dn = e.target === ov; });
        ov.addEventListener('click', function (e) { if (e.target === ov && ov._dn) close(); });
      });
    });
  }
  function confirmClose() { return window.confirm('저장하지 않은 변경 내용이 있습니다. 닫을까요?'); }
  function curSlideSheet() { try { var t = (typeof slides !== 'undefined' && typeof cur !== 'undefined' && slides[cur]) ? slides[cur].type : ''; return t === '환영' ? 'welcome' : t === '대관' ? 'rental' : 'slides'; } catch (e) { return 'slides'; } }
  var ZONES = [
    { id: 'slide', sel: '#slidebox', label: '슬라이드 수정', sheet: curSlideSheet },
    { id: 'notice', sel: '.infocard', label: '주요 안내 수정', sheet: 'notice' },
    { id: 'clock', sel: '.clockcard', label: '시계·날씨 수정', sheet: 'settings', title: '시계·날씨 설정', filter: function (r) { return r.key === '날씨효과' || r.key === '테마'; } },
    { id: 'ticker', sel: '.tickerwrap', label: '티커 수정', sheet: 'settings', title: '하단 티커 문구', filter: function (r) { return r.key === '티커문구'; } },
    { id: 'head', sel: '.header', label: '상단 제목 수정', sheet: 'fonts', title: '상단 제목 서체·문구', filter: function (r) { return /상단|간판/.test(r.area); } }
  ];
  var TOOLS = [{ l: '환영 문구', sheet: 'welcome' }, { l: '시설 대관', sheet: 'rental' }, { l: '테마 순환', sheet: 'theme' }, { l: '서체 전체', sheet: 'fonts' }, { l: '화면 설정 전체', sheet: 'settings' }];
  function placeHotspots() {
    if (!tvState) return;
    ZONES.forEach(function (z) {
      var el = document.querySelector(z.sel), h = tvState.hs[z.id]; if (!el) { if (h) h.style.display = 'none'; return; }
      var r = el.getBoundingClientRect();
      if (!h) { h = document.createElement('div'); h.className = 'bk bk-hs'; h.setAttribute('role', 'button'); h.setAttribute('tabindex', '0'); h.setAttribute('aria-label', z.label); h.innerHTML = '<span>' + esc(z.label) + '</span>'; h.addEventListener('click', function () { openZone(z); }); h.addEventListener('keydown', function (e) { if (e.key === 'Enter') openZone(z); }); document.body.appendChild(h); tvState.hs[z.id] = h; }
      h.style.display = ''; h.style.left = r.left + 'px'; h.style.top = r.top + 'px'; h.style.width = r.width + 'px'; h.style.height = r.height + 'px';
    });
  }
  function tv() {
    if (tvState) return;
    injectCss();
    login(function () {
      tvState = { hs: {}, timer: null, bar: null };
      window.ADMIN_MODE = true; document.body.classList.add('brd-edit');
      var bar = document.createElement('div'); bar.className = 'bk bk-tvbar';
      bar.innerHTML = '<span style="align-self:center;font-weight:700;padding:0 6px">화면 편집 중</span>' + TOOLS.map(function (t, i) { return '<button type="button" class="bk-b" data-i="' + i + '">' + esc(t.l) + '</button>'; }).join('') + '<button type="button" class="bk-b" data-i="in">입력판 열기</button><button type="button" class="bk-b pri" data-i="x">편집 끝내기</button>';
      bar.addEventListener('click', function (e) { var i = e.target.getAttribute && e.target.getAttribute('data-i'); if (i == null) return; if (i === 'x') exit(); else if (i === 'in') window.open('board-input.html', '_blank'); else openZone(TOOLS[+i]); });
      document.body.appendChild(bar); tvState.bar = bar;
      placeHotspots(); tvState.timer = setInterval(placeHotspots, 700);
      document.addEventListener('keydown', escExit);
    });
  }
  function escExit(e) { if (e.key === 'Escape' && !document.querySelector('.bk-ov')) exit(); }
  function exit() {
    if (!tvState) return;
    clearInterval(tvState.timer); Object.keys(tvState.hs).forEach(function (k) { tvState.hs[k].remove(); }); if (tvState.bar) tvState.bar.remove();
    tvState = null; window.ADMIN_MODE = false; document.body.classList.remove('brd-edit'); document.removeEventListener('keydown', escExit);
    if (window.__brdRefresh) window.__brdRefresh(true);
  }
  window.BoardAdmin = { page: page, tv: tv, exit: exit, sheets: SHEETS };
})();
