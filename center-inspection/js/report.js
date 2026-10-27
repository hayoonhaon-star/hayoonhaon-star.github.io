/*
 * A4 보고서 생성 (report.js)
 * - 화면 안의 보고서 영역을 브라우저 인쇄 기능으로 출력하거나 PDF로 저장합니다(업로드 없음).
 * - 보고서에는 관리번호만 표시하고, 센터명·담당자·연락처·주소·점검자 성명은 빈칸으로 둡니다.
 * 종류: sum(점검 결과 보고서) / fix(시정조치 요청서) / form(현장점검표: 점검계획 붙임 2·3)
 */
window.CI = window.CI || {};
CI.report = (function () {
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = d => d ? String(d).replace(/^(\d{4})-(\d{2})-(\d{2})$/, (m, y, mo, da) => `${y}. ${+mo}. ${+da}.`) : '';
  const E = () => CI.engine, C = () => CI.CONFIG;
  const nf = v => { const n = E().num(v); return n == null ? '' : E().won(n); };
  const pre = (s) => `<p class="pre">${esc(s)}</p>`;

  function head(insp, title) {
    const T = E().type(insp.type);
    return `${insp.status !== 'done' ? '<div class="draftmark">작성 중(미완료)</div>' : ''}<h1>${esc(title)}</h1>
      <table class="meta">
        <tr><th>점검번호</th><td>${esc(insp.id)}</td><th>점검 유형</th><td>${esc(T.name)}${insp.sub ? ' · ' + esc(insp.sub) : ''}</td></tr>
        <tr><th>센터 관리번호</th><td><b>${esc(insp.centerId)}</b></td><th>점검일</th><td>${esc(fmtDate(insp.date))}</td></tr>
        <tr><th>점검자 관리번호</th><td>${esc(insp.inspectorId || '')}</td><th>적용 기준</th><td class="sm">${esc(C().source.title)}</td></tr>
        <tr><th>센터명<br><small>(내부 수기 기재)</small></th><td colspan="3" class="blank"></td></tr>
      </table>`;
  }

  /* 1) 점검 결과 보고서 */
  function summary(insp) {
    const r = E().evaluate(insp), b = E().budget(insp.pre), v = E().validate(insp);
    const viol = v.filter(x => x.kind === 'violation' || x.kind === 'inconsistent');
    const catRows = r.byCat.map(c => `<tr><td class="l">${esc(c.name)}</td><td>${c.total}</td><td>${c.C}</td><td class="${c.N ? 'neg' : ''}">${c.N}</td><td class="${c.U ? 'unv' : ''}">${c.U}</td><td>${c.NA}</td></tr>`).join('');
    const defs = r.deficiencies.length ? `<table class="items"><tr><th style="width:15%">항목</th><th>미흡 사유</th><th>현장 확인 내용</th></tr>${r.deficiencies.map(d => `<tr><td>${esc(d.item.id)}<br><span class="sm">${esc(d.item.t)}</span>${d.item.crit ? '<br><b class="sm" style="color:#B42318">[중대]</b>' : ''}</td><td class="l">${esc(d.labels.join(', '))}${(d.a.reasons || []).includes('ETC') && d.a.etc ? `<br><span class="sm">기타: ${esc(d.a.etc)}</span>` : ''}</td><td class="l">${esc(d.a.note || '')}</td></tr>`).join('')}</table>` : '<p class="none">미흡 사항 없음</p>';
    const recs = r.deficiencies.length ? `<ol class="fl">${r.deficiencies.map(d => `<li><b>${esc(d.item.id)} ${esc(d.item.t)}</b>${pre(d.a.rec || '')}</li>`).join('')}</ol>` : '<p class="none">해당 없음</p>';
    const vers = r.verifies.length || viol.length ? `<ol class="fl">${r.verifies.map(x => `<li>${esc(x.item.id)} ${esc(x.item.t)}${x.a.note ? ' — ' + esc(x.a.note) : ''}<span class="src">[현장 확인필요]</span></li>`).join('')}${viol.map(x => `<li>${esc(x.item.id)} ${esc(x.text)}<span class="src">[${esc(x.ref)} · ${x.kind === 'inconsistent' ? '판정 불일치' : '기준 위반(수치 확인)'}]</span></li>`).join('')}</ol>` : '<p class="none">해당 없음</p>';
    const follow = r.deficiencies.length ? `<table><tr><th style="width:15%">항목</th><th>후속 조치</th><th style="width:14%">조치 상태</th></tr>${r.deficiencies.map(d => { const ac = (insp.actions || {})[d.item.id] || {}; return `<tr><td>${esc(d.item.id)}</td><td class="l">${esc(d.item.fu || '')}${ac.case ? `<br><span class="sm">사례번호 ${esc(ac.case)}</span>` : ''}</td><td>${esc(ac.status || '조치 전')}</td></tr>`; }).join('')}</table>` : '<p class="none">해당 없음</p>';
    return `<section class="rp">${head(insp, '농촌인력중개센터 운영실태 점검 결과 보고서')}
      <h2>1. 점검 개요</h2>
      <table class="meta"><tr><th>점검 근거</th><td class="l" colspan="3">${esc(C().plan.title)}</td></tr>
        <tr><th>점검 방법</th><td class="l" colspan="3">사전제출 자료 검토, 현장 증빙 확인, 담당자 면담</td></tr>
        ${b.all[0] ? `<tr><th>예산 집행</th><td class="l" colspan="3">예산 ${E().won(b.all[0])}천원 중 ${E().won(b.all[1])}천원 집행(집행률 ${b.rate}%) · 센터운영비 편성 ${b.ratio}%</td></tr>` : ''}</table>
      <h2>2. 점검 결과 요약</h2>
      <table class="sum"><tr><th>전체 항목</th><th>적정</th><th>미흡</th><th>확인필요</th><th>해당없음</th><th>미입력</th></tr>
        <tr><td>${r.total}</td><td>${r.C}</td><td class="${r.N ? 'neg' : ''}">${r.N}</td><td class="${r.U ? 'unv' : ''}">${r.U}</td><td>${r.NA}</td><td>${r.unanswered.length}</td></tr></table>
      <h3>분야별 결과</h3>
      <table class="cat"><tr><th class="l">분야</th><th>항목</th><th>적정</th><th>미흡</th><th>확인필요</th><th>해당없음</th></tr>${catRows}</table>
      <h2>3. 주요 미흡 사항</h2>${defs}
      <h2>4. 시정 권고</h2>${recs}
      <h2>5. 추가 확인 필요 사항 <small>(확정된 미흡 사항 아님)</small></h2>${vers}
      <h2>6. 종합 의견</h2>${insp.opinion ? pre(insp.opinion) : '<p class="none">(미작성)</p>'}
      <h2>7. 후속 관리</h2>${follow}
      ${sign()}
      <p class="foot">※ 기준: ${esc(C().source.title)}. 미흡 사유·권고 문안은 운영 참고 분류이며 법령 위반·행정처분 판단이 아님. [행정 확인 필요] 항목은 시행지침에 세부 기준이 없어 점검자 판단으로 기록함.</p>
    </section>`;
  }

  /* 2) 시정조치 요청서 */
  function fix(insp) {
    const r = E().evaluate(insp);
    const rows = r.deficiencies.map(d => { const ac = (insp.actions || {})[d.item.id] || {};
      return `<tr><td>${esc(ac.case || '-')}</td><td class="l"><b>${esc(d.item.id)}</b> ${esc(d.item.t)}<br><span class="sm">${esc(C().source.short)} ${esc(d.item.ref)}</span></td><td class="l">${esc(d.labels.join(', '))}<br><span class="sm">${esc(d.a.note || '')}</span></td><td class="l">${pre(d.a.rec || '')}<span class="sm">후속: ${esc(d.item.fu || '')}</span></td><td>${esc(ac.status || '조치 전')}${ac.date ? '<br>' + esc(fmtDate(ac.date)) : ''}</td></tr>`; }).join('');
    return `<section class="rp">${head(insp, '시정조치 요청서')}
      <p>운영실태 점검 결과 아래 사항에 대해 시정조치를 요청하며, 조치 결과를 증빙과 함께 제출하여 주시기 바람.</p>
      ${r.deficiencies.length ? `<table class="items"><tr><th style="width:15%">사례번호</th><th style="width:20%">점검 항목</th><th>미흡 사유·확인 내용</th><th>시정 권고·후속 조치</th><th style="width:11%">조치 상태</th></tr>${rows}</table>` : '<p class="none">시정조치 요청 사항 없음</p>'}
      <table class="meta" style="margin-top:6mm"><tr><th>조치 기한</th><td class="blank"></td><th>제출처</th><td class="blank"></td></tr></table>
      ${sign()}
    </section>`;
  }

  /* 3) 현장점검표(점검계획 붙임 2·3) */
  function form(insp) {
    const p = insp.pre || {}, pub = insp.type === 'B', b = E().budget(p), rows = C().formRows[insp.type];
    let last = ''; const br = E().BROWS.map(([k, g, n]) => { const first = g !== last; last = g; const gg = g === '센터운영비' ? b.cen : b.hum;
      return `<tr>${first ? `<td rowspan="4">${g}<br>(${g === '센터운영비' ? 40 : 60}%)</td>` : ''}<td class="l">${n}</td><td class="r">${nf(p['p_' + k])}</td><td class="r">${nf(p['e_' + k])}</td>${first ? `<td rowspan="4">${gg[0] ? Math.round(gg[1] / gg[0] * 1000) / 10 + '%' : ''}</td>` : ''}</tr>`; }).join('');
    const memo = k => { const r = E().evaluate(insp); const ds = r.deficiencies.filter(d => d.item.form === k).map(d => `${d.item.t}: ${d.labels.join('·')}`); const fm = (insp.formMemo || {})[k]; return [fm, ...ds].filter(Boolean).join(' / '); };
    const g = insp.form || {};
    return `<section class="rp fm">${insp.status !== 'done' ? '<div class="draftmark">작성 중(미완료)</div>' : ''}
      <h1>농촌인력중개센터(${pub ? '공공형' : '농촌형'}) 현장점검표</h1>
      <table><tr><th rowspan="5" style="width:9%">센터<br>현황</th><th style="width:16%">센터명</th><td colspan="3" class="l">관리번호 ${esc(insp.centerId)}</td></tr>
        <tr><th>담당자</th><td class="blank"></td><th style="width:14%">연락처</th><td class="blank"></td></tr>
        <tr><th>주 소</th><td colspan="3" class="blank"></td></tr>
        <tr><th>전담인력 수</th><td>${nf(p.staff)}명</td><th>채용형태</th><td>${esc(p.hire || '')} / 계약기간 ${esc(p.period || '')}</td></tr>
        <tr><th>예 산</th><td colspan="3" class="l">${nf(p.bud_total)}백만원 (국비 ${nf(p.bud_nat)}백만원, 지방비 ${nf(p.bud_loc)}백만원)</td></tr></table>
      <table><tr><th rowspan="${pub ? 5 : 4}" style="width:9%">추진<br>현황</th><th colspan="4" class="l">사업 추진현황 (기준일: ${esc(p.base || '')})</th></tr>
        ${pub ? `<tr><td colspan="4" class="l">배정 ${nf(p.alloc)}명 · 도입 ${nf(p.intro)}명 · 이탈 ${nf(p.escape)}명 · 근무종료 ${nf(p.ended)}명 · 근무현원 ${nf(p.current)}명</td></tr>` : ''}
        <tr><th style="width:16%">지원농가 수</th><td>${nf(p.farms)}개</td><th style="width:16%">중개실적(연인원)</th><td>${nf(p.match)}명</td></tr>
        <tr><th>인력수급 동향</th><td colspan="3" class="l">${esc(p.trend || '')}</td></tr><tr><th>인건비 동향</th><td colspan="3" class="l">${esc(p.wtrend || '')}</td></tr></table>
      <table><tr><th rowspan="12" style="width:9%">예산<br>집행<br>현황</th><th>항목</th><th>세부항목</th><th>예산계획(천원)</th><th>집행실적(천원)</th><th>집행률</th></tr>
        <tr><td colspan="2"><b>합 계</b></td><td class="r"><b>${b.all[0] ? E().won(b.all[0]) : ''}</b></td><td class="r"><b>${b.all[0] ? E().won(b.all[1]) : ''}</b></td><td><b>${b.rate != null ? b.rate + '%' : ''}</b></td></tr>${br}
        <tr><th colspan="2">집행부진 사유</th><td colspan="3" class="l">${esc(p.why || '')}</td></tr></table>
      <table><tr><th rowspan="2" style="width:9%">운영<br>현황</th>${pub
        ? `<th style="width:16%">영농작업반</th><td>${nf(p.teams)}개 반 (${nf(p.team_people)}명)</td><th style="width:14%">통역지원자</th><td>${esc(p.interp || '')} ${nf(p.interp_n) ? nf(p.interp_n) + '명' : ''}</td></tr><tr><td colspan="4"></td></tr>`
        : `<th style="width:16%">인력풀</th><td colspan="3" class="l">총 ${nf(p.pool_total)}명 (관내 ${nf(p.pool_in)}명, 관외 ${nf(p.pool_out)}명)</td></tr><tr><th>영농작업반</th><td colspan="3" class="l">${nf(p.teams)}개 반 (${nf(p.team_people)}명)</td></tr>`}</table>
      <table><tr><th colspan="3" class="l">기타 지도·점검 사항</th></tr><tr><th style="width:22%">구분</th><th style="width:36%">점검결과</th><th>비고</th></tr>
        ${rows.map(rw => `<tr><td class="l">${esc(rw.l)}</td><td class="nw">${C().grades.map(x => (g[rw.k] === x ? '■' : '□') + ' ' + x).join(' ')}</td><td class="l sm">${esc(memo(rw.k) || rw.note)}</td></tr>`).join('')}
        <tr><th>현장 의견/<br>지도·점검 사항</th><td colspan="2" class="l">${pre(insp.opinion || '')}</td></tr></table>
      <p class="signline">점검자 &nbsp; 소속 : <span class="ln"></span> 직위 : <span class="ln s"></span> 성명 : <span class="ln"></span> (인)</p>
      ${pub ? `<h3>[참고] 공공형 계절노동자 공동 숙식시설 점검표</h3><table><tr><th style="width:8%">구분</th><th>점검사항</th><th style="width:16%">점검결과</th><th style="width:24%">조치사항</th></tr>${C().dormChecklist.map((t, i) => { const d = (((insp.answers || {})['B6-01'] || {}).dorm || {}); return `<tr><td>${i + 1}</td><td class="l">${esc(t)}</td><td>${esc(d[i] || '')}</td><td></td></tr>`; }).join('')}</table>` : ''}
    </section>`;
  }

  function sign() {
    return `<table class="sign"><tr><th>점검자</th><td>소속:</td><td>직위:</td><td>성명:</td><td class="seal">(서명)</td></tr></table>`;
  }

  return { summary, fix, form };
})();
