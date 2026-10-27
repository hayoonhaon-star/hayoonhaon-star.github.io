/*
 * A4 보고서 생성 (report.js)
 * - 화면 안의 인쇄 전용 영역(#print)에 보고서를 그린 뒤 브라우저 인쇄 기능으로 PDF 저장합니다.
 * - 브라우저가 기기 글꼴로 한글을 그리므로 글자 깨짐 없이 PDF가 만들어집니다.
 */
window.FI = window.FI || {};
FI.report = (function () {
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = d => d ? d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (m, y, mo, da) => `${y}. ${+mo}. ${+da}.`) : '';

  function one(insp, settings) {
    const E = FI.engine, m = E.module(insp.module), res = E.evaluate(insp);
    const title = insp.module === 'farm' ? '계절노동 인권·안전 실태 현장점검 결과(고용주 점검)' : '계절노동 인권·안전 실태 현장점검 결과(시·군 점검)';
    const draft = insp.status !== 'done';
    const wkt = FI.wkText ? FI.wkText(insp) : '';
    const fields = [wkt && esc(m.workerCounts ? m.workerCounts.label : '') + ' ' + esc(wkt)].concat((m.fields || []).filter(f => insp.fields && insp.fields[f.k] && typeof insp.fields[f.k] !== 'object').map(f => `${esc(f.l)} ${esc(insp.fields[f.k])}`)).filter(Boolean).join(' · ');

    const catRows = res.byCat.map(c => `<tr><td class="l">${esc(c.name)}</td><td>${c.total}</td><td>${c.C}</td><td class="${c.N ? 'neg' : ''}">${c.N}</td><td>${c.U}</td><td>${c.NA}</td></tr>`).join('');

    const fList = res.findings.length
      ? `<ol class="fl">${res.findings.map(f => `<li><b>${esc(f.f)}</b><span class="src">[${esc(f.itemId)} ${esc(f.item.short)}]</span></li>`).join('')}</ol>`
      : '<p class="none">확인된 지적사항 없음</p>';
    const rList = res.findings.length
      ? `<ol class="fl">${res.findings.map(f => `<li>${esc(f.r)}<span class="src">[${esc(f.itemId)}]</span></li>`).join('')}</ol>`
      : '<p class="none">해당 없음</p>';
    const vList = res.verifies.length
      ? `<ol class="fl">${res.verifies.map(v => `<li>${esc(v.f)} — ${esc(v.r)}<span class="src">[${esc(v.itemId)}${v.kind === 'unverified' ? ' · 미확인' : v.kind === 'proof' ? ' · 증빙 미확인' : ' · 기타'}]</span></li>`).join('')}</ol>`
      : '<p class="none">해당 없음</p>';

    const itemRows = E.items(insp.module).map(it => {
      const a = (insp.answers || {})[it.id] || {};
      const rs = E.reasonLabels(it, a.reasons).join(', ');
      const ex = (it.extra || []).filter(x => a.extra && a.extra[x.k] && (it.extraWhen || ['C']).includes(a.status)).map(x => `${x.l} ${x.type === 'date' ? fmtDate(a.extra[x.k]) : a.extra[x.k]}`).join(', ');
      const meth = (a.methods || []).join('·');
      const detail = [rs, ex, meth && `확인: ${meth}`].filter(Boolean).join(' / ');
      return `<tr><td>${esc(it.id)}</td><td class="l">${esc(it.q)}</td><td class="${a.status === 'N' ? 'neg' : a.status === 'U' ? 'unv' : ''}">${esc(E.optionLabel(it, a.status)) || '미응답'}</td><td class="l sm">${esc(detail)}</td></tr>`;
    }).join('');

    const opinion = insp.module === 'sigun' && insp.opinion ? `<h3>현장 의견수렴(제도개선 및 건의사항)</h3><p class="pre">${esc(insp.opinion)}</p>` : '';

    return `<section class="rp">
      ${draft ? '<div class="draftmark">작성 중(미완료)</div>' : ''}
      <h1>${esc(title)}</h1>
      <table class="meta">
        <tr><th>점검 구분</th><td>${esc(m.name)}</td><th>점검 대상</th><td><b>${esc(insp.label)}</b></td></tr>
        <tr><th>점검일</th><td>${esc(fmtDate(insp.date))}</td><th>점검반</th><td>${esc(settings.team || '')}${settings.region ? ' · ' + esc(settings.region) : ''}</td></tr>
        <tr><th>${insp.module === 'farm' ? '사업장명' : '시·군명'}<br><small>(현장 수기 기재)</small></th><td colspan="3" class="blank"></td></tr>
        ${fields ? `<tr><th>현황</th><td colspan="3" class="l">${fields}</td></tr>` : ''}
      </table>

      <h2>1. 점검 결과 요약</h2>
      <table class="sum"><tr><th>전체 항목</th><th>준수</th><th>미준수</th><th>미확인</th><th>미해당</th><th>미응답</th></tr>
        <tr><td>${res.total}</td><td>${res.C}</td><td class="${res.N ? 'neg' : ''}">${res.N}</td><td>${res.U}</td><td>${res.NA}</td><td>${res.unanswered.length}</td></tr></table>
      <table class="cat"><tr><th class="l">분류</th><th>항목</th><th>준수</th><th>미준수</th><th>미확인</th><th>미해당</th></tr>${catRows}</table>

      <h2>2. 주요 지적사항 <small>(점검 결과 확인된 사항)</small></h2>${fList}
      <h2>3. 시정 권고</h2>${rList}
      <h2>4. 추가 확인 필요 사항 <small>(미확인·증빙 미확인 — 확정된 지적사항 아님)</small></h2>${vList}
      ${opinion}

      <h2>5. 점검표 항목별 결과</h2>
      <table class="items"><tr><th style="width:12%">번호</th><th class="l">점검 항목(원문)</th><th style="width:11%">결과</th><th class="l" style="width:30%">사유·확인 방법</th></tr>${itemRows}</table>

      <table class="sign">
        <tr><th rowspan="2">점검자</th><td>소속 :</td><td>직위 :</td><td>성명 :</td><td class="seal">(인)</td></tr>
        <tr><td>소속 :</td><td>직위 :</td><td>성명 :</td><td class="seal">(인)</td></tr>
      </table>
      <p class="foot">※ 근거: ${esc(FI.CONFIG.source.title)} ${esc(m.doc)}. 미준수 사유 분류와 지적·권고 문안은 운영 참고용 분류로, 법령 위반 여부나 행정처분을 판정한 것이 아닙니다. 대상은 익명 번호로만 표기하며 사업장명은 현장에서 수기로 기재합니다.</p>
    </section>`;
  }

  function build(list, settings) {
    return list.map(i => one(i, settings)).join('');
  }

  function print(list, settings) {
    const el = document.getElementById('print');
    el.innerHTML = build(list, settings);
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { try { window.print(); } catch (e) { done(); } }, 60);
  }

  return { build, print, one };
})();
