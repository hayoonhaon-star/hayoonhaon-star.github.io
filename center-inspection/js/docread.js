/*
 * 사전제출 점검표 읽기 (docread.js)
 * - 한글(.hwp·.hwpx), PDF, 엑셀(.xlsx)로 받은 「현장점검표(붙임 2·3)」에서 글자를 뽑아
 *   칸 이름(전담인력 수·국비·인건비 등)을 기준으로 값을 찾습니다.
 * - 파일은 기기 안에서만 읽고 어디로도 보내지 않으며, 원본 파일은 저장하지 않습니다.
 * - 센터명·담당자·연락처·주소 칸은 읽지 않습니다.
 * - PDF는 기기에 함께 담긴 pdf.js(js/vendor/pdfjs, Apache-2.0)로 읽습니다.
 */
window.CI = window.CI || {};
CI.docread = (function () {
  const inflate = async (u8) => {
    if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축 파일 읽기를 지원하지 않습니다(최신 브라우저 필요)');
    // 한글 본문은 압축 끝에 여분 바이트가 있을 수 있어, 오류가 나도 풀린 부분까지는 사용
    const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
    w.write(u8).catch(() => {}); w.close().catch(() => {});
    const r = ds.readable.getReader(), parts = []; let len = 0;
    try { for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); len += value.length; } } catch (e) { if (!len) throw new Error('한글 파일 압축을 풀지 못했습니다'); }
    const out = new Uint8Array(len); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; }); return out;
  };

  /* ---------- 한글 2014 이후(.hwpx): zip + XML ---------- */
  async function hwpxText(buf) {
    const z = await CI.xlsx.entries(buf); const P = new DOMParser();
    const secs = z.names.filter(n => /^Contents\/section\d+\.xml$/i.test(n)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
    if (!secs.length) throw new Error('한글(hwpx) 본문을 찾지 못했습니다');
    const out = [];
    for (const n of secs) {
      const doc = P.parseFromString(await z.read(n), 'application/xml');
      const walk = el => { for (const c of el.children) { if (c.localName === 'p') { const t = [...c.getElementsByTagName('*')].filter(x => x.localName === 't' && x.closest && true).filter(x => nearestP(x) === c).map(x => x.textContent).join(''); if (t.trim()) out.push(t); walk(c); } else walk(c); } };
      const nearestP = x => { let e = x.parentElement; while (e && e.localName !== 'p') e = e.parentElement; return e; };
      walk(doc.documentElement);
    }
    return out.join('\n');
  }

  /* ---------- 한글 97~2010(.hwp): OLE 복합문서 + 압축 레코드 ---------- */
  function cfb(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    if (dv.getUint32(0, true) !== 0xE011CFD0) throw new Error('한글(hwp) 파일 형식이 아닙니다');
    const ss = 1 << dv.getUint16(30, true), mss = 1 << dv.getUint16(32, true), cutoff = dv.getUint32(56, true);
    const secOff = s => (s + 1) * ss;
    const difat = []; for (let i = 0; i < 109; i++) { const v = dv.getUint32(76 + i * 4, true); if (v < 0xFFFFFFFA) difat.push(v); }
    let dif = dv.getUint32(68, true), nd = dv.getUint32(72, true);
    while (nd-- > 0 && dif < 0xFFFFFFFA) { for (let i = 0; i < ss / 4 - 1; i++) { const v = dv.getUint32(secOff(dif) + i * 4, true); if (v < 0xFFFFFFFA) difat.push(v); } dif = dv.getUint32(secOff(dif) + ss - 4, true); }
    const fat = []; difat.forEach(s => { for (let i = 0; i < ss / 4; i++) fat.push(dv.getUint32(secOff(s) + i * 4, true)); });
    const chain = s => { const o = []; let g = 0; while (s < 0xFFFFFFFA && g++ < 1e6) { o.push(s); s = fat[s]; } return o; };
    const readChain = (s, size) => { const o = new Uint8Array(size); let p = 0; for (const c of chain(s)) { const n = Math.min(ss, size - p); if (n <= 0) break; o.set(u8.subarray(secOff(c), secOff(c) + n), p); p += n; } return o; };
    const dirBytes = (() => { const c = chain(dv.getUint32(48, true)); const o = new Uint8Array(c.length * ss); c.forEach((s, i) => o.set(u8.subarray(secOff(s), secOff(s) + ss), i * ss)); return o; })();
    const ddv = new DataView(dirBytes.buffer), ents = [];
    for (let i = 0; i < dirBytes.length / 128; i++) { const b = i * 128, nl = ddv.getUint16(b + 64, true); if (!nl) { ents.push(null); continue; }
      let name = ''; for (let k = 0; k < nl / 2 - 1; k++) name += String.fromCharCode(ddv.getUint16(b + k * 2, true));
      ents.push({ name, type: dirBytes[b + 66], start: ddv.getUint32(b + 116, true), size: ddv.getUint32(b + 120, true) }); }
    const root = ents[0]; const mini = root ? readChain(root.start, root.size) : new Uint8Array(0);
    const mfat = []; chain(dv.getUint32(60, true)).forEach(s => { for (let i = 0; i < ss / 4; i++) mfat.push(dv.getUint32(secOff(s) + i * 4, true)); });
    const readMini = (s, size) => { const o = new Uint8Array(size); let p = 0, g = 0; while (s < 0xFFFFFFFA && p < size && g++ < 1e6) { const n = Math.min(mss, size - p); o.set(mini.subarray(s * mss, s * mss + n), p); p += n; s = mfat[s]; } return o; };
    const get = name => { const e = ents.find(x => x && x.type === 2 && x.name === name); if (!e) return null; return e.size < cutoff ? readMini(e.start, e.size) : readChain(e.start, e.size); };
    return { names: ents.filter(Boolean).map(e => e.name), get };
  }
  async function hwpText(buf) {
    const f = cfb(buf); const fh = f.get('FileHeader'); if (!fh) throw new Error('한글(hwp) 파일 머리글을 찾지 못했습니다');
    const prop = new DataView(fh.buffer).getUint32(36, true);
    if (prop & 2) throw new Error('암호가 걸린 한글 파일은 읽을 수 없습니다');
    if ((prop & 4) || f.names.includes('ViewText')) throw new Error('배포용(보안) 한글 문서는 읽을 수 없습니다. 일반 문서나 PDF로 받아 주세요');
    const secs = f.names.filter(n => /^Section\d+$/.test(n)).sort((a, b) => +a.slice(7) - +b.slice(7));
    const out = [];
    for (const n of secs) {
      let d = f.get(n); if (prop & 1) d = await inflate(d);
      const dv = new DataView(d.buffer, d.byteOffset, d.byteLength); let p = 0;
      while (p + 4 <= d.length) {
        const h = dv.getUint32(p, true); p += 4; const tag = h & 0x3FF; let size = h >>> 20;
        if (size === 0xFFF) { size = dv.getUint32(p, true); p += 4; }
        if (tag === 67) { let s = ''; for (let i = 0; i + 1 < size;) { const c = dv.getUint16(p + i, true);
            if (c >= 32) { s += String.fromCharCode(c); i += 2; }
            else if (c === 0 || c === 10 || c === 13 || (c >= 24 && c <= 31)) { s += (c === 10 || c === 13) ? '\n' : c >= 30 ? ' ' : ''; i += 2; }
            else { if (c === 9) s += ' '; i += 16; } }
          if (s.trim()) out.push(s.trim()); }
        p += size;
      }
    }
    return out.join('\n');
  }

  /* ---------- PDF: pdf.js(기기 내장) ---------- */
  let pdfLoading = null;
  const base = () => new URL('js/vendor/pdfjs/', document.baseURI).href;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return pdfLoading || (pdfLoading = new Promise((ok, no) => { const s = document.createElement('script'); s.src = base() + 'pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = base() + 'pdf.worker.min.js'; ok(window.pdfjsLib); }; s.onerror = () => no(new Error('PDF 읽기 도구를 불러오지 못했습니다')); document.head.appendChild(s); }));
  }
  async function pdfText(buf) {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: new Uint8Array(buf), cMapUrl: base() + 'cmaps/', cMapPacked: true, isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
    const lines = [];
    for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      const its = tc.items.filter(t => t.str && t.str.trim()).map(t => ({ s: t.str, x: t.transform[4], y: t.transform[5], w: t.width, h: Math.abs(t.transform[3]) || 8 }));
      its.sort((a, b) => b.y - a.y || a.x - b.x);
      const rows = []; its.forEach(t => { const r = rows.find(r => Math.abs(r.y - t.y) < Math.max(2, t.h * 0.4)); r ? r.it.push(t) : rows.push({ y: t.y, it: [t] }); });
      rows.sort((a, b) => b.y - a.y).forEach(r => { r.it.sort((a, b) => a.x - b.x); let s = '', end = null;
        r.it.forEach(t => { if (end != null && t.x - end > 1.5) s += ' '; s += t.s; end = t.x + t.w; }); lines.push(s); });
    }
    const text = lines.join('\n');
    if (!text.replace(/\s/g, '')) throw new Error('글자를 읽을 수 없는 PDF입니다(스캔본 등). 한글·엑셀 파일로 받거나 직접 입력하세요');
    return text;
  }

  /* ---------- 엑셀: 모든 셀을 행 순서대로 ---------- */
  async function xlsxText(buf) {
    const z = await CI.xlsx.entries(buf); const P = new DOMParser();
    const ssx = await z.read('xl/sharedStrings.xml');
    const ss = ssx ? [...P.parseFromString(ssx, 'application/xml').getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
    const out = [];
    for (const n of z.names.filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()) {
      const doc = P.parseFromString(await z.read(n), 'application/xml');
      [...doc.getElementsByTagName('row')].forEach(r => { const cs = [...r.getElementsByTagName('c')].map(c => { const t = c.getAttribute('t'), v = (c.getElementsByTagName('v')[0] || {}).textContent;
          return t === 's' ? ss[+v] || '' : t === 'inlineStr' ? [...c.getElementsByTagName('t')].map(x => x.textContent).join('') : (v || ''); }).filter(x => String(x).trim());
        if (cs.length) out.push(cs.join(' ')); });
    }
    return out.join('\n');
  }

  async function read(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase(), buf = await file.arrayBuffer();
    if (ext === 'hwpx') return { fmt: 'hwpx', text: await hwpxText(buf) };
    if (ext === 'hwp') return { fmt: 'hwp', text: await hwpText(buf) };
    if (ext === 'pdf') return { fmt: 'pdf', text: await pdfText(buf) };
    if (ext === 'xlsx') { let kv = null; try { kv = await CI.xlsx.readKV(file); } catch (e) { kv = null; }
      if (kv && ['staff', 'bud_total', 'p_c1', 'farms', 'match'].some(k => k in kv)) return { fmt: 'xlsx', kv };
      return { fmt: 'xlsx', text: await xlsxText(buf) }; }
    throw new Error('한글(.hwp·.hwpx), PDF, 엑셀(.xlsx) 파일만 불러올 수 있습니다');
  }

  /* ---------- 점검표 칸 이름으로 값 찾기 ---------- */
  const rx = (label, flags) => { const anc = label.startsWith('^'); const l = label.replace(/^\^/, '').replace(/\s/g, ''); return new RegExp((anc ? '^\\s*' : '') + l.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), flags || ''); };
  function parse(text, type) {
    const T = text.replace(/ /g, ' ');
    const at = (label, from) => { const r = rx(label, 'g'); r.lastIndex = from || 0; const m = r.exec(T); return m ? { i: m.index, e: m.index + m[0].length } : null; };
    const seg = (label, stops, from, max) => { const a = at(label, from); if (!a) return null; let end = Math.min(T.length, a.e + (max || 120));
      (stops || []).forEach(s => { const b = at(s, a.e); if (b && b.i < end) end = b.i; }); return { s: T.slice(a.e, end), e: end, i: a.i }; };
    const nums = s => { if (!s) return []; const c = s.replace(/\(\s*\d+\s*%\s*\)/g, ' ').replace(/[=＝]?\s*연\s*인\s*원|\(?\s*인\s*원\s*[×xX*]|작\s*업\s*일\s*수\s*\)?/g, ' ').replace(/['‘’]\s*\d{2}\s*\.\s*\d+\s*\.(\s*\d+\s*\.)?/g, ' ');
      const o = []; const r = /(\d[\d,]*(?:\.\d+)?)(\s*%)?/g; let m; while ((m = r.exec(c))) { if (m[2]) continue; o.push(Number(m[1].replace(/,/g, ''))); } return o; };
    const first = (label, stops, from, max) => { const g = seg(label, stops, from, max); const n = g && nums(g.s); return n && n.length ? n[0] : null; };
    const clean = s => (s || '').replace(/[▸▶►•ㆍ]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s:(（]+|[\s)）]+$/g, '').trim();
    const v = {};
    const put = (k, x) => { if (x != null && x !== '' && !(typeof x === 'number' && isNaN(x))) v[k] = x; };
    const tdet = /공\s*공\s*형/.test(T.slice(0, 400)) ? 'B' : /농\s*촌\s*형/.test(T.slice(0, 400)) ? 'A' : null;
    // 센터 현황 (센터명·담당자·연락처·주소는 읽지 않음)
    put('staff', first('전담인력수', ['채용형태'], 0, 40));
    const hire = seg('채용형태', ['계약기간'], 0, 40); if (hire) { const c = /계약직/.test(hire.s), n = /내부직원/.test(hire.s); if (c !== n) put('hire', c ? '계약직' : '내부직원'); }
    const per = seg('계약기간', ['예산', '국비'], 0, 40); if (per) { const p = clean(per.s); if (p && /\d/.test(p) && !/0\.\s*~\s*0\./.test(p) && p.length <= 30) put('period', p); }
    if (!v.period) { const m = /['‘’]\s*\d{2}\s*\.\s*\d{1,2}\s*\.\s*~\s*(?:['‘’]?\s*\d{2}\s*\.\s*)?\d{1,2}\s*\.?/.exec(T.slice(0, (at('국비') || { i: 600 }).i)); if (m && !/\.\s*0\s*\.\s*~/.test(m[0])) put('period', m[0].replace(/\s+/g, ' ').trim()); }
    const bud = seg('예산', ['국비'], per ? per.e - 1 : 0, 40); if (bud) { const n = nums(bud.s); if (n.length) put('bud_total', n[0]); }
    put('bud_nat', first('국비', ['지방비'], 0, 40));
    put('bud_loc', first('지방비', ['사업추진', '기준일', '배정', '지원농가'], 0, 40));
    const bd = seg('기준일', [], 0, 25); if (bd) { const m = /['‘’]?\s*(\d{2,4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?/.exec(bd.s); if (m && +m[2] > 0 && +m[3] > 0) put('base', `${String(m[1]).slice(-2)}.${+m[2]}.${+m[3]}.`); }
    // 추진현황
    put('farms', first('지원농가수', ['개', '중개실적'], 0, 40));
    { const g = seg('중개실적', ['인력수급', '수급동향', '배정', '항목'], 0, 160); if (g) { const n = nums(g.s.replace(new RegExp(rx('지원농가수').source + '\\s*[\\d,]*\\s*개'), ' ')); if (n.length) put('match', n[0]); } }
    if (type === 'B' || tdet === 'B') { const g = seg('배정', ['지원농가', '중개실적', '추진'], 0, 200); const n = g ? nums(g.s) : [];
      if (n.length >= 5) ['alloc', 'intro', 'escape', 'ended', 'current'].forEach((k, i) => put(k, n[i])); }
    const strip = (s, l) => { const pm = /\(([^()]{2,})\)/.exec(s); return pm ? clean(pm[1]) : clean(clean(s).replace(rx('^' + l), '').replace(/^\(\s*\)/, '').replace(/\s*동\s*향$/, '')); };
    const tr = seg('수급동향', ['인건비동향', '항목', '세부항목'], 0, 200); if (tr) { const t = strip(tr.s, '수급동향'); if (t && !(/사과\s*적과/.test(t) && /포도\s*눈솎기/.test(t) && /\(\s*\)/.test(t))) put('trend', t.slice(0, 120)); }
    const wts = [...T.matchAll(rx('인건비동향', 'g'))].pop(); if (wts) { const g = seg('인건비동향', ['항목', '세부항목', '예산계획'], wts.index, 200); const t = g && strip(g.s, '인건비동향'); if (t && !(/12~15/.test(t) && /1~2/.test(t) && /\(\s*\)/.test(t))) put('wtrend', t.slice(0, 120)); }
    // 예산 집행현황(천원): 세부항목 순서대로 예산계획·집행실적
    const st = at('세부항목') || at('예산계획');
    if (st) { const rows = [['c1', '인건비'], ['c2', '사업운영'], ['c3', '홍보비'], ['c4', '기타'], ['h1', '교육비'], ['h2', '농작업참여'], ['h3', '영농작업반장'], ['h4', '기타']];
      let cur = st.e; rows.forEach(([k, l], idx) => { const a = at(l, cur); if (!a) return; const next = rows[idx + 1] ? at(rows[idx + 1][1], a.e) : null; const stop = at('집행부진', a.e);
        let end = Math.min(next ? next.i : T.length, stop ? stop.i : T.length, a.e + 160); const n = nums(T.slice(a.e, end).replace(/인력\s*운영비|센터\s*운영비|예\s*산|집\s*행|현\s*황/g, ' '));
        if (n.length) put('p_' + k, n[0]); if (n.length > 1) put('e_' + k, n[1]); cur = a.e; }); }
    const why = seg('집행부진사유', ['운영', '인력풀', '영농작업반', '통역', '여부', '기타지도'], 0, 200); if (why) { const t = clean(why.s); if (t) put('why', t.slice(0, 120)); }
    // 운영현황
    const pool = seg('인력풀', ['영농작업반', '기타지도'], 0, 120); if (pool) { const g = pool.s;
      const m1 = /총\s*(\d[\d,]*)/.exec(g), m2 = /관\s*내\s*(\d[\d,]*)/.exec(g), m3 = /관\s*외\s*(\d[\d,]*)/.exec(g);
      if (m1) put('pool_total', +m1[1].replace(/,/g, '')); if (m2) put('pool_in', +m2[1].replace(/,/g, '')); if (m3) put('pool_out', +m3[1].replace(/,/g, '')); }
    const tm = seg('영농작업반', ['통역', '기타지도', '구분'], (at('운영') || {}).i || 0, 120); if (tm) { const m = /(\d+)\s*개\s*반/.exec(tm.s), p = /\(\s*(\d[\d,]*)\s*명/.exec(tm.s);
      if (m && +m[1] > 0) put('teams', +m[1]); if (p && +p[1].replace(/,/g, '') > 0) put('team_people', +p[1].replace(/,/g, '')); }
    if (type === 'B' || tdet === 'B') { const ip = seg('통역지원자', ['기타지도', '구분'], 0, 60); if (ip) { if (/있음|유\b|■\s*유|○/.test(ip.s)) put('interp', '있음'); else if (/없음|무\b/.test(ip.s)) put('interp', '없음');
      const n = nums(ip.s); if (n.length) put('interp_n', n[n.length - 1]); } }
    return { vals: v, type: tdet };
  }
  return { read, parse, hwpText, hwpxText, pdfText, xlsxText };
})();
