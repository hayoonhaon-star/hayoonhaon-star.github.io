/*
 * 사전제출 엑셀(.xlsx) 읽기 (xlsx.js)
 * - 외부 라이브러리 없이 브라우저 내장 기능(DecompressionStream·DOMParser)만 씁니다.
 * - 파일은 기기 안에서만 읽고 어디로도 보내지 않습니다.
 * - 양식: docs/사전제출양식.xlsx — A열 항목코드, C열 입력값
 */
window.CI = window.CI || {};
CI.xlsx = (function () {
  async function entries(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf); let e = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) { if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; } }
    if (e < 0) throw new Error('엑셀 파일 형식이 아닙니다');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {}; const td = new TextDecoder();
    for (let k = 0; k < n; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      out[td.decode(u8.subarray(p + 46, p + 46 + nl))] = { method, csize, lo }; p += 46 + nl + xl + cl;
    }
    async function read(name) {
      const f = out[name]; if (!f) return null;
      const ln = dv.getUint16(f.lo + 26, true), lx = dv.getUint16(f.lo + 28, true);
      const data = u8.subarray(f.lo + 30 + ln + lx, f.lo + 30 + ln + lx + f.csize);
      if (f.method === 0) return td.decode(data);
      if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 엑셀 읽기를 지원하지 않습니다(최신 브라우저 필요)');
      return await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    }
    return { names: Object.keys(out), read };
  }
  async function readKV(file) {
    const z = await entries(await file.arrayBuffer()); const P = new DOMParser();
    const ssx = await z.read('xl/sharedStrings.xml');
    const ss = ssx ? [...P.parseFromString(ssx, 'application/xml').getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
    const sheet = z.names.find(k => k === 'xl/worksheets/sheet1.xml') || z.names.find(k => /^xl\/worksheets\/.*\.xml$/.test(k));
    if (!sheet) throw new Error('시트를 찾지 못했습니다');
    const doc = P.parseFromString(await z.read(sheet), 'application/xml'); const rows = {};
    [...doc.getElementsByTagName('c')].forEach(cel => {
      const m = /^([A-Z]+)(\d+)$/.exec(cel.getAttribute('r') || ''); if (!m) return; const t = cel.getAttribute('t');
      let v = ''; if (t === 's') v = ss[Number((cel.getElementsByTagName('v')[0] || {}).textContent)] || '';
      else if (t === 'inlineStr') v = [...cel.getElementsByTagName('t')].map(x => x.textContent).join('');
      else v = (cel.getElementsByTagName('v')[0] || {}).textContent || '';
      (rows[m[2]] = rows[m[2]] || {})[m[1]] = v;
    });
    const kv = {}; Object.values(rows).forEach(r => { if (r.A && r.C !== undefined && String(r.C).trim() !== '') kv[String(r.A).trim()] = String(r.C).trim(); });
    return kv;
  }
  return { readKV };
})();
