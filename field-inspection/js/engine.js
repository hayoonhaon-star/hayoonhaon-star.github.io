/*
 * 규칙 기반 판정·문안 생성 엔진 (engine.js)
 * - 인터넷·AI API를 사용하지 않습니다. checklists.js 의 사유·문안 규칙만 사용합니다.
 * - 법령 위반·행정처분 여부는 판정하지 않습니다. 생성 문안은 "점검 지적사항(운영 참고)"입니다.
 */
window.FI = window.FI || {};
FI.engine = (function () {
  const C = () => FI.CONFIG;

  function module(id) { return C().modules[id]; }

  // 모듈의 전체 문항(분류 정보 포함)
  function items(moduleId) {
    const m = module(moduleId);
    if (!m || !m.categories) return [];
    const out = [];
    m.categories.forEach(cat => cat.items.forEach(it => out.push(Object.assign({ cat: cat.id, catName: cat.name }, it))));
    return out;
  }
  function item(moduleId, itemId) { return items(moduleId).find(i => i.id === itemId); }

  // 문항 응답옵션 = 공식 응답옵션 + 미확인
  function options(it) {
    const base = (C().statusSets[it.statusSet] || C().statusSets.comply).map(o => ({
      v: o.v, l: (it.statusLabels && it.statusLabels[o.v]) || o.l
    }));
    return base.concat([C().unverified]);
  }
  function optionLabel(it, v) { const o = options(it).find(x => x.v === v); return o ? o.l : ''; }

  // 문항별 선택 가능한 사유(+ 기타 확인 필요)
  function reasons(it) { return (it.reasons || []).concat([C().etcReason]); }

  function joinKo(list) {
    if (list.length <= 1) return list.join('');
    if (list.length === 2) return list[0] + ' 및 ' + list[1];
    return list.slice(0, -1).join('·') + ' 및 ' + list[list.length - 1];
  }

  // 한 문항의 지적사항·확인사항 산출
  function itemResult(it, ans) {
    const findings = [], verifies = [];
    if (!ans || !ans.status) return { findings, verifies };
    if (ans.status === 'U') {
      verifies.push({ key: it.id + ':U', itemId: it.id, codes: ['U'], kind: 'unverified',
        f: it.short + ' 현장 미확인', r: it.short + ' 이행 여부 추가 확인 필요' });
      return { findings, verifies };
    }
    if (ans.status !== 'N') return { findings, verifies };

    const all = reasons(it);
    const sel = (ans.reasons || []).map(c => all.find(r => r.c === c)).filter(Boolean);
    if (!sel.length) {
      findings.push({ key: it.id + ':NONE', itemId: it.id, codes: [], noReason: true,
        f: it.short + ' 미흡(세부 사유 미선택)', r: it.short + ' 관련 시정 조치 필요' });
      return { findings, verifies };
    }
    const comb = it.combine ? sel.filter(r => !r.verify && r.o) : [];
    if (comb.length) {
      const o = joinKo(comb.map(r => r.o)), a = joinKo(comb.map(r => r.a || r.o));
      findings.push({ key: it.id + ':' + comb.map(r => r.c).join('+'), itemId: it.id, codes: comb.map(r => r.c),
        f: it.combine.f.replace('{o}', o).replace('{a}', a), r: it.combine.r.replace('{o}', o).replace('{a}', a) });
    }
    sel.filter(r => !comb.includes(r)).forEach(r => {
      if (r.c === 'ETC') {
        verifies.push({ key: it.id + ':ETC', itemId: it.id, codes: ['ETC'], kind: 'etc',
          f: it.short + ' — 기타 사유로 추가 확인 필요', r: it.short + ' 세부 사항 확인 후 조치 여부 판단 필요' });
      } else if (r.verify) {
        verifies.push({ key: it.id + ':' + r.c, itemId: it.id, codes: [r.c], kind: 'proof', f: r.f, r: r.r });
      } else {
        findings.push({ key: it.id + ':' + r.c, itemId: it.id, codes: [r.c], f: r.f, r: r.r });
      }
    });
    return { findings, verifies };
  }

  // 점검 기록 전체 평가
  function evaluate(insp) {
    const its = items(insp.module);
    const m = module(insp.module);
    const res = { total: its.length, C: 0, N: 0, U: 0, NA: 0, answered: 0, unanswered: [], byCat: [], findings: [], verifies: [] };
    const cats = {};
    (m.categories || []).forEach(c => { cats[c.id] = { id: c.id, name: c.name, total: 0, C: 0, N: 0, U: 0, NA: 0 }; });
    its.forEach(it => {
      const a = (insp.answers || {})[it.id];
      const cat = cats[it.cat]; cat.total++;
      if (!a || !a.status) { res.unanswered.push(it); return; }
      res.answered++; res[a.status]++; cat[a.status]++;
      const r = itemResult(it, a);
      r.findings.forEach(x => res.findings.push(applyEdit(insp, Object.assign({ item: it }, x))));
      r.verifies.forEach(x => res.verifies.push(applyEdit(insp, Object.assign({ item: it }, x))));
    });
    res.byCat = Object.values(cats);
    return res;
  }

  // 점검자가 수정한 문안 반영(원래 문안은 auto 로 보존)
  function applyEdit(insp, x) {
    x.autoF = x.f; x.autoR = x.r;
    const e = insp.edits && insp.edits[x.key];
    if (e) { if (typeof e.f === 'string') x.f = e.f; if (typeof e.r === 'string') x.r = e.r; x.edited = true; }
    return x;
  }

  function reasonLabels(it, codes) {
    const all = reasons(it);
    return (codes || []).map(c => (all.find(r => r.c === c) || {}).l).filter(Boolean);
  }

  return { module, items, item, options, optionLabel, reasons, evaluate, itemResult, reasonLabels, joinKo };
})();
