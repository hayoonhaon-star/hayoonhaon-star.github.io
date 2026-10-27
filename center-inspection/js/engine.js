/*
 * 규칙 기반 검증·문안 생성 엔진 (engine.js)
 * - 인터넷·AI API를 쓰지 않습니다. criteria.js 의 기준·사유·문안만 사용합니다.
 * - 법령 위반·행정처분 여부는 판정하지 않습니다. '기준 위반(수치 확인)'은 시행지침 명시 수치와
 *   현장에서 입력한 값이 다르다는 뜻이며, 최종 판단은 점검자가 합니다.
 */
window.CI = window.CI || {};
CI.engine = (function () {
  const C = () => CI.CONFIG;
  const num = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
  const r1 = x => Math.round(x * 10) / 10;
  const won = n => Number(n).toLocaleString('ko-KR');

  function type(t) { return C().types[t]; }
  function items(t) {
    const out = [];
    (type(t).categories || []).forEach(cat => cat.items.forEach(it => out.push(Object.assign({ cat: cat.id, catName: cat.name }, it))));
    return out;
  }
  function item(t, id) { return items(t).find(i => i.id === id); }
  function reasons(it) { return (it.reasons || []).concat([C().etc]); }
  function resultLabel(v) { const o = C().results.find(x => x.v === v); return o ? o.l : '미응답'; }
  function stdText(k) { const s = C().std[k]; return s ? `${s.l}(${C().source.short} ${s.ref})` : ''; }

  /* ---------- 미흡 상세 ---------- */
  function autoRec(it, a) {
    const all = reasons(it); const sel = (a.reasons || []).map(c => all.find(r => r.c === c)).filter(Boolean);
    const lines = sel.filter(r => r.c !== 'ETC').map(r => r.r);
    if ((a.reasons || []).includes('ETC')) lines.push(`기타 사유${a.etc ? `(${a.etc.trim()})` : ''} 확인 후 시정 조치`);
    return lines.map(l => '- ' + l).join('\n');
  }
  // 미흡 항목 완료 요건: 사유 1개 이상, (기타 선택 시 기타 내용), 현장 확인 내용, 시정 권고
  function deficiencyGaps(a) {
    const g = [];
    if (!a || a.status !== 'N') return g;
    if (!(a.reasons || []).length) g.push('미흡 사유 선택');
    if ((a.reasons || []).includes('ETC') && !(a.etc || '').trim()) g.push('기타 사유 내용');
    if (!(a.note || '').trim()) g.push('현장 확인 내용');
    if (!(a.rec || '').trim()) g.push('시정 권고');
    return g;
  }
  function itemDone(a) { return !!(a && a.status) && deficiencyGaps(a).length === 0; }

  /* ---------- 예산 합계(사전점검 입력값) ---------- */
  const BROWS = [['c1', '센터운영비', '인건비'], ['c2', '센터운영비', '사업운영비'], ['c3', '센터운영비', '홍보비'], ['c4', '센터운영비', '기타'],
    ['h1', '인력운영비', '교육비'], ['h2', '인력운영비', '농작업 참여비'], ['h3', '인력운영비', '영농작업반장수당'], ['h4', '인력운영비', '기타']];
  function budget(pre) {
    pre = pre || {}; const P = k => num(pre['p_' + k]) || 0, E = k => num(pre['e_' + k]) || 0;
    const g = ks => [ks.reduce((t, k) => t + P(k), 0), ks.reduce((t, k) => t + E(k), 0)];
    const cen = g(['c1', 'c2', 'c3', 'c4']), hum = g(['h1', 'h2', 'h3', 'h4']);
    const all = [cen[0] + hum[0], cen[1] + hum[1]];
    return { cen, hum, all, rate: all[0] ? r1(all[1] / all[0] * 100) : null, ratio: all[0] ? r1(cen[0] / all[0] * 100) : null };
  }

  /* ---------- 자동 검증 규칙(수치) ---------- */
  function ruleFindings(insp) {
    const S = C().std, out = [], pre = insp.pre || {}, ans = insp.answers || {};
    const its = items(insp.type);
    const chk = id => ((ans[id] || {}).checks) || {};
    const push = (ruleId, itemId, text, stdKey) => {
      const R = C().rules[ruleId]; const it = its.find(i => i.id === itemId);
      if (!it) return;
      out.push({ rule: ruleId, kind: R.kind, item: it, text, ref: stdKey ? `${C().source.short} ${S[stdKey].ref}` : `${C().source.short} ${R.ref || it.ref}`, act: R.act });
    };
    const rule = (ruleId) => its.filter(i => (i.rules || []).includes(ruleId)).map(i => i.id);
    // 인력 요건
    rule('STAFF').forEach(id => {
      const s = num(pre.staff), sp = num(pre.support);
      if (s != null && s < S.staffMin.v) push('STAFF', id, `전담인력 ${s}명 — 기준 ${S.staffMin.v}명 이상`, 'staffMin');
      if (insp.type === 'A' && sp != null && sp < S.supportMin.v) push('STAFF', id, `운영 지원인력 ${sp}명 — 기준 ${S.supportMin.v}명 이상`, 'supportMin');
    });
    rule('TEAM').forEach(id => { const t = num(pre.teams), p = num(pre.team_people);
      if (t && p != null && p / t < S.teamMin.v) push('TEAM', id, `영농작업반 평균 ${r1(p / t)}명(${t}개 반, ${p}명) — 기준 반당 ${S.teamMin.v}명 이상`, 'teamMin'); });
    rule('LEADPER').forEach(id => { const t = num(pre.teams), cur = num(pre.current);
      if (t && cur && cur / t > S.leadPer.v) push('LEADPER', id, `작업반장 1명당 계절노동자 ${r1(cur / t)}명 — 5~10명당 1명 권장`, 'leadPer'); });
    rule('POSTS').forEach(id => { const n = num(chk(id).posts);
      if (n != null && n < S.postsMin.v) push('POSTS', id, `구인공고 월 ${n}회 게시 — 기준 월 ${S.postsMin.v}회 이상`, 'postsMin'); });
    rule('SAMPLE').forEach(id => { const n = num(chk(id).smpN), ok = num(chk(id).smpOk);
      if (n && ok != null && ok < n) push('SAMPLE', id, `표본 ${n}건 중 ${n - ok}건 플랫폼 기록 불일치`); });
    // 예산
    const b = budget(pre);
    rule('RATIO').forEach(id => { const lim = insp.sub === '시도형' ? S.centerRatioSido.v : S.centerRatio.v;
      if (b.ratio != null && b.ratio > lim + 0.05) push('RATIO', id, `센터운영비 편성비율 ${b.ratio}% — 기준 ${lim}%`, insp.sub === '시도형' ? 'centerRatioSido' : 'centerRatio'); });
    rule('MATCH').forEach(id => { const n = num(pre.bud_nat), l = num(pre.bud_loc);
      if (n != null && l != null && l < n) push('MATCH', id, `지방비 ${won(l)}백만원이 국비 ${won(n)}백만원보다 적음 — 국비 50%·지방비 50% 매칭 여부 확인`); });
    rule('EDU').forEach(id => { const u = num(chk(id).eduUnit), d = num(chk(id).eduDays);
      if (u != null && u > S.eduUnit.v) push('EDU', id, `교육비 1인 1일 ${won(u)}원 — 기준 ${won(S.eduUnit.v)}원`, 'eduUnit');
      if (d != null && d > S.eduDays.v) push('EDU', id, `교육비 지급 ${d}일 — 기준 인당 최대 ${S.eduDays.v}일`, 'eduDays'); });
    rule('TRANS').forEach(id => { const c = chk(id), v = num(c.trans); if (v == null || !c.dist) return;
      const lim = c.dist === '30㎞ 미만' ? S.transNear.v : S.transFar.v;
      if (v > lim) push('TRANS', id, `교통비 1일 ${won(v)}원(${c.dist}) — 기준 ${won(lim)}원`, c.dist === '30㎞ 미만' ? 'transNear' : 'transFar'); });
    rule('LODGE').forEach(id => { const v = num(chk(id).lodge); if (v != null && v > S.lodge.v) push('LODGE', id, `숙박비 1박 ${won(v)}원 — 기준 ${won(S.lodge.v)}원`, 'lodge'); });
    rule('SNACK').forEach(id => { const v = num(chk(id).snack); if (v != null && v > S.snack.v) push('SNACK', id, `간식비 1일 ${won(v)}원 — 기준 ${won(S.snack.v)}원`, 'snack'); });
    rule('LEAD').forEach(id => { const v = num(chk(id).lead); if (v != null && v > S.lead.v) push('LEAD', id, `작업반장 수당 1일 ${won(v)}원 — 기준 ${won(S.lead.v)}원`, 'lead'); });
    rule('BUDOVER').forEach(id => { BROWS.forEach(([k, g, n]) => { const pl = num(pre['p_' + k]), ex = num(pre['e_' + k]);
      if (pl != null && ex != null && ex > pl) push('BUDOVER', id, `${g} ${n} 집행 ${won(ex)}천원이 예산계획 ${won(pl)}천원 초과(${won(ex - pl)}천원) — 변경 승인 여부 확인`); }); });
    rule('PUBRATE').forEach(id => { if (b.rate == null || !b.all[1]) return;
      if (b.rate < S.pubRate30.v) push('PUBRATE', id, `현재 집행률 ${b.rate}% — 30% 미만(차년도 사업신청 시점 기준 선정 제외 사유)`, 'pubRate30');
      else if (b.rate < S.pubRate50.v) push('PUBRATE', id, `현재 집행률 ${b.rate}% — 실집행률 50% 미만 시 차년도 사업비 감액 가능`, 'pubRate50'); });
    rule('WAGE').forEach(id => { const v = num(chk(id).wage); if (v != null && v < S.wage.v) push('WAGE', id, `표본 시급 ${won(v)}원 — 최저임금 ${won(S.wage.v)}원 미만`, 'wage'); });
    rule('ECON').forEach(id => { const v = num(chk(id).econ); if (v != null && v > S.econ.v) push('ECON', id, `경제사업장 노동 ${v}% — 기준 ${S.econ.v}% 이하`, 'econ'); });
    rule('ROOM').forEach(id => { const v = num(chk(id).room); if (v != null && v < S.room.v) push('ROOM', id, `침실 1인당 ${v}㎡ — 기준 ${S.room.v}㎡ 이상`, 'room'); });
    rule('FEE').forEach(id => { const c = chk(id), o = num(c.ord), f = num(c.fee); if (!o || f == null || !c.feeMode) return;
      const k = c.feeMode === '숙소만' ? 'feeRoom' : 'feeAll'; const p = r1(f / o * 100);
      if (p > S[k].v) push('FEE', id, `숙식비 공제 ${p}%(${c.feeMode}) — 기준 통상임금 ${S[k].v}%`, k); });
    rule('DORM').forEach(id => { const d = (ans[id] || {}).dorm || {};
      C().dormChecklist.forEach((t, i) => { if (i !== 1 && d[i] === '부적합') push('DORM', id, `숙소 점검표 ${i + 1}번 부적합: ${t.replace(/\(.*\)/, '')}`); }); });
    return out;
  }

  /* ---------- 지출 표본 점검(시행지침 사업비 집행기준 대조) ---------- */
  function ledgerDefs(t) { return (C().ledger || {})[t] || []; }
  function ledgerRow(insp, row, idx) {
    const S = C().std, L = C().ledger, d = ledgerDefs(insp.type).find(x => x.k === row.k); if (!d) return [];
    const it = item(insp.type, d.item); if (!it) return [];
    const u = num(row.unit), q = num(row.qty) || 0, days = num(row.days), f = row.flags || {}, pf = row.proofs || {};
    const out = [], tag = `표본 ${idx + 1}(${d.l})`, ref = `${C().source.short} ${d.ref}`;
    const add = (kind, reason, text, over, stdKey, itemId) => {
      const tgt = itemId ? item(insp.type, itemId) : it;
      out.push({ rule: 'LEDGER', kind, item: tgt, reason, text: `${tag}: ${text}`, msg: text, over: over || 0, row: idx, ref: stdKey ? `${C().source.short} ${S[stdKey].ref}` : ref,
        act: kind === 'verify' ? '집행 목적·근거 소명 자료 확인' : over ? `초과 지급액 ${won(over)}원 확인 및 환수 여부 검토` : '해당 지출 증빙 확인 및 정정 요청' }); };
    const cap = (lim, stdKey, reason, label) => { if (u != null && u > lim) add('violation', reason, `${label} ${won(u)}원 — 기준 ${won(lim)}원 이하${q ? `, 초과 ${won((u - lim) * q)}원(${won(u - lim)}원×${q})` : ''}`, (u - lim) * q, stdKey); };
    if (row.k === 'EDU') { cap(S.eduUnit.v, 'eduUnit', 'EDUP-UNIT', '1인 1일');
      if (days != null && days > S.eduDays.v) add('violation', 'EDUP-DAYS', `인당 ${days}일 지급 — 기준 최대 ${S.eduDays.v}일`, 0, 'eduDays');
      const dt = num(row.dayTotal); if (dt != null && dt > S.eduDayCap.v) add('violation', 'EDUP-UNIT', `농가 1일 지급 합계 ${won(dt)}원 — 일 최대 ${won(S.eduDayCap.v)}원`, dt - S.eduDayCap.v, 'eduDayCap'); }
    if (row.k === 'TRANS' && row.dist) { const near = row.dist === '30㎞ 미만'; cap(near ? S.transNear.v : S.transFar.v, near ? 'transNear' : 'transFar', 'FEE-TRANS', `교통비(${row.dist}) 1일`); }
    if (row.k === 'LODGE') { cap(S.lodge.v, 'lodge', 'FEE-LODGE', '숙박비 1박');
      if (days != null && days < S.lodgeDays.v) add('violation', 'FEE-LODGE', `연속 참여 ${days}일 — 숙박비는 ${S.lodgeDays.v}일 이상 연속 참여 시 지급`, u != null ? u * q : 0, 'lodgeDays'); }
    if (row.k === 'SNACK') cap(S.snack.v, 'snack', 'FEE-SNACK', '간식비 1일');
    if (row.k === 'LEAD') cap(S.lead.v, 'lead', it.reasons.some(r => r.c === 'LEAD-OVER') ? 'LEAD-OVER' : 'LEAD-OVER', '작업반장 수당 1일');
    (d.flags || []).forEach(fl => {
      if (!f[fl.k]) return;
      if (fl.need) { const miss = fl.need.filter(n => !pf[n.k]); if (miss.length) add('violation', fl.reason, `${fl.l} — ${miss.map(n => n.l).join('·')} 없음`); return; }
      if (fl.durable) { if (u != null && u >= S.durable.v) add('violation', fl.reason, `${fl.l}, 단가 ${won(u)}원 — 중요자산(50만원 이상) 구입 불가`, u * q, 'durable'); return; }
      if (fl.verify) { add('verify', fl.reason, fl.l); return; }
      add('violation', fl.reason, fl.l, u != null ? u * q : 0);
    });
    if (d.need) { const miss = d.need.filter(n => !pf[n.k]); if (miss.length) add('violation', d.needReason, `${miss.map(n => n.l).join('·')} 없음`); }
    const cm = L.common.filter(n => !pf[n.k]);
    if (cm.length) { const [pi, pr] = L.proofItem[insp.type]; add('violation', pr, `${cm.map(n => n.l).join('·')} 확인 안 됨`, 0, null, pi); out[out.length - 1].ref = `${C().source.short} ${cm.map(n => n.ref).join(', ')}`; }
    return out;
  }
  function ledgerFindings(insp) { return (insp.ledger || []).reduce((o, r, i) => o.concat(ledgerRow(insp, r, i)), []); }
  function ledgerSummary(insp) {
    const rows = insp.ledger || [], fs = ledgerFindings(insp);
    const bad = new Set(fs.filter(f => f.kind === 'violation').map(f => f.row)), ver = new Set(fs.filter(f => f.kind === 'verify').map(f => f.row));
    const amt = rows.reduce((t, r) => t + (num(r.unit) || 0) * (num(r.qty) || 0), 0);
    return { n: rows.length, bad: bad.size, verify: ver.size, over: fs.reduce((t, f) => t + (f.over || 0), 0), amt, fs };
  }
  function allFindings(insp) { return ruleFindings(insp).concat(ledgerFindings(insp)); }
  // 미흡 선택 시 자동 사유: 지출 표본·수치 규칙에서 확인된 사유
  function autoReasons(insp, it) {
    const codes = new Set(), own = (it.reasons || []).map(r => r.c);
    allFindings(insp).filter(f => f.item.id === it.id).forEach(f => { const c = f.reason || (C().rules[f.rule] || {}).reason; if (c && own.includes(c)) codes.add(c); });
    return [...codes];
  }
  // 현장 확인 내용 초안: 확인된 사실(수치·표본) + 선택 사유 + 서류 미제출
  function autoNote(insp, it, a) {
    const lines = [], fs = allFindings(insp).filter(f => f.item.id === it.id), used = new Set();
    fs.forEach(f => { lines.push('- ' + f.text); const c = f.reason || (C().rules[f.rule] || {}).reason; if (c) used.add(c); });
    reasonLabels(it, (a.reasons || []).filter(c => c !== 'ETC' && !used.has(c))).forEach(l => lines.push(`- ${l} 확인`));
    if ((a.reasons || []).includes('ETC') && (a.etc || '').trim()) lines.push(`- ${a.etc.trim()}`);
    const docs = insp.docs || {}, miss = (it.docs || []).filter(d => docs[d] === 'M').map(d => ((C().docs[insp.type] || []).find(x => x.id === d) || {}).l).filter(Boolean);
    if (miss.length) lines.push(`- 관련 서류 미제출: ${miss.join(', ')}`);
    return lines.join('\n');
  }

  /* ---------- 종합 검증 ---------- */
  // kind: violation(기준 위반·수치 확인) / verify(사람 확인 필요) / incomplete(작성 미완료) / missing(미응답) / inconsistent(결과 불일치) / docs(서류 미비)
  function validate(insp) {
    const out = [], its = items(insp.type), ans = insp.answers || {}, docs = insp.docs || {};
    const docName = id => ((C().docs[insp.type] || []).find(d => d.id === id) || {}).l || id;
    const rf = allFindings(insp);
    its.forEach(it => {
      const a = ans[it.id] || {}; const ref = `${C().source.short} ${it.ref}`;
      if (!a.status) out.push({ kind: 'missing', item: it, text: '점검 결과 미입력', ref, act: '현장 확인 후 결과 입력' });
      const gaps = deficiencyGaps(a);
      if (gaps.length) out.push({ kind: 'incomplete', item: it, text: `미흡 상세 미작성: ${gaps.join(', ')}`, ref, act: '미흡 상세 내용 작성' });
      const mDocs = (it.docs || []).filter(d => docs[d] === 'M');
      if (mDocs.length) {
        if (a.status === 'C') out.push({ kind: 'inconsistent', item: it, text: `관련 서류 미제출(${mDocs.map(docName).join(', ')}) 상태에서 '적정' 판정`, ref, act: "서류 확인 후 '적정' 유지 여부 재검토(필요 시 '확인필요')" });
        else if (a.status !== 'NA') out.push({ kind: 'docs', item: it, text: `관련 서류 미제출: ${mDocs.map(docName).join(', ')}`, ref, act: '서류 보완 요청' });
      }
      const mine = rf.filter(x => x.item.id === it.id);
      mine.forEach(x => {
        if (a.status === 'C' && x.kind === 'violation') out.push(Object.assign({}, x, { kind: 'inconsistent', text: `${x.text} — '적정' 판정과 불일치`, act: `판정 재검토. ${x.act}` }));
        else out.push(x);
      });
      if (a.status === 'U') out.push({ kind: 'verify', item: it, text: `현장 확인필요${a.note ? ': ' + a.note : ''}`, ref, act: '추가 자료 확보 후 결과 확정' });
      if (it.crit && a.status === 'N') out.push({ kind: 'violation', item: it, text: '중대 사항 미흡 — 시행지침상 처벌·참여 배제와 연관된 항목', ref, act: '관리자 즉시 보고 및 관계기관 확인' });
    });
    return out;
  }

  /* ---------- 결과 집계 ---------- */
  function evaluate(insp) {
    const its = items(insp.type), ans = insp.answers || {};
    const res = { total: its.length, C: 0, N: 0, NA: 0, U: 0, answered: 0, unanswered: [], byCat: [], deficiencies: [], verifies: [], incomplete: [] };
    const cats = {};
    type(insp.type).categories.forEach(c => { cats[c.id] = { id: c.id, name: c.name, total: 0, C: 0, N: 0, NA: 0, U: 0 }; });
    its.forEach(it => {
      const a = ans[it.id]; const cat = cats[it.cat]; cat.total++;
      if (!a || !a.status) { res.unanswered.push(it); return; }
      res.answered++; res[a.status]++; cat[a.status]++;
      if (a.status === 'N') { const d = { item: it, a, labels: reasonLabels(it, a.reasons), gaps: deficiencyGaps(a) }; res.deficiencies.push(d); if (d.gaps.length) res.incomplete.push(d); }
      if (a.status === 'U') res.verifies.push({ item: it, a });
    });
    res.byCat = Object.values(cats);
    return res;
  }
  function reasonLabels(it, codes) { const all = reasons(it); return (codes || []).map(c => { const r = all.find(x => x.c === c); return r ? r.l : null; }).filter(Boolean); }
  function canComplete(insp) { const r = evaluate(insp); return { ok: !r.unanswered.length && !r.incomplete.length, r }; }

  /* ---------- 점검표 종합판정 제안 ---------- */
  function formSuggest(insp, rowKey) {
    const its = items(insp.type).filter(i => i.form === rowKey), ans = insp.answers || {};
    const xs = its.map(i => ({ i, a: ans[i.id] || {} })).filter(x => x.a.status && x.a.status !== 'NA');
    const viol = allFindings(insp).filter(f => f.kind === 'violation' && f.item.form === rowKey).length;
    if (!xs.length) return '';
    if (xs.some(x => x.i.crit && x.a.status === 'N')) return '매우 미흡';
    const n = xs.filter(x => x.a.status === 'N').length, u = xs.filter(x => x.a.status === 'U').length;
    if (n >= 2) return '미흡';
    if (n === 1 || u >= 2 || viol) return '보통';
    return '양호';
  }

  /* ---------- 종합의견 초안 ---------- */
  function opinionDraft(insp) {
    const r = evaluate(insp), b = budget(insp.pre), lines = [];
    lines.push(`○ 점검 결과 전체 ${r.total}개 항목 중 적정 ${r.C}건, 미흡 ${r.N}건, 확인필요 ${r.U}건, 해당없음 ${r.NA}건임.`);
    if (b.rate != null) lines.push(`○ 기준일 사업비 집행률 ${b.rate}%(예산 ${won(b.all[0])}천원 중 ${won(b.all[1])}천원 집행)임.`);
    const ls = ledgerSummary(insp);
    if (ls.n) lines.push(`○ 지출 표본 ${ls.n}건 점검 결과 집행기준 위반 ${ls.bad}건${ls.over ? `, 초과·부적정 지급 추정액 ${won(ls.over)}원(환수 여부 검토)` : ''}${ls.verify ? `, 확인 필요 ${ls.verify}건` : ''}임.`);
    const crit = r.deficiencies.filter(d => d.item.crit);
    if (crit.length) lines.push(`○ 중대 사항 미흡: ${crit.map(d => d.item.t).join(', ')} — 관리자 보고 및 관계기관 확인 필요.`);
    const others = r.deficiencies.filter(d => !d.item.crit);
    if (others.length) lines.push(`○ 주요 미흡 사항: ${others.map(d => `${d.item.t}(${d.labels.join('·') || '사유 미선택'})`).join('; ')} — 시정 조치 요청.`);
    if (r.verifies.length) lines.push(`○ 추가 확인 필요: ${r.verifies.map(v => v.item.t).join(', ')} — 자료 보완 후 결과 확정.`);
    if (!r.N && !r.U) lines.push('○ 점검 항목 전반이 시행지침 기준에 따라 운영되고 있음.');
    return lines.join('\n');
  }

  /* 점검 코드: 시도 + 방문번호(점검계획 일정표 순번). 연도·반기·차수는 내부 번호에만 씀 */
  const REGIONS = [['SU', '서울'], ['BS', '부산'], ['DG', '대구'], ['IC', '인천'], ['GJ', '광주'], ['DJ', '대전'], ['US', '울산'], ['SJ', '세종'], ['GG', '경기'], ['GW', '강원'], ['CB', '충북'], ['CN', '충남'], ['JB', '전북'], ['JN', '전남'], ['GB', '경북'], ['GN', '경남'], ['JJ', '제주']];
  const regionKey = name => (REGIONS.find(r => r[1] === name) || [])[0];
  const half = d => (+String(d || '').slice(5, 7) || 1) <= 6 ? 1 : 2;
  const pad2 = v => String(v).padStart(2, '0');
  function makeId(region, visit, date, round, sample) {
    return `${sample ? 'SMP-' : ''}${String(date).slice(0, 4)}H${half(date)}-${regionKey(region)}-${pad2(visit)}${round > 1 ? '-' + round : ''}`;
  }
  const code = i => i.region ? `${i.region}-${pad2(i.visit)}${i.round > 1 ? ` (${i.round}차)` : ''}` : (i.centerId || '');
  const period = i => `${String(i.date || '').slice(0, 4)} ${half(i.date) === 1 ? '상반기' : '하반기'}`;

  return { REGIONS, regionKey, half, makeId, code, period, type, items, item, reasons, resultLabel, stdText, autoRec, deficiencyGaps, itemDone, budget, BROWS, ruleFindings, ledgerDefs, ledgerRow, ledgerFindings, ledgerSummary, allFindings, autoReasons, autoNote, validate, evaluate, reasonLabels, canComplete, formSuggest, opinionDraft, num, won };
})();
