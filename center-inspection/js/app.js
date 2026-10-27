/*
 * 화면 구성 (app.js)
 * 흐름: 점검관리 → 사전점검 → 현장점검 → 미흡 사유·시정 권고 → 결과·보고서 → 시정조치(후속관리) → 대시보드
 * 모든 기록은 기기 내부(IndexedDB)에만 저장되며 외부로 전송하지 않습니다.
 */
(function () {
  const E = CI.engine, CFG = CI.CONFIG, R = CI.report;
  const $ = s => document.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fmtDate = d => d ? String(d).replace(/^(\d{4})-(\d{2})-(\d{2})$/, (m, y, mo, da) => `${y}. ${+mo}. ${+da}.`) : '';
  const num = E.num;

  /* 개인정보 의심 형식(기본 패턴 검사 — 완전한 차단을 보장하지 않음) */
  const PII = [
    { l: '휴대전화번호', re: /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/ },
    { l: '전화번호', re: /\b0\d{1,2}-\d{3,4}-\d{4}\b/ },
    { l: '주민·외국인등록번호', re: /\b\d{6}[-\s]?[1-8]\d{6}\b/ },
    { l: '여권번호', re: /\b[A-Z]{1,2}\d{7,8}\b/ },
    { l: '이메일', re: /[\w.+-]+@[\w-]+\.[\w.]+/ },
    { l: '생년월일 형식', re: /\b(19|20)\d{2}[.\-/년 ]\s?\d{1,2}[.\-/월 ]\s?\d{1,2}일?\s?(생|출생)/ },
    { l: '사람 이름으로 보이는 표현', re: /[가-힣]{2,4}\s?(씨|님|대표님|이장님|팀장님|과장님)(?![가-힣])/ }
  ];
  const piiHits = t => PII.filter(p => p.re.test(String(t || ''))).map(p => p.l);
  const PII_NOTE = '개인정보(성명·연락처·주소·생년월일·주민/외국인등록번호·여권번호) 입력 금지';

  let store = null, settings = { inspectorId: '', team: '' }, list = [], cur = null, saveTimer = null;
  let newState = null, dashF = { year: '', type: '', center: '', status: '', act: '', sample: false }, fixF = '';

  /* ---------------- 공통 ---------------- */
  function toast(m) { const h = $('#toast'); h.innerHTML = `<div class="toast" role="status">${esc(m)}</div>`; clearTimeout(toast.t); toast.t = setTimeout(() => h.innerHTML = '', 2600); }
  async function reload() { list = (await store.list()) || []; list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))); }
  function go(h) { location.hash = h; }
  function render(html) { $('#view').innerHTML = html; }
  function netState() { const el = $('#net'); const on = navigator.onLine; el.className = 'net ' + (on ? 'on' : 'off'); el.textContent = on ? '온라인' : '오프라인 사용 중'; }
  window.addEventListener('online', netState); window.addEventListener('offline', netState);
  const typeName = t => (E.type(t) || {}).short || t;
  const statusName = s => s === 'done' ? '완료' : '작성 중';

  function ensureCases(insp) {
    insp.actions = insp.actions || {};
    E.items(insp.type).forEach(it => {
      const a = (insp.answers || {})[it.id];
      if (a && a.status === 'N' && !E.deficiencyGaps(a).length) {
        const ac = insp.actions[it.id] = insp.actions[it.id] || { status: '조치 전' };
        if (!ac.case) ac.case = `${insp.id}-${it.id}`;
      }
    });
  }
  function queueSave(redraw) {
    if (!cur) return;
    cur.updatedAt = new Date().toISOString(); ensureCases(cur);
    clearTimeout(saveTimer); const s = $('#saveState'); if (s) s.textContent = '저장 중…';
    saveTimer = setTimeout(async () => {
      try { await store.put(JSON.parse(JSON.stringify(cur))); const d = new Date(); const el = $('#saveState'); if (el) el.textContent = `자동 저장 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
      catch (e) { toast('기기에 저장하지 못했습니다. 저장 공간을 확인하세요.'); }
    }, 250);
    if (redraw) redraw();
  }
  function progress(insp) { const its = E.items(insp.type); const done = its.filter(i => E.itemDone((insp.answers || {})[i.id])).length; return { done, total: its.length }; }
  function ans(id) { cur.answers = cur.answers || {}; return cur.answers[id] || (cur.answers[id] = {}); }

  /* ---------------- 라우터 ---------------- */
  let navDepth = -1;
  function navBack() { $('#sheet').innerHTML = ''; if (navDepth > 0) { navDepth -= 2; history.back(); } else go('/'); }
  async function route() {
    const h = location.hash.replace(/^#\/?/, ''); const [p, a, b] = h.split('/');
    navDepth++; window.scrollTo(0, 0); $('#sheet').innerHTML = '';
    document.body.dataset.view = p || 'home';
    const home = !p; $('#backBtn').hidden = home; $('#homeBtn').hidden = home;
    try {
      if (p === 'manage') return viewManage();
      if (p === 'new') return viewNew(a);
      if (p === 'pick') return viewPick(a);
      if (p === 'pre') return viewPre(a);
      if (p === 'i') return viewInspect(a);
      if (p === 'fix') return viewFix(a);
      if (p === 'r') return viewResult(a);
      if (p === 'p') return viewPreview(a, b);
      if (p === 'dash') return viewDash();
      if (p === 'guide') return viewGuide(a || 'A');
      if (p === 'settings') return viewSettings();
      if (p === 'demo') { await startDemo(); history.replaceState(null, '', '#/'); return viewHome(); }
      if (p !== 'new') newState = null;
      return viewHome();
    } catch (err) { console.error(err); render(`<div class="alert crit">화면을 여는 중 오류가 발생했습니다. 처음 화면으로 돌아가 다시 시도하세요.</div>`); }
  }
  window.addEventListener('hashchange', route);
  async function load(id) { if (cur && cur.id === id) return cur; const r = await store.get(id); if (!r) { toast('기록을 찾을 수 없습니다'); go('/manage'); return null; } cur = r; return r; }

  function subnav(insp, active) {
    const pr = progress(insp);
    const tabs = [['pre', '사전점검'], ['i', '현장점검'], ['fix', '시정조치'], ['r', '결과·보고서']];
    return `<div class="sub">
      <div class="subrow"><b>${esc(E.code(insp))} <small class="muted">${esc(typeName(insp.type))}${insp.sub ? ' · ' + esc(insp.sub) : ''} · ${esc(fmtDate(insp.date))}</small></b><span class="sm muted" id="saveState">${insp.status === 'done' ? '완료된 점검' : '자동 저장'}</span></div>
      <div class="prog"><div class="bar"><i id="pbar" style="width:${Math.round(pr.done / pr.total * 100)}%"></i></div><span id="ptext">${pr.done}/${pr.total}</span></div>
      <div class="seg tabs4">${tabs.map(([k, l]) => `<a href="#/${k}/${insp.id}" role="button" aria-pressed="${active === k}">${l}</a>`).join('')}</div></div>`;
  }
  const locked = () => cur && cur.status === 'done';
  const lockNote = () => locked() ? `<div class="alert">완료된 점검입니다. 수정하려면 [결과·보고서]에서 '수정 재개'를 누르세요. 시정조치 상태는 계속 갱신할 수 있습니다.</div>` : '';

  /* ---------------- 처음 화면 ---------------- */
  async function viewHome() {
    cur = null; await reload();
    const onlySmp = list.length > 0 && list.every(i => i.sample), real = onlySmp ? list : list.filter(i => !i.sample);
    const drafts = real.filter(i => i.status !== 'done'), done = real.filter(i => i.status === 'done');
    const defs = real.reduce((t, i) => t + E.evaluate(i).N, 0);
    const openAct = real.reduce((t, i) => t + Object.values(i.actions || {}).filter(a => a.case && a.status !== '조치 완료').length, 0);
    render(`
      <section class="hero"><h2>농촌인력중개센터 운영실태 현장점검</h2><p>${esc(CFG.plan.title)} · 기준: ${esc(CFG.source.title)}</p></section>
      ${storeWarn()}
      ${demoBox()}
      <div class="tiles t5"><div class="tile"><div class="v">${real.length}</div><div class="l">전체 점검${onlySmp ? '(예시)' : ''}</div></div><div class="tile"><div class="v">${drafts.length}</div><div class="l">작성 중</div></div><div class="tile"><div class="v">${done.length}</div><div class="l">완료</div></div><div class="tile c"><div class="v">${defs}</div><div class="l">미흡 항목</div></div><div class="tile w"><div class="v">${openAct}</div><div class="l">조치 미완료</div></div></div>
      <nav class="menu">
        <a class="mi primary" href="#/manage"><b>1. 점검관리</b><span>새 점검 · 이어서 작성 · 복제 · 지난 점검</span></a>
        <a class="mi" href="#/pick/pre"><b>2. 사전점검</b><span>사전자료 접수 확인 · 사전제출 엑셀 불러오기</span></a>
        <a class="mi" href="#/pick/i"><b>3. 현장점검</b><span>항목별 결과 · 미흡 사유 · 시정 권고</span></a>
        <a class="mi" href="#/fix"><b>4. 시정조치</b><span>미흡 사항 모음 · 조치 상태 관리</span></a>
        <a class="mi" href="#/pick/r"><b>5. 결과·보고서</b><span>자동 검증 · 종합의견 · A4 PDF</span></a>
        <a class="mi" href="#/dash"><b>6. 대시보드</b><span>점검 현황 · 분야별 미흡 · 조치 현황</span></a>
        <a class="mi" href="#/guide/A"><b>점검기준</b><span>항목별 근거·확인서류·미흡 사유</span></a>
        <a class="mi" href="#/settings"><b>설정·백업</b><span>백업 내보내기·복원 · 예시 · 보안 안내</span></a>
      </nav>
      <div class="alert storenote"><b>기록은 이 기기에만 저장됩니다</b>브라우저 데이터 삭제, 앱 삭제, 기기 초기화 시 기록이 사라질 수 있습니다. 점검을 마치면 [설정·백업]에서 백업 파일을 내보내 원 내부 공유폴더에 보관하십시오.</div>`);
  }
  let demoSet = false;
  function demoAuto() { if (!demoSet && list.length && list.every(i => i.sample)) { dashF.sample = true; demoSet = true; } }
  async function startDemo() {
    for (const r of CI.samples()) await store.put(r);
    dashF.sample = true; await reload(); toast('시연용 예시 3건을 불러왔습니다');
  }
  function demoBox() {
    const smp = list.filter(i => i.sample);
    if (!smp.length) return `<section class="demo"><b>처음 써 보시나요?</b><p>가상 번호(충남-91 등)로 만든 예시 점검 3건(완료 2건, 작성 중 1건)을 불러와 전체 흐름을 바로 볼 수 있습니다. 실제 기록과 섞이지 않으며 언제든 삭제할 수 있습니다.</p><button class="btn primary" data-act="demo">시연 시작</button></section>`;
    const id = n => (smp.find(i => i.visit === String(n)) || {}).id;
    const a1 = id(91), a2 = id(92), b1 = id(93);
    const links = [
      a2 && [`#/i/${a2}`, '현장점검 입력', '작성 중인 농촌형 점검(전남-92)'],
      a1 && [`#/r/${a1}`, '자동 검증·결과', '완료된 농촌형 점검(충남-91)'],
      a1 && [`#/p/${a1}/sum`, '결과 보고서', 'A4 출력·PDF 저장 화면'],
      b1 && [`#/p/${b1}/form`, '현장점검표', '공공형 붙임 3 양식(경북-93)'],
      ['#/fix', '시정조치', '미흡 사례 조치 상태'],
      ['#/dash', '대시보드', '예시 포함 집계']].filter(Boolean);
    return `<section class="demo on"><div class="demohd"><b>시연 중 · 예시 ${smp.length}건</b><button class="btn sm" data-act="demoEnd">시연 종료(예시 삭제)</button></div>
      <div class="demogrid">${links.map(([h, t, d]) => `<a href="${h}"><b>${t}</b><span>${d}</span></a>`).join('')}</div></section>`;
  }
  function storeWarn() {
    if (store.kind === 'indexeddb') return '';
    return `<div class="alert crit">${store.kind === 'localstorage' ? '이 브라우저는 IndexedDB를 쓸 수 없어 임시 저장소(localStorage)를 사용합니다.' : '이 브라우저에서는 기록을 저장할 수 없습니다(창을 닫으면 삭제). 개인정보 보호 모드를 끄고 다시 여십시오.'}</div>`;
  }

  /* ---------------- 1. 점검관리 ---------------- */
  function card(i) {
    const pr = progress(i), r = E.evaluate(i);
    return `<div class="card">
      <div class="ct"><b>${esc(E.code(i))}</b><span class="tag">${esc(typeName(i.type))}</span><span class="tag ${i.status === 'done' ? 'ok' : ''}">${statusName(i.status)}</span>${i.sample ? '<span class="tag">예시</span>' : ''}${r.N ? `<span class="tag neg">미흡 ${r.N}</span>` : ''}</div>
      <div class="cm">${esc(E.period(i))} · ${esc(fmtDate(i.date))} 점검</div>
      <div class="prog"><div class="bar"><i style="width:${Math.round(pr.done / pr.total * 100)}%"></i></div><span>${pr.done}/${pr.total}</span></div>
      <div class="row"><a class="btn sm primary" href="#/${i.status === 'done' ? 'r' : 'i'}/${i.id}">${i.status === 'done' ? '결과 보기' : '이어서 작성'}</a><a class="btn sm" href="#/pre/${i.id}">사전점검</a><button class="btn sm" data-act="dup" data-id="${i.id}">후속 점검</button><button class="btn sm danger" data-act="askDel" data-id="${i.id}">삭제</button></div></div>`;
  }
  async function viewManage() {
    cur = null; newState = null; await reload();
    render(`<h2 class="pt">점검관리</h2>
      <a class="btn primary block" href="#/new">+ 새 점검</a>
      ${list.length ? `<div class="list">${list.map(card).join('')}</div>` : '<div class="empty">저장된 점검이 없습니다. [+ 새 점검]으로 시작하세요.</div>'}`);
  }
  function viewNew(fromId) {
    if (!newState) newState = { type: 'A', sub: '시군형', op: '지자체', region: '', visit: '', inspectorId: settings.inspectorId || '', date: today(), from: fromId || '' };
    const s = newState; const T = E.type(s.type);
    const preview = s.region && s.visit ? `${s.region}-${String(s.visit).padStart(2, '0')}` : '';
    render(`<h2 class="pt">새 점검 ${s.from ? '<small>(후속 점검)</small>' : ''}</h2>
      <section class="panel"><div class="lbl">점검 유형</div><div class="seg big">${['A', 'B'].map(t => `<button data-act="nType" data-v="${t}" aria-pressed="${s.type === t}" ${s.from ? 'disabled' : ''}>${esc(E.type(t).name)}</button>`).join('')}</div>
        ${T.subs.length ? `<div class="lbl">세부 유형</div><div class="seg">${T.subs.map(x => `<button data-act="nSub" data-v="${x}" aria-pressed="${s.sub === x}">${x}</button>`).join('')}</div>` : ''}
        <div class="lbl">운영기관 구분</div><div class="seg">${['지자체', '농협', '기타'].map(x => `<button data-act="nOp" data-v="${x}" aria-pressed="${s.op === x}">${x}</button>`).join('')}</div></section>
      <section class="panel"><div class="fgrid">
        <label class="fi" for="n-region"><span>지역(시도)</span><select id="n-region" data-new="region" ${s.from ? 'disabled' : ''}><option value="">선택</option>${E.REGIONS.map(([k, n]) => `<option ${s.region === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="fi" for="n-visit"><span>방문번호 <small>일정표 순번</small></span><input type="text" id="n-visit" data-new="visit" value="${esc(s.visit)}" inputmode="numeric" placeholder="1" maxlength="2" ${s.from ? 'disabled' : ''}></label>
        <label class="fi" for="n-date"><span>점검일</span><input type="date" id="n-date" data-new="date" value="${esc(s.date)}"></label></div>
        <div class="codeprev" id="n-prev">${preview ? `점검 코드 <b>${esc(preview)}</b> · ${esc(E.period(s))}` : '지역과 방문번호를 넣으면 점검 코드가 만들어집니다(예: 충남-01)'}</div>
        <div class="hint">방문번호는 점검계획 일정표의 시도별 순번을 씁니다. 실원끼리 같은 번호를 쓰지 않도록 일정표에서 미리 정합니다. 센터명·사람 이름은 입력하지 않습니다.</div></section>
      <button class="btn primary block" data-act="nCreate">점검 만들기</button>`);
  }
  async function viewPick(target) {
    cur = null; await reload();
    const name = { pre: '사전점검', i: '현장점검', r: '결과·보고서' }[target] || '점검';
    const xs = target === 'r' ? list : list.filter(i => i.status !== 'done' || target !== 'i');
    render(`<h2 class="pt">${name} <small>점검을 선택하세요</small></h2>
      ${xs.length ? `<div class="list">${xs.map(i => `<a class="card" href="#/${target}/${i.id}"><div class="ct"><b>${esc(E.code(i))}</b><span class="tag">${esc(typeName(i.type))}</span><span class="tag ${i.status === 'done' ? 'ok' : ''}">${statusName(i.status)}</span>${i.sample ? '<span class="tag">예시</span>' : ''}</div><div class="cm">${esc(E.period(i))} · ${esc(fmtDate(i.date))} 점검</div></a>`).join('')}</div>` : '<div class="empty">해당하는 점검이 없습니다.</div>'}
      <a class="btn primary block" href="#/new">+ 새 점검</a>`);
  }

  /* ---------------- 2. 사전점검 ---------------- */
  const PRE_FIELDS = {
    center: t => [['staff', '전담인력 수', '명'], ...(t === 'A' ? [['support', '운영 지원인력 수', '명']] : []), ['period', '계약기간', '', 'text'], ['bud_total', '예산', '백만원'], ['bud_nat', '국비', '백만원'], ['bud_loc', '지방비', '백만원']],
    progress: t => [['base', '기준일', '', 'text'], ['farms', '지원농가 수', '개'], ...(t === 'B' ? [['alloc', '배정인원', '명'], ['intro', '도입인원', '명'], ['escape', '이탈인원', '명'], ['ended', '근무종료', '명'], ['current', '근무현원', '명']] : []), ['match', '중개실적(연인원)', '명'], ['trend', '인력수급 동향', '', 'text'], ['wtrend', '인건비 동향', '', 'text']],
    ops: t => [...(t === 'A' ? [['pool_total', '인력풀 총', '명'], ['pool_in', '인력풀 관내', '명'], ['pool_out', '인력풀 관외', '명']] : []), ['teams', '영농작업반 수', '개 반'], ['team_people', '작업반 인원', '명'], ...(t === 'B' ? [['interp_n', '통역지원자 인원', '명']] : [])]
  };
  function preInput([k, l, u, type]) {
    const v = (cur.pre || {})[k]; const id = 'p-' + k;
    return `<label class="fi" for="${id}"><span>${esc(l)}${u ? ` <small>(${esc(u)})</small>` : ''}</span><input type="text" ${type === 'text' ? '' : 'inputmode="decimal"'} id="${id}" data-pre="${k}" data-ptype="${type || 'num'}" value="${esc(v == null ? '' : v)}" ${locked() ? 'disabled' : ''}></label>`;
  }
  async function viewPre(id) {
    if (!(await load(id))) return;
    const t = cur.type, docs = CFG.docs[t], dst = cur.docs || {};
    const miss = docs.filter(d => dst[d.id] === 'M'), none = docs.filter(d => !dst[d.id]);
    const preRules = E.validate(cur).filter(x => ['STAFF', 'TEAM', 'RATIO', 'MATCH', 'LEADPER', 'PUBRATE'].includes(x.rule));
    const b = E.budget(cur.pre);
    const budRows = E.BROWS.map(([k, g, n]) => `<tr><td class="l">${g === '센터운영비' ? '센터' : '인력'} · ${n}</td><td><input type="text" inputmode="numeric" data-pre="p_${k}" value="${esc((cur.pre || {})['p_' + k] ?? '')}" aria-label="${n} 예산계획" ${locked() ? 'disabled' : ''}></td><td><input type="text" inputmode="numeric" data-pre="e_${k}" value="${esc((cur.pre || {})['e_' + k] ?? '')}" aria-label="${n} 집행실적" ${locked() ? 'disabled' : ''}></td></tr>`).join('');
    render(`${subnav(cur, 'pre')}${lockNote()}
      <section class="panel"><div class="lbl">사전제출 자료 불러오기 <small>지방정부 제출 엑셀(docs/사전제출양식.xlsx 양식)</small></div>
        <label class="btn" for="prexlsx">엑셀 파일 선택(.xlsx)</label><input id="prexlsx" type="file" accept=".xlsx" data-prexlsx="1" hidden ${locked() ? 'disabled' : ''}>
        <div class="hint">파일은 이 기기 안에서만 읽습니다. 센터명·담당자 등 양식에 없는 칸은 불러오지 않습니다.</div></section>
      <section class="panel"><div class="lbl">사전자료 접수 확인 <small>접수 ${docs.filter(d => dst[d.id] === 'R').length} · 미제출 ${miss.length} · 미확인 ${none.length}</small></div>
        <div class="list">${docs.map(d => `<div class="docrow"><div><b>${esc(d.l)}</b><span class="src"> ${esc(d.ref.startsWith('p') ? CFG.source.short + ' ' + d.ref : d.ref)}</span></div>
          <div class="seg">${[['R', '접수'], ['M', '미제출'], ['NA', '해당없음']].map(([v, l]) => `<button data-act="doc" data-doc="${d.id}" data-v="${v}" aria-pressed="${dst[d.id] === v}" ${locked() ? 'disabled' : ''}>${l}</button>`).join('')}</div></div>`).join('')}</div>
        ${miss.length ? `<div class="alert warn">미제출 서류는 현장에서 해당 항목 확인 시 경고로 표시됩니다: ${miss.map(d => esc(d.l)).join(', ')}</div>` : ''}</section>
      <section class="panel"><div class="lbl">센터 현황</div><div class="fgrid">${PRE_FIELDS.center(t).map(preInput).join('')}</div>
        <div class="lbl">채용형태</div><div class="seg">${['계약직', '내부직원'].map(x => `<button data-act="preSeg" data-k="hire" data-v="${x}" aria-pressed="${(cur.pre || {}).hire === x}" ${locked() ? 'disabled' : ''}>${x}</button>`).join('')}</div></section>
      <section class="panel"><div class="lbl">사업 추진현황</div><div class="fgrid">${PRE_FIELDS.progress(t).map(preInput).join('')}</div></section>
      <section class="panel"><div class="lbl">예산 집행현황 <small>천원</small></div>
        <div class="tw"><table class="tb budtb"><tr><th class="l">세부항목</th><th>예산계획</th><th>집행실적</th></tr>${budRows}
          <tr><th class="l">합계</th><th>${b.all[0] ? E.won(b.all[0]) : '-'}</th><th>${b.all[0] ? E.won(b.all[1]) : '-'}</th></tr></table></div>
        <div class="hint" id="budsum">${b.all[0] ? `집행률 ${b.rate}% · 센터운영비 편성 ${b.ratio}%` : '세부항목 예산을 입력하면 집행률과 편성비율이 자동 계산됩니다.'}</div>
        <label class="fi" for="p-why"><span>집행부진 사유</span><input type="text" id="p-why" data-pre="why" data-ptype="text" value="${esc((cur.pre || {}).why || '')}" ${locked() ? 'disabled' : ''}></label></section>
      <section class="panel"><div class="lbl">운영현황</div><div class="fgrid">${PRE_FIELDS.ops(t).map(preInput).join('')}</div>
        ${t === 'B' ? `<div class="lbl">통역지원자</div><div class="seg">${['있음', '없음'].map(x => `<button data-act="preSeg" data-k="interp" data-v="${x}" aria-pressed="${(cur.pre || {}).interp === x}" ${locked() ? 'disabled' : ''}>${x}</button>`).join('')}</div>` : ''}</section>
      <section class="panel" id="prerules"><div class="lbl">사전 검증 결과</div>${warnList(preRules) || '<div class="hint">시행지침 수치 기준과 다른 값이 없습니다.</div>'}</section>
      <div class="bottombar"><a class="btn" href="#/manage">← 점검관리</a><span class="grow"></span><a class="btn primary" href="#/i/${cur.id}">현장점검 →</a></div>`);
  }
  function warnList(ws) {
    const K = { violation: ['기준 위반', 'neg'], inconsistent: ['판정 불일치', 'neg'], verify: ['확인 필요', 'unv'], incomplete: ['작성 미완료', 'unv'], missing: ['미입력', ''], docs: ['서류 미비', 'unv'] };
    return ws.map(w => `<div class="vw ${K[w.kind][1]}"><div><span class="vk ${K[w.kind][1]}">${K[w.kind][0]}</span><b>${esc(w.item.id)} ${esc(w.item.t)}</b></div><div>${esc(w.text)}</div><div class="src">근거: ${esc(w.ref)} · 후속: ${esc(w.act)}</div></div>`).join('');
  }

  /* ---------------- 3. 현장점검 ---------------- */
  async function viewInspect(id) {
    if (!(await load(id))) return;
    const T = E.type(cur.type);
    const prior = (cur.prior || []).length ? `<section class="panel warnp"><div class="lbl">지난 점검 미흡 사항 <small>후속 점검 확인</small></div><ul class="ul">${cur.prior.map(p => `<li>${esc(p.id)} ${esc(p.t)} — ${esc(p.status || '조치 전')}${p.case ? ` <span class="src">${esc(p.case)}</span>` : ''}</li>`).join('')}</ul></section>` : '';
    render(`${subnav(cur, 'i')}${lockNote()}${prior}
      ${T.categories.map(cat => { const its = cat.items; const d = its.filter(i => E.itemDone((cur.answers || {})[i.id])).length;
        return `<details class="catsec" open><summary class="cath">${esc(cat.name)} <small>${d}/${its.length}</small></summary>
          ${locked() ? '' : `<button class="btn sm" data-act="allC" data-cat="${cat.id}">미응답 항목 모두 적정</button>`}
          ${its.map(it => itemCard(Object.assign({ cat: cat.id }, it))).join('')}</details>`; }).join('')}
      <div class="bottombar"><a class="btn" href="#/pre/${cur.id}">← 사전점검</a><span class="grow"></span><a class="btn primary" href="#/r/${cur.id}">결과·보고서 →</a></div>`);
  }
  function chkInput(it, c, a) {
    const v = (a.checks || {})[c.k];
    if (c.type === 'seg') return `<div class="fi"><span>${esc(c.l)}</span><div class="seg">${c.o.map(o => `<button data-act="chkSeg" data-item="${it.id}" data-k="${c.k}" data-v="${esc(o)}" aria-pressed="${v === o}" ${locked() ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div></div>`;
    return `<label class="fi" for="c-${it.id}-${c.k}"><span>${esc(c.l)}${c.u ? ` <small>(${esc(c.u)})</small>` : ''}</span><input type="text" inputmode="decimal" id="c-${it.id}-${c.k}" data-chk="${c.k}" data-item="${it.id}" value="${esc(v == null ? '' : v)}" ${locked() ? 'disabled' : ''}></label>`;
  }
  function itemCard(it) {
    const a = (cur.answers || {})[it.id] || {}; const st = a.status || ''; const dst = cur.docs || {};
    const docChips = (it.docs || []).map(d => { const doc = CFG.docs[cur.type].find(x => x.id === d); const s = dst[d]; return doc ? `<span class="dchip ${s === 'M' ? 'neg' : s === 'R' ? 'ok' : ''}">${esc(doc.l)}${s === 'M' ? ' · 미제출' : s === 'R' ? ' · 접수' : ''}</span>` : ''; }).join('');
    const rf = E.validate(cur).filter(x => x.item.id === it.id && ['violation', 'verify', 'inconsistent', 'docs'].includes(x.kind));
    let body = '';
    if (it.checks) body += `<div class="fgrid">${it.checks.map(c => chkInput(it, c, a)).join('')}</div>`;
    if (it.dorm) body += `<details class="panel sm-panel"><summary>숙소 참고 점검표 11개 항목 (부적합만 표시)</summary>${CFG.dormChecklist.map((t, i) => `<div class="docrow"><div>${i + 1}. ${esc(t)}</div>${i === 1 ? `<div class="seg">${['아파트', '단독', '다세대', '마을회관', '기타'].map(o => `<button data-act="dorm" data-item="${it.id}" data-i="1" data-v="${o}" aria-pressed="${(a.dorm || {})[1] === o}" ${locked() ? 'disabled' : ''}>${o}</button>`).join('')}</div>` : `<div class="seg">${['적합', '부적합'].map(o => `<button data-act="dorm" data-item="${it.id}" data-i="${i}" data-v="${o}" aria-pressed="${(a.dorm || {})[i] === o}" ${locked() ? 'disabled' : ''}>${o}</button>`).join('')}</div>`}</div>`).join('')}</details>`;
    if (rf.length) body += `<div class="autochk">${warnList(rf)}</div>`;
    if (st === 'N') {
      const gaps = E.deficiencyGaps(a);
      body += `<div class="rs"><div class="rsh">미흡 사유 <small>복수 선택 · 운영 참고 분류(법령 위반 판정 아님)</small></div>
        ${E.reasons(it).map(r => `<label class="ck"><input type="checkbox" data-reason="${it.id}" value="${r.c}" ${(a.reasons || []).includes(r.c) ? 'checked' : ''} ${locked() ? 'disabled' : ''}><span>${esc(r.l)}</span></label>`).join('')}
        ${(a.reasons || []).includes('ETC') ? `<label class="fi"><span>기타 사유 <em class="reqtag">필수</em></span><input type="text" data-ans="etc" data-item="${it.id}" value="${esc(a.etc || '')}" maxlength="200" ${locked() ? 'disabled' : ''}><span class="pii" hidden></span></label>` : ''}
        <label class="fi"><span>현장 확인 내용 <em class="reqtag">필수</em> <small>${PII_NOTE}</small></span><textarea rows="2" data-ans="note" data-item="${it.id}" maxlength="600" ${locked() ? 'disabled' : ''}>${esc(a.note || '')}</textarea><span class="pii" hidden></span></label>
        <label class="fi"><span>시정 권고 <small>선택한 사유로 자동 작성 · 수정 가능</small></span><textarea rows="3" data-ans="rec" data-item="${it.id}" maxlength="800" ${locked() ? 'disabled' : ''}>${esc(a.rec || '')}</textarea><span class="pii" hidden></span></label>
        ${locked() ? '' : `<button class="btn sm" data-act="regen" data-item="${it.id}">권고 문안 다시 만들기</button>`}
        <div class="sm ${gaps.length ? 'neg' : 'okc'}">${gaps.length ? '작성 필요: ' + gaps.join(', ') : '미흡 상세 작성 완료'}${it.fu ? ` · 후속 조치: ${esc(it.fu)}` : ''}</div></div>`;
    } else if (st === 'U') {
      body += `<label class="fi"><span>추가로 확인할 내용 <small>${PII_NOTE}</small></span><textarea rows="2" data-ans="note" data-item="${it.id}" maxlength="400" ${locked() ? 'disabled' : ''}>${esc(a.note || '')}</textarea><span class="pii" hidden></span></label>`;
    } else if (st && (a.reasons || []).length) {
      body += `<div class="hint">이전에 입력한 미흡 상세는 보관되어 있으며, '미흡'으로 바꾸면 다시 표시됩니다(보고서에는 포함되지 않음).</div>`;
    }
    return `<article class="item ${st === 'N' ? 'is-n' : st === 'U' ? 'is-u' : st === 'C' ? 'is-c' : st === 'NA' ? 'is-na' : ''}" id="it-${it.id}">
      <div class="iq"><div class="qt"><span class="qid">${esc(it.id)}</span><b>${esc(it.t)}</b>${it.crit ? ' <span class="crit">중대</span>' : ''}${it.confirm ? ' <span class="cfm">행정 확인 필요</span>' : ''}
        <small>${esc(it.q)}</small>
        <div class="crit-c"><b>확인 기준</b> ${esc(it.c)}</div>
        <div class="src">근거: ${esc(CFG.source.short)} ${esc(it.ref)}${it.confirm ? ` · 행정 확인 필요: ${esc(it.confirm)}` : ''}</div>
        ${docChips ? `<div class="dchips">${docChips}</div>` : ''}
        <button class="gbtn" data-act="guide" data-item="${it.id}">기준 자세히</button></div>
        <div class="opts">${CFG.results.map(o => `<button data-act="st" data-item="${it.id}" data-v="${o.v}" class="o-${o.v}" aria-pressed="${st === o.v}" ${locked() ? 'disabled' : ''}>${esc(o.l)}</button>`).join('')}</div></div>
      ${body}</article>`;
  }
  function redrawItem(id) {
    const it = Object.assign({}, E.item(cur.type, id)); const el = document.getElementById('it-' + id); if (!el) return;
    const tmp = document.createElement('div'); tmp.innerHTML = itemCard(it); el.replaceWith(tmp.firstElementChild);
    const pr = progress(cur); const pb = $('#pbar'), pt = $('#ptext'); if (pb) pb.style.width = Math.round(pr.done / pr.total * 100) + '%'; if (pt) pt.textContent = `${pr.done}/${pr.total}`;
  }
  function openGuide(id) {
    const t = cur ? cur.type : (E.item('A', id) ? 'A' : 'B'); const it = E.item(t, id);
    $('#sheet').innerHTML = `<div class="sheetbg" data-act="closeSheet"></div><div class="sheetbox" role="dialog" aria-modal="true" aria-label="점검기준">
      <div class="shh"><b>${esc(it.id)} ${esc(it.t)}</b><button class="x" data-act="closeSheet">닫기</button></div><div class="shb">${guideHTML(it, t)}</div></div>`;
  }
  function guideHTML(it, t) {
    const docs = (it.docs || []).map(d => (CFG.docs[t].find(x => x.id === d) || {}).l).filter(Boolean);
    const rules = (it.rules || []).map(r => CFG.rules[r]).filter(Boolean);
    return `<dl class="gd"><dt>점검 내용</dt><dd>${esc(it.q)}</dd>
      <dt>확인 기준</dt><dd>${esc(it.c)}<br><small>근거: ${esc(CFG.source.title)} ${esc(it.ref)}</small></dd>
      ${it.confirm ? `<dt>행정 확인 필요 <small>세부 기준 없음</small></dt><dd>${esc(it.confirm)}</dd>` : ''}
      <dt>확인 서류</dt><dd>${docs.length ? `<ul>${docs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '현장 확인'}</dd>
      ${rules.length ? `<dt>자동 검증 기준</dt><dd><ul>${rules.map(r => `<li>${esc(r.l)}: ${r.std.map(k => esc(E.stdText(k))).join(' / ') || esc(r.ref || '')} <small>(${r.kind === 'violation' ? '기준 위반 판단' : '확인 필요'})</small></li>`).join('')}</ul></dd>` : ''}
      <dt>미흡 사유 → 시정 권고 <small>운영 참고</small></dt><dd><ul>${(it.reasons || []).map(r => `<li>${esc(r.l)} → ${esc(r.r)}</li>`).join('')}<li>기타 → 기타 사유 확인 후 시정 조치</li></ul></dd>
      <dt>후속 조치</dt><dd>${esc(it.fu || '')}</dd></dl>`;
  }

  /* ---------------- 4. 시정조치 ---------------- */
  async function viewFix(id) {
    await reload();
    let recs;
    if (id) { if (!(await load(id))) return; recs = [cur]; } else { cur = null; demoAuto(); recs = list.filter(i => !i.sample || dashF.sample); }
    const rows = [];
    recs.forEach(insp => { ensureCases(insp); E.evaluate(insp).deficiencies.forEach(d => { const ac = (insp.actions || {})[d.item.id] || { status: '조치 전' }; rows.push({ insp, d, ac }); }); });
    const shown = rows.filter(x => !fixF || (x.ac.status || '조치 전') === fixF);
    const cnt = s => rows.filter(x => (x.ac.status || '조치 전') === s).length;
    render(`${id ? subnav(cur, 'fix') : '<h2 class="pt">시정조치 관리 <small>전체 점검의 미흡 사항</small></h2>'}
      <div class="tiles">${CFG.actionStatus.map(s => `<div class="tile ${s === '조치 완료' ? '' : s === '재확인 필요' ? 'c' : 'w'}"><div class="v">${cnt(s)}</div><div class="l">${s}</div></div>`).join('')}</div>
      <div class="seg">${['', ...CFG.actionStatus].map(s => `<button data-act="fixF" data-v="${s}" aria-pressed="${fixF === s}">${s || '전체'}</button>`).join('')}</div>
      ${!id ? `<label class="ck"><input type="checkbox" data-act2="fixSample" ${dashF.sample ? 'checked' : ''}><span>예시 기록 포함</span></label>` : ''}
      ${shown.length ? shown.map(({ insp, d, ac }) => `<article class="item is-n">
        <div class="ct"><span class="qid">${esc(E.code(insp))}</span><b>${esc(d.item.id)} ${esc(d.item.t)}</b>${d.item.crit ? ' <span class="crit">중대</span>' : ''}</div>
        <div class="cm">${esc(E.period(insp))} · ${esc(fmtDate(insp.date))} 점검${insp.sample ? ' · 예시' : ''}${ac.case ? '' : ' · 미흡 상세 작성 후 조치 관리'}</div>
        <div><b class="sm">미흡 사유</b> ${esc(d.labels.join(', ') || '-')}${d.gaps.length ? ` <span class="neg sm">(작성 필요: ${esc(d.gaps.join(', '))})</span>` : ''}</div>
        <div class="sm"><b>현장 확인</b> ${esc(d.a.note || '-')}</div>
        <div class="gen"><div><span class="gl r">권고</span><span class="pre-inline">${esc(d.a.rec || '-')}</span></div><div><span class="gl v">후속</span>${esc(d.item.fu || '')}</div></div>
        ${ac.case ? `<div class="seg">${CFG.actionStatus.map(s => `<button data-act="acst" data-insp="${insp.id}" data-item="${d.item.id}" data-v="${s}" aria-pressed="${(ac.status || '조치 전') === s}">${s}</button>`).join('')}</div>
        <div class="fgrid"><label class="fi"><span>조치 완료일</span><input type="date" data-acdate="${d.item.id}" data-insp="${insp.id}" value="${esc(ac.date || '')}"></label>
          <label class="fi"><span>조치 확인 메모 <small>${PII_NOTE}</small></span><input type="text" data-acmemo="${d.item.id}" data-insp="${insp.id}" value="${esc(ac.memo || '')}" maxlength="200"><span class="pii" hidden></span></label></div>` : '<div class="hint">미흡 상세(사유·현장 확인·권고)를 모두 작성하면 사례번호가 부여되고 조치 상태를 관리할 수 있습니다.</div>'}
      </article>`).join('') : '<div class="empty">해당하는 미흡 사항이 없습니다.</div>'}
      ${id ? `<div class="bottombar"><a class="btn" href="#/i/${cur.id}">← 현장점검</a><span class="grow"></span><a class="btn primary" href="#/p/${cur.id}/fix">시정조치 요청서 PDF</a></div>` : ''}`);
  }

  /* ---------------- 5. 결과·보고서 ---------------- */
  async function viewResult(id) {
    if (!(await load(id))) return;
    const r = E.evaluate(cur), v = E.validate(cur);
    const grp = k => v.filter(x => x.kind === k);
    const rowsF = CFG.formRows[cur.type];
    const canEdit = !locked();
    render(`${subnav(cur, 'r')}
      ${cur.status === 'done' ? `<div class="alert">완료된 점검입니다(${esc(fmtDate((cur.completedAt || '').slice(0, 10)))}). <button class="btn sm" data-act="reopen">수정 재개</button></div>` : ''}
      <div class="tiles t5"><div class="tile"><div class="v">${r.C}</div><div class="l">적정</div></div><div class="tile c"><div class="v">${r.N}</div><div class="l">미흡</div></div><div class="tile w"><div class="v">${r.U}</div><div class="l">확인필요</div></div><div class="tile"><div class="v">${r.NA}</div><div class="l">해당없음</div></div><div class="tile"><div class="v">${r.unanswered.length}</div><div class="l">미입력</div></div></div>
      <section class="panel"><div class="lbl">자동 검증 결과</div>
        ${['violation', 'inconsistent', 'incomplete', 'docs', 'verify', 'missing'].map(k => { const xs = grp(k); if (!xs.length) return '';
          const name = { violation: '기준 위반(수치 확인)·중대 사항', inconsistent: '판정 불일치', incomplete: '미흡 상세 작성 미완료', docs: '관련 서류 미비', verify: '사람 확인 필요', missing: '미입력 항목' }[k];
          return `<details ${['violation', 'inconsistent', 'incomplete'].includes(k) ? 'open' : ''}><summary><b>${name}</b> ${xs.length}건</summary>${warnList(xs)}</details>`; }).join('') || '<div class="hint">검증에서 걸린 항목이 없습니다.</div>'}
        <div class="hint">'기준 위반'은 시행지침에 명시된 수치와 입력값이 다르다는 뜻이며, 미흡 여부는 점검자가 증빙을 확인해 판단합니다.</div></section>
      <section class="panel"><div class="lbl">점검표(${esc(E.type(cur.type).form)}) 기타 지도·점검 사항 <small>제안은 항목 결과로 계산 · 최종 선택은 점검자</small></div>
        ${rowsF.map(rw => { const sg = rw.k === 'will' ? '' : E.formSuggest(cur, rw.k); const g = (cur.form || {})[rw.k] || '';
          return `<div class="frow"><div><b>${esc(rw.l)}</b>${sg ? ` <span class="sm muted">제안: ${sg}</span>` : rw.k === 'will' ? ' <span class="sm muted">점검자 판단</span>' : ''}</div>
            <div class="seg">${CFG.grades.map(x => `<button data-act="grade" data-k="${rw.k}" data-v="${x}" aria-pressed="${g === x}" ${canEdit ? '' : 'disabled'}>${x}</button>`).join('')}</div></div>`; }).join('')}</section>
      <section class="panel"><div class="lbl">종합 의견 <small>${PII_NOTE}</small></div>
        <textarea rows="6" data-op="1" maxlength="2000" ${canEdit ? '' : 'disabled'}>${esc(cur.opinion || '')}</textarea><span class="pii" hidden></span>
        ${canEdit ? '<button class="btn sm" data-act="opDraft">입력 결과로 초안 만들기</button>' : ''}</section>
      <section class="panel"><div class="lbl">보고서 · PDF</div>
        <div class="row"><a class="btn" href="#/p/${cur.id}/sum">점검 결과 보고서</a><a class="btn" href="#/p/${cur.id}/fix">시정조치 요청서</a><a class="btn" href="#/p/${cur.id}/form">현장점검표(${esc(E.type(cur.type).form)})</a></div>
        <div class="hint">PDF는 브라우저 인쇄 기능의 'PDF로 저장'으로 만듭니다(파일이 외부로 전송되지 않음). 센터명·담당자·점검자 성명은 출력 후 수기로 적습니다.</div>
        <button class="btn" data-act="exportOne">이 점검 백업 파일(.json) 내보내기</button></section>
      ${canEdit ? `<button class="btn primary block" data-act="complete">점검 완료</button>` : ''}
      <div class="bottombar"><a class="btn" href="#/i/${cur.id}">← 현장점검</a><span class="grow"></span><a class="btn" href="#/fix/${cur.id}">시정조치 →</a></div>`);
  }
  async function viewPreview(id, kind) {
    if (!(await load(id))) return;
    const html = kind === 'fix' ? R.fix(cur) : kind === 'form' ? R.form(cur) : R.summary(cur);
    const name = { sum: '점검 결과 보고서', fix: '시정조치 요청서', form: '현장점검표' }[kind] || '보고서';
    const hits = piiScan(cur);
    render(`<div class="pvbar noprint"><button class="btn primary" data-act="print">인쇄 · PDF 저장</button><span class="grow"></span><a class="btn" href="#/r/${cur.id}">← 결과·보고서</a></div>
      ${hits.length ? `<div class="alert warn noprint">개인정보로 보이는 형식이 있습니다(${esc(hits.map(h => h.where + ': ' + h.l).join(' / '))}). 출력 전 해당 내용을 확인하세요.</div>` : ''}
      <div class="hint noprint">${esc(name)} 미리보기 · A4. iPhone·iPad는 인쇄 화면에서 미리보기를 두 손가락으로 벌리거나 공유 → 'PDF로 저장'을 선택합니다.</div>
      <div class="paper">${html}</div>`);
    document.body.dataset.view = 'p';
  }

  /* ---------------- 6. 대시보드 ---------------- */
  async function viewDash() {
    cur = null; await reload(); demoAuto();
    const yearOf = i => String(i.date || '').slice(0, 4);
    const base = list.filter(i => dashF.sample || !i.sample);
    const years = [...new Set(base.map(yearOf))].filter(Boolean).sort().reverse(), centers = [...new Set(base.map(i => E.code(i).replace(/ \(.*$/, '')))].sort();
    const xs = base.filter(i => (!dashF.year || yearOf(i) === dashF.year) && (!dashF.type || i.type === dashF.type) && (!dashF.center || E.code(i).replace(/ \(.*$/, '') === dashF.center) && (!dashF.status || i.status === dashF.status));
    const evs = xs.map(i => ({ i, r: E.evaluate(i) }));
    const defs = []; evs.forEach(({ i, r }) => r.deficiencies.forEach(d => defs.push({ i, d, ac: (i.actions || {})[d.item.id] || { status: '조치 전' } })));
    const defsF = defs.filter(x => !dashF.act || (x.ac.status || '조치 전') === dashF.act);
    const byCat = {}; defsF.forEach(x => { const k = `${typeName(x.i.type)} · ${x.d.item.catName}`; byCat[k] = (byCat[k] || 0) + 1; });
    const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]); const maxC = catRows.length ? catRows[0][1] : 1;
    const acts = CFG.actionStatus.map(s => [s, defsF.filter(x => (x.ac.status || '조치 전') === s).length]);
    const hist = {}; xs.forEach(i => { const k = E.code(i).replace(/ \(.*$/, ''); (hist[k] = hist[k] || []).push(i); });
    const sel = (k, opts, label) => `<label class="fi"><span>${label}</span><select data-dash="${k}"><option value="">전체</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${dashF[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    render(`<h2 class="pt">대시보드 <small>이 기기에 저장·복원된 실제 기록 기준</small></h2>
      <section class="panel"><div class="fgrid">${sel('year', years.map(y => [y, y + '년']), '점검 연도')}${sel('type', [['A', '농촌형'], ['B', '공공형']], '점검 유형')}${sel('center', centers.map(c => [c, c]), '점검 코드')}${sel('status', [['draft', '작성 중'], ['done', '완료']], '점검 상태')}${sel('act', CFG.actionStatus.map(s => [s, s]), '조치 상태')}</div>
        <label class="ck"><input type="checkbox" data-act2="dashSample" ${dashF.sample ? 'checked' : ''}><span>예시 기록 포함</span></label>
        <div class="hint">다른 실원의 기록은 [설정·백업]에서 백업 파일을 불러오면 함께 집계됩니다.</div></section>
      ${xs.length ? `
      <div class="tiles t5"><div class="tile"><div class="v">${xs.length}</div><div class="l">전체 점검</div></div><div class="tile"><div class="v">${xs.filter(i => i.status === 'done').length}</div><div class="l">완료</div></div><div class="tile"><div class="v">${xs.filter(i => i.status !== 'done').length}</div><div class="l">작성 중</div></div><div class="tile c"><div class="v">${defsF.length}</div><div class="l">미흡 항목</div></div><div class="tile w"><div class="v">${defsF.filter(x => x.ac.status !== '조치 완료').length}</div><div class="l">조치 미완료</div></div></div>
      <section class="panel"><div class="lbl">분야별 미흡 항목</div>${catRows.length ? catRows.map(([k, n]) => `<div class="hb"><span>${esc(k)}</span><i style="width:${n / maxC * 100}%"></i><b>${n}</b></div>`).join('') : '<div class="hint">미흡 항목 없음</div>'}</section>
      <section class="panel"><div class="lbl">시정조치 현황</div><div class="tiles">${acts.map(([s, n]) => `<div class="tile"><div class="v">${n}</div><div class="l">${s}</div></div>`).join('')}</div></section>
      <section class="panel"><div class="lbl">센터별 점검 이력</div><div class="tw"><table class="tb"><tr><th class="l">센터</th><th>점검일</th><th>유형</th><th>상태</th><th>적정</th><th>미흡</th><th>확인필요</th><th>조치 완료</th></tr>
        ${Object.entries(hist).sort().map(([c, is]) => is.sort((a, b) => String(a.date).localeCompare(String(b.date))).map((i, k) => { const r = E.evaluate(i); const done = Object.values(i.actions || {}).filter(a => a.case && a.status === '조치 완료').length;
          return `<tr><td class="l">${k ? '' : esc(c)}</td><td><a href="#/r/${i.id}">${esc(fmtDate(i.date))}</a></td><td>${esc(typeName(i.type))}</td><td>${statusName(i.status)}</td><td>${r.C}</td><td class="${r.N ? 'neg' : ''}">${r.N}</td><td>${r.U}</td><td>${done}/${r.N}</td></tr>`; }).join('')).join('')}</table></div></section>`
      : '<div class="empty">조건에 맞는 점검 기록이 없습니다. 대시보드는 실제 저장된 기록만 집계합니다.</div>'}`);
  }

  /* ---------------- 점검기준 ---------------- */
  function viewGuide(t) {
    cur = null; const T = E.type(t) || E.type('A');
    render(`<h2 class="pt">점검기준 <small>${esc(CFG.source.title)}</small></h2>
      <div class="seg">${['A', 'B'].map(k => `<a href="#/guide/${k}" role="button" aria-pressed="${t === k}">${esc(E.type(k).name)}</a>`).join('')}</div>
      <div class="alert">미흡 사유·권고 문안은 시행지침을 바탕으로 한 운영 참고 분류이며 법령 위반 판정 기준이 아닙니다. [행정 확인 필요] 항목은 시행지침에 세부 기준이 없습니다.</div>
      ${T.categories.map(c => `<details class="panel"><summary>${esc(c.name)} (${c.items.length})</summary>${c.items.map(it => `<section class="ed"><b>${esc(it.id)} ${esc(it.t)}${it.crit ? ' <span class="crit">중대</span>' : ''}${it.confirm ? ' <span class="cfm">행정 확인 필요</span>' : ''}</b>${guideHTML(it, T.id)}</section>`).join('')}</details>`).join('')}
      <details class="panel"><summary>자동 검증에 쓰는 시행지침 수치</summary><ul class="ul">${Object.values(CFG.std).map(s => `<li>${esc(s.l)} <span class="src">${esc(CFG.source.short)} ${esc(s.ref)}</span></li>`).join('')}</ul></details>`);
  }

  /* ---------------- 설정·백업 ---------------- */
  function piiScan(insp) {
    const out = []; const add = (where, t) => piiHits(t).forEach(l => out.push({ where, l }));
    Object.entries(insp.answers || {}).forEach(([k, a]) => { add(`${k} 현장 확인`, a.note); add(`${k} 시정 권고`, a.rec); add(`${k} 기타 사유`, a.etc); });
    Object.entries(insp.actions || {}).forEach(([k, a]) => add(`${k} 조치 메모`, a.memo));
    add('종합 의견', insp.opinion); ['trend', 'wtrend', 'why', 'period', 'base'].forEach(k => add(`사전점검 ${k}`, (insp.pre || {})[k]));
    return out;
  }
  let pendingExport = null;
  function downloadJson(name, obj) {
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); toast('백업 파일을 저장했습니다. 다운로드 폴더를 확인하세요'); }
    catch (e) { toast('이 브라우저에서는 파일 저장을 할 수 없습니다'); }
  }
  function exportRecs(recs, name) {
    const hits = []; recs.forEach(r => piiScan(r).forEach(h => hits.push(`${r.id} ${h.where}: ${h.l}`)));
    const payload = { app: 'center-inspection', schema: CFG.schema, configVersion: CFG.version, exportedAt: new Date().toISOString(), count: recs.length, records: recs };
    if (hits.length) {
      pendingExport = { name, payload };
      $('#sheet').innerHTML = `<div class="sheetbg" data-act="closeSheet"></div><div class="sheetbox" role="alertdialog" aria-modal="true" aria-label="개인정보 의심 확인"><div class="shh"><b>내보내기 전 확인</b><button class="x" data-act="closeSheet">닫기</button></div>
        <div class="shb"><div class="alert warn">개인정보로 보이는 형식이 ${hits.length}건 있습니다. 기본 패턴 검사이므로 모든 개인정보를 찾아내지는 못합니다.</div><ul class="ul">${hits.slice(0, 30).map(h => `<li>${esc(h)}</li>`).join('')}</ul>
        <div class="row" style="margin-top:12px"><button class="btn" data-act="closeSheet">취소하고 수정</button><span class="grow"></span><button class="btn danger" data-act="forceExport">확인했음 · 내보내기</button></div></div></div>`;
      return;
    }
    downloadJson(name, payload);
  }
  function validRecord(r) {
    return r && typeof r.id === 'string' && (/^(SMP-)?\d{4}H[12]-[A-Z]{2}-\d{2}(-\d+)?$/.test(r.id) || /^[A-Z]{3}-\d{4}-\d{3}$/.test(r.id)) && (r.type === 'A' || r.type === 'B') && typeof r.centerId === 'string'
      && typeof r.answers === 'object' && ['draft', 'done'].includes(r.status) && typeof r.updatedAt === 'string';
  }
  async function importFile(file) {
    let data; try { data = JSON.parse(await file.text()); } catch (e) { toast('JSON 파일을 읽지 못했습니다'); return; }
    if (!data || data.app !== 'center-inspection' || data.schema !== CFG.schema || !Array.isArray(data.records)) { toast('이 앱의 백업 파일이 아니거나 형식 버전이 다릅니다'); return; }
    await reload(); let add = 0, upd = 0, same = 0, older = 0, bad = 0; const clash = [];
    for (const r of data.records) {
      if (!validRecord(r)) { bad++; continue; }
      const ex = list.find(x => x.id === r.id);
      if (!ex) { await store.put(r); add++; }
      else if (ex.createdAt && r.createdAt && ex.createdAt !== r.createdAt) { clash.push(E.code(r) + ' ' + E.period(r)); }
      else if (ex.updatedAt === r.updatedAt) same++;
      else if (String(r.updatedAt) > String(ex.updatedAt)) { await store.put(r); upd++; }
      else older++;
    }
    toast(`복원 완료: 추가 ${add} · 최신본 갱신 ${upd} · 중복 건너뜀 ${same + older}${bad ? ` · 형식 오류 ${bad}` : ''}${clash.length ? ` · 번호 충돌 ${clash.length}` : ''}`);
    await viewSettings();
    if (clash.length) $('#sheet').innerHTML = `<div class="sheetbg" data-act="closeSheet"></div><div class="sheetbox" role="alertdialog" aria-modal="true" aria-label="번호 충돌"><div class="shh"><b>같은 점검 코드, 다른 점검</b><button class="x" data-act="closeSheet">닫기</button></div>
      <div class="shb"><div class="alert warn">아래 점검은 이 기기에 같은 코드로 다른 점검이 이미 있어 불러오지 않았습니다. 점검계획 일정표의 방문번호가 겹쳤는지 확인하십시오.</div><ul class="ul">${clash.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div></div>`;
  }
  async function viewSettings() {
    cur = null; await reload(); const info = await CI.storage.persistInfo();
    const mb = v => v == null ? '-' : (v / 1048576).toFixed(1) + 'MB';
    render(`<h2 class="pt">설정·백업</h2>
      <section class="panel"><div class="lbl">백업 내보내기 <small>원 내부 공유폴더에 보관</small></div>
        <div class="row"><button class="btn primary" data-act="exportAll">전체 백업(.json)</button><button class="btn" data-act="exportDone">완료 점검만</button></div>
        <div class="hint">내보내기 전에 자유 기재란을 검사해 개인정보로 보이는 형식(전화번호·등록번호·이메일 등)을 알려줍니다. 기본 패턴 검사이므로 개인정보 보호를 완전히 보장하지 않습니다.</div></section>
      <section class="panel"><div class="lbl">백업 복원 <small>다른 기기·실원의 기록 합치기</small></div>
        <label class="btn" for="impfile">백업 파일 선택(.json)</label><input id="impfile" type="file" accept=".json,application/json" data-import="1" hidden>
        <div class="hint">형식을 검사한 뒤 새 기록은 추가하고, 같은 점검번호는 더 최근에 수정된 것만 반영합니다. 기존 기록을 자동으로 지우지 않습니다.</div></section>
      <section class="panel"><div class="lbl">저장 상태</div>
        <ul class="ul"><li>저장 방식: ${store.kind === 'indexeddb' ? '기기 내부 IndexedDB' : store.kind === 'localstorage' ? 'localStorage(대체)' : '저장 불가'}</li><li>저장공간 보존: ${info.persisted ? '허용됨' : '허용되지 않음(브라우저가 정리할 수 있음)'}</li><li>사용량 ${mb(info.usage)} / 가용 ${mb(info.quota)}</li><li>저장된 점검 ${list.length}건(예시 ${list.filter(i => i.sample).length}건)</li><li>기준 버전 ${esc(CFG.version)}</li></ul>
        <div class="alert">브라우저 데이터 삭제, 앱 삭제, 기기 초기화 시 기록이 사라집니다. <b>백업 절차</b>: ① 점검 완료 → ② [전체 백업] → ③ 파일을 원 내부 공유폴더로 옮김 → ④ 기기 '다운로드'에 남은 파일 삭제.</div></section>
      <section class="panel"><div class="lbl">시연용 예시 데이터</div><div class="hint">가상 번호(충남-91·전남-92·경북-93) 예시 3건. 대시보드에서는 기본 제외됩니다.</div>
        <div class="row"><button class="btn" data-act="sample">예시 불러오기</button><button class="btn" data-act="delSample">예시만 삭제</button></div></section>
      <section class="panel"><div class="lbl">보안 안내</div><ul class="ul">
        <li>이 앱은 GitHub Pages에 공개된 주소에서 열립니다. 앱 화면과 코드는 누구나 볼 수 있지만, 점검 기록은 각 기기 안에만 있고 어디로도 전송되지 않습니다.</li>
        <li>화면에 비밀번호를 두어도 공개 주소에서는 실제 접근 통제가 되지 않습니다. 기기 잠금(암호·생체인증)을 반드시 설정하십시오.</li>
        <li>점검 코드(시도-방문번호)와 실제 센터의 대응은 점검계획 일정표로 원 내부에서 관리합니다.</li>
        <li>자세한 내용: docs/SECURITY.md</li></ul></section>
      <section class="panel"><div class="lbl">기록 삭제</div><div id="wipe"><button class="btn danger" data-act="askWipe">이 기기의 점검 기록 모두 삭제</button></div></section>`);
  }

  /* ---------------- 사전제출 엑셀 적용 ---------------- */
  const PRE_NUM = /^(staff|support|bud_|farms|match|alloc|intro|escape|ended|current|p_|e_|pool_|teams|team_people|interp_n)/;
  async function applyXlsx(file) {
    let kv; try { kv = await CI.xlsx.readKV(file); } catch (e) { toast(e.message || '엑셀을 읽지 못했습니다'); return; }
    const t = kv.type === '공공형' ? 'B' : kv.type === '농촌형' ? 'A' : null;
    if (t && t !== cur.type) { toast(`파일의 사업유형(${kv.type})이 이 점검 유형과 다릅니다`); return; }
    let n = 0; cur.pre = cur.pre || {};
    Object.entries(kv).forEach(([k, v]) => {
      if (['code', 'type', 'sub', 'op'].includes(k)) return;
      if (PRE_NUM.test(k)) { const x = num(String(v).replace(/,/g, '')); if (x != null) { cur.pre[k] = x; n++; } }
      else if (['hire', 'period', 'base', 'trend', 'wtrend', 'why', 'interp'].includes(k)) { if (piiHits(v).length) return; cur.pre[k] = v; n++; }
    });
    queueSave(); toast(`사전제출 자료 ${n}개 항목을 불러왔습니다`); viewPre(cur.id);
  }

  /* ---------------- 이벤트 ---------------- */
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'navBack') return navBack();
    if (act === 'closeSheet') { $('#sheet').innerHTML = ''; return; }
    if (act === 'nType') { newState.type = b.dataset.v; newState.sub = b.dataset.v === 'A' ? '시군형' : ''; return viewNew(newState.from); }
    if (act === 'nSub') { newState.sub = b.dataset.v; return viewNew(newState.from); }
    if (act === 'nOp') { newState.op = b.dataset.v; return viewNew(newState.from); }
    if (act === 'nCreate') {
      const s = newState; const v = +String(s.visit || '').replace(/\D/g, '');
      if (!s.region) { toast('지역(시도)을 고르세요'); return; }
      if (!v || v > 99) { toast('방문번호를 1~99 숫자로 넣으세요'); return; }
      await reload(); const date = s.date || today(); let round = 1, id = E.makeId(s.region, v, date, 1);
      if (list.some(i => i.id === id)) {
        if (!s.from) { toast(`${s.region}-${String(v).padStart(2, '0')}(${E.period({ date })}) 점검이 이미 있습니다. 일정표 번호를 확인하거나, 재방문이면 점검관리에서 [후속 점검]을 누르세요`); return; }
        while (list.some(i => i.id === id)) id = E.makeId(s.region, v, date, ++round);
      }
      const now = new Date().toISOString();
      const rec = { id, schema: CFG.schema, type: s.type, sub: s.sub || '', op: s.op, region: s.region, visit: String(v).padStart(2, '0'), round, centerId: `${s.region}-${String(v).padStart(2, '0')}`, inspectorId: settings.inspectorId || '', date, status: 'draft',
        pre: {}, docs: {}, answers: {}, actions: {}, form: {}, formMemo: {}, opinion: '', prior: [], createdAt: now, updatedAt: now, configVersion: CFG.version };
      if (s.from) { const src = await store.get(s.from); if (src && src.type === s.type) { rec.pre = JSON.parse(JSON.stringify(src.pre || {})); ensureCases(src);
        rec.prior = E.evaluate(src).deficiencies.map(d => { const ac = (src.actions || {})[d.item.id] || {}; return { id: d.item.id, t: d.item.t, case: ac.case || '', status: ac.status || '조치 전', from: src.id }; }); } }
      await store.put(rec); cur = rec; newState = null; location.replace('#/pre/' + rec.id); return;
    }
    if (act === 'dup') { newState = null; const src = list.find(i => i.id === b.dataset.id); if (!src.region) { toast('이전 방식 번호의 점검은 후속 점검을 만들 수 없습니다. [+ 새 점검]을 쓰세요'); return; } newState = { type: src.type, sub: src.sub, op: src.op, region: src.region, visit: src.visit, date: today(), from: src.id }; go('/new/' + src.id); return; }
    if (act === 'doc') { cur.docs = cur.docs || {}; cur.docs[b.dataset.doc] = cur.docs[b.dataset.doc] === b.dataset.v ? '' : b.dataset.v; queueSave(); return viewPreKeep(); }
    if (act === 'preSeg') { cur.pre = cur.pre || {}; cur.pre[b.dataset.k] = cur.pre[b.dataset.k] === b.dataset.v ? '' : b.dataset.v; queueSave(); return viewPreKeep(); }
    if (act === 'st') { const a = ans(b.dataset.item); a.status = a.status === b.dataset.v ? '' : b.dataset.v;
      if (a.status === 'N' && !a.rec) a.rec = E.autoRec(E.item(cur.type, b.dataset.item), a);
      queueSave(); redrawItem(b.dataset.item); return; }
    if (act === 'chkSeg') { const a = ans(b.dataset.item); a.checks = a.checks || {}; a.checks[b.dataset.k] = a.checks[b.dataset.k] === b.dataset.v ? '' : b.dataset.v; queueSave(); redrawItem(b.dataset.item); return; }
    if (act === 'dorm') { const a = ans(b.dataset.item); a.dorm = a.dorm || {}; a.dorm[b.dataset.i] = a.dorm[b.dataset.i] === b.dataset.v ? '' : b.dataset.v; queueSave(); redrawItem(b.dataset.item); return; }
    if (act === 'regen') { const a = ans(b.dataset.item); a.rec = E.autoRec(E.item(cur.type, b.dataset.item), a); a.recEdited = false; queueSave(); redrawItem(b.dataset.item); return; }
    if (act === 'allC') { const cat = E.type(cur.type).categories.find(c => c.id === b.dataset.cat); let n = 0; cat.items.forEach(it => { const a = ans(it.id); if (!a.status) { a.status = 'C'; n++; redrawItem(it.id); } }); queueSave(); toast(n ? `${n}개 항목을 적정으로 표시했습니다` : '미응답 항목이 없습니다'); return; }
    if (act === 'guide') return openGuide(b.dataset.item);
    if (act === 'grade') { cur.form = cur.form || {}; cur.form[b.dataset.k] = cur.form[b.dataset.k] === b.dataset.v ? '' : b.dataset.v; queueSave(); b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === cur.form[b.dataset.k]))); return; }
    if (act === 'opDraft') { cur.opinion = E.opinionDraft(cur); queueSave(); const t = document.querySelector('[data-op]'); if (t) t.value = cur.opinion; return; }
    if (act === 'complete') {
      const c = E.canComplete(cur);
      if (!c.ok) { toast(c.r.unanswered.length ? `미입력 항목 ${c.r.unanswered.length}개가 있습니다` : `미흡 상세 미작성 ${c.r.incomplete.length}개가 있습니다`); const el = document.querySelector('.panel details'); if (el) el.scrollIntoView({ block: 'center' }); return; }
      cur.status = 'done'; cur.completedAt = new Date().toISOString(); ensureCases(cur); await store.put(cur); toast('점검을 완료했습니다. 백업 파일을 내보내 두세요'); return viewResult(cur.id);
    }
    if (act === 'reopen') { cur.status = 'draft'; await store.put(cur); toast('수정을 재개했습니다'); return viewResult(cur.id); }
    if (act === 'acst' || act === 'fixF') {
      if (act === 'fixF') { fixF = b.dataset.v; return viewFix(cur && location.hash.includes('/fix/') ? cur.id : ''); }
      const r = await store.get(b.dataset.insp); r.actions = r.actions || {}; const ac = r.actions[b.dataset.item] = r.actions[b.dataset.item] || {};
      ac.status = b.dataset.v; if (ac.status === '조치 완료' && !ac.date) ac.date = today(); r.updatedAt = new Date().toISOString(); await store.put(r);
      if (cur && cur.id === r.id) cur = r; b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === ac.status)));
      const d = b.closest('article').querySelector('[data-acdate]'); if (d && ac.date) d.value = ac.date; toast(`조치 상태: ${ac.status}`); return;
    }
    if (act === 'print') { try { window.print(); } catch (err) { toast('이 브라우저에서는 인쇄를 지원하지 않습니다'); } return; }
    if (act === 'exportAll') { await reload(); return exportRecs(list.filter(i => !i.sample), `center-inspection_backup_${today()}.json`); }
    if (act === 'exportDone') { await reload(); return exportRecs(list.filter(i => !i.sample && i.status === 'done'), `center-inspection_done_${today()}.json`); }
    if (act === 'exportOne') return exportRecs([cur], `center-inspection_${cur.id}.json`);
    if (act === 'forceExport') { $('#sheet').innerHTML = ''; if (pendingExport) downloadJson(pendingExport.name, pendingExport.payload); pendingExport = null; return; }
    if (act === 'demo') { await startDemo(); return viewHome(); }
    if (act === 'demoEnd') { await reload(); for (const r of list.filter(i => i.sample)) await store.remove(r.id); dashF.sample = false; toast('예시를 삭제했습니다'); return viewHome(); }
    if (act === 'sample') { dashF.sample = true; for (const r of CI.samples()) await store.put(r); toast('예시 3건을 추가했습니다'); return viewSettings(); }
    if (act === 'delSample') { await reload(); for (const r of list.filter(i => i.sample)) await store.remove(r.id); toast('예시를 삭제했습니다'); return viewSettings(); }
    if (act === 'askWipe') { $('#wipe').innerHTML = `<div class="alert crit">저장된 점검 ${list.length}건이 모두 삭제되며 되돌릴 수 없습니다. 먼저 백업 파일을 내보내십시오.<div class="row"><button class="btn" data-act="noWipe">취소</button><button class="btn danger" data-act="doWipe">모두 삭제</button></div></div>`; return; }
    if (act === 'noWipe') return viewSettings();
    if (act === 'doWipe') { await store.clear(); toast('기기의 점검 기록을 삭제했습니다'); return viewSettings(); }
    if (act === 'askDel') { const r = list.find(i => i.id === b.dataset.id);
      $('#sheet').innerHTML = `<div class="sheetbg" data-act="closeSheet"></div><div class="sheetbox" role="alertdialog" aria-modal="true" aria-label="기록 삭제 확인"><div class="shh"><b>점검 기록 삭제</b><button class="x" data-act="closeSheet">닫기</button></div>
        <div class="shb"><div class="alert crit"><b>${esc(E.code(r))} (${esc(E.period(r))}) 점검을 이 기기에서 삭제합니다. 되돌릴 수 없습니다.</b><br>필요하면 먼저 백업 파일을 내보내십시오.</div>
        <div class="row" style="margin-top:12px"><button class="btn" data-act="closeSheet">취소</button><span class="grow"></span><button class="btn danger" data-act="doDel" data-id="${r.id}">삭제</button></div></div></div>`; return; }
    if (act === 'doDel') { await store.remove(b.dataset.id); $('#sheet').innerHTML = ''; toast('삭제했습니다'); return viewManage(); }
  });
  function viewPreKeep() { const y = window.scrollY; return viewPre(cur.id).then(() => window.scrollTo(0, y)); }

  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.reason) { const it = E.item(cur.type, t.dataset.reason), a = ans(t.dataset.reason); a.reasons = a.reasons || [];
      const i = a.reasons.indexOf(t.value); t.checked ? (i < 0 && a.reasons.push(t.value)) : (i >= 0 && a.reasons.splice(i, 1));
      if (!a.recEdited) a.rec = E.autoRec(it, a); queueSave(); redrawItem(t.dataset.reason); return; }
    if (t.dataset.prexlsx && t.files[0]) { await applyXlsx(t.files[0]); t.value = ''; return; }
    if (t.dataset.import && t.files[0]) { await importFile(t.files[0]); t.value = ''; return; }
    if (t.dataset.dash !== undefined) { dashF[t.dataset.dash] = t.value; return viewDash(); }
    if (t.dataset.act2 === 'dashSample') { dashF.sample = t.checked; return viewDash(); }
    if (t.dataset.act2 === 'fixSample') { dashF.sample = t.checked; return viewFix(''); }
    if (t.dataset.acdate) { const r = await store.get(t.dataset.insp); r.actions[t.dataset.acdate].date = t.value; r.updatedAt = new Date().toISOString(); await store.put(r); if (cur && cur.id === r.id) cur = r; return; }
    if (t.dataset.chk) { redrawItem(t.dataset.item); return; }
    if (t.dataset.pre) { return viewPreKeep(); }
    if (t.dataset.ans === 'etc' || t.dataset.ans === 'note') { redrawItem(t.dataset.item); return; }
  });
  document.addEventListener('input', async e => {
    const t = e.target;
    const piiEl = t.parentElement && t.parentElement.querySelector('.pii');
    if (piiEl && (t.tagName === 'TEXTAREA' || t.type === 'text')) { const h = piiHits(t.value); piiEl.hidden = !h.length; piiEl.textContent = h.length ? `개인정보로 보이는 형식(${h.join(', ')})이 있습니다. 삭제하십시오.` : ''; }
    if (t.dataset.new) { let v = t.value; if (t.dataset.new === 'visit') { v = v.replace(/\D/g, '').slice(0, 2); if (v !== t.value) t.value = v; } newState[t.dataset.new] = v;
      const pv = $('#n-prev'); if (pv) { const s = newState; pv.innerHTML = s.region && s.visit ? `점검 코드 <b>${esc(s.region)}-${esc(String(s.visit).padStart(2, '0'))}</b> · ${esc(E.period(s))}` : '지역과 방문번호를 넣으면 점검 코드가 만들어집니다(예: 충남-01)'; } return; }
    if (t.dataset.set) { settings[t.dataset.set] = t.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); t.value = settings[t.dataset.set]; store.setMeta('settings', settings); return; }
    if (!cur) {
      if (t.dataset.acmemo) { const r = await store.get(t.dataset.insp); r.actions[t.dataset.acmemo].memo = t.value; r.updatedAt = new Date().toISOString(); await store.put(r); }
      return;
    }
    if (t.dataset.acmemo) { const r = cur.id === t.dataset.insp ? cur : await store.get(t.dataset.insp); r.actions[t.dataset.acmemo].memo = t.value; r.updatedAt = new Date().toISOString(); await store.put(JSON.parse(JSON.stringify(r))); return; }
    if (t.dataset.pre) { cur.pre = cur.pre || {}; const k = t.dataset.pre; if (t.dataset.ptype === 'text') cur.pre[k] = t.value; else { const v = t.value.replace(/[^\d.]/g, ''); if (v !== t.value) t.value = v; cur.pre[k] = v === '' ? '' : Number(v); }
      queueSave(); const b = E.budget(cur.pre); const s = $('#budsum'); if (s && b.all[0]) s.textContent = `집행률 ${b.rate}% · 센터운영비 편성 ${b.ratio}%`; return; }
    if (t.dataset.chk) { const a = ans(t.dataset.item); a.checks = a.checks || {}; const v = t.value.replace(/[^\d.]/g, ''); if (v !== t.value) t.value = v; a.checks[t.dataset.chk] = v === '' ? '' : Number(v); queueSave(); return; }
    if (t.dataset.ans) { const a = ans(t.dataset.item); a[t.dataset.ans] = t.value; if (t.dataset.ans === 'rec') a.recEdited = true; if (t.dataset.ans === 'etc' && !a.recEdited) { a.rec = E.autoRec(E.item(cur.type, t.dataset.item), a); const rt = document.querySelector(`[data-ans="rec"][data-item="${t.dataset.item}"]`); if (rt) rt.value = a.rec; } queueSave(); return; }
    if (t.dataset.op) { cur.opinion = t.value; queueSave(); return; }
  });

  /* ---------------- 시작 ---------------- */
  async function start() {
    store = await CI.storage.init(); CI.store = store;
    settings = Object.assign(settings, (await store.getMeta('settings')) || {});
    netState(); route();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        $('#net').title = '오프라인 사용 준비 완료';
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {}); });
      }).catch(() => {});
    }
  }
  $('#backBtn').addEventListener('click', navBack);
  start();
})();
