/*
 * 화면 구성 (app.js)
 * 흐름: 점검 유형 선택 → 익명 대상 선택 → 점검기준 확인 → 준수 여부 체크 → 미준수 사유 복수 선택
 *       → 지적·권고 자동 생성 → 결과 검토 → A4 보고서(PDF 저장)
 */
(function () {
  const E = FI.engine, CFG = FI.CONFIG;
  const $ = s => document.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fmtDate = d => d ? d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (m, y, mo, da) => `${y}. ${+mo}. ${+da}.`) : '';
  const uid = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // 전화번호·주민/외국인등록번호·여권번호·이메일 형식 차단
  const PII = /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|0\d{1,2}-\d{3,4}-\d{4}|\d{6}[-\s]?[1-8]\d{6}|\b[A-Z]{1,2}\d{7,8}\b|[\w.-]+@[\w-]+\./;

  let store = null, settings = { team: '', region: '' }, list = [], storeInfo = {};
  let cur = null, saveTimer = null, savedAt = null;

  /* ---------------- 공통 ---------------- */
  function toast(m) { const h = $('#toast'); h.innerHTML = `<div class="toast" role="status">${esc(m)}</div>`; clearTimeout(toast.t); toast.t = setTimeout(() => h.innerHTML = '', 2400); }
  async function reload() { list = (await store.list()) || []; list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))); }
  function go(h) { location.hash = h; }
  function netState() {
    const el = $('#net'); const on = navigator.onLine;
    el.className = 'net ' + (on ? 'on' : 'off');
    el.textContent = on ? '온라인' : '오프라인 사용 중';
  }
  window.addEventListener('online', netState); window.addEventListener('offline', netState);

  // 국가별 계절노동자 인원
  function wk(insp) { return (insp.fields && insp.fields.workers) || {}; }
  function wkTotal(insp) { return Object.values(wk(insp)).reduce((t, n) => t + (+n || 0), 0); }
  function wkText(insp) { const w = wk(insp), parts = Object.keys(w).filter(k => +w[k] > 0).map(k => `${k} ${w[k]}명`); return parts.length ? `총 ${wkTotal(insp)}명(${parts.join(' / ')})` : ''; }
  function needWk(insp) { const m = E.module(insp.module); return !!(m.workerCounts && !wkTotal(insp)); }
  FI.wkText = wkText;
  function wkPanel() {
    const m = E.module(cur.module), w = wk(cur), tot = wkTotal(cur);
    return `<section class="panel wkp ${tot ? '' : 'req'}" id="wkpanel">
      <div class="ph2"><span class="lbl">${esc(m.workerCounts.title)} <em class="reqtag">필수</em></span><b class="wktot" id="wktot">총 ${tot}명</b></div>
      <div class="wkrows">${m.workerCounts.nations.map(n => `<div class="wkr"><span>${esc(n)}</span>
        ${m.workerCounts.input === 'num'
          ? `<input type="text" inputmode="numeric" class="wkn" id="wkn-${esc(n)}" data-wkn="${esc(n)}" value="${+w[n] || ''}" placeholder="0" maxlength="5" aria-label="${esc(n)} 인원">`
          : `<div class="stp"><button data-act="wk" data-nat="${esc(n)}" data-d="-1" aria-label="${esc(n)} 줄이기">−</button><b>${+w[n] || 0}</b><button data-act="wk" data-nat="${esc(n)}" data-d="1" aria-label="${esc(n)} 늘리기">+</button></div>`}</div>`).join('')}</div>
      <div class="hint" id="wkhint">${tot ? esc(wkText(cur)) : '국가별 인원을 입력하세요. 입력해야 점검을 완료할 수 있습니다.'}</div>
    </section>`;
  }
  function progress(insp) { const r = E.evaluate(insp); return { done: r.answered, total: r.total, r }; }

  function queueSave() {
    if (!cur) return;
    cur.updatedAt = new Date().toISOString();
    clearTimeout(saveTimer);
    $('#saveState') && ($('#saveState').textContent = '저장 중…');
    saveTimer = setTimeout(async () => {
      try { await store.put(JSON.parse(JSON.stringify(cur))); savedAt = new Date(); const s = $('#saveState'); if (s) s.textContent = `자동 저장 ${String(savedAt.getHours()).padStart(2, '0')}:${String(savedAt.getMinutes()).padStart(2, '0')}`; }
      catch (e) { toast('기기에 저장하지 못했습니다. 저장 공간을 확인하세요.'); }
    }, 300);
  }

  /* ---------------- 라우터 ---------------- */
  // 이전 화면: 앱 안에서 이동한 기록이 있으면 브라우저 뒤로, 없으면 상위 화면으로
  let navDepth = -1;
  function parentOf(p, a) {
    if (p === 'i') return '/saved';
    if (p === 'r') return '/i/' + a;
    if (p === 'p') { const ids = String(a || '').split(','); return ids.length === 1 ? '/r/' + ids[0] : '/reports'; }
    return '/';
  }
  function navBack() {
    const [p, a] = location.hash.replace(/^#\/?/, '').split('/');
    $('#sheet').innerHTML = '';
    if (navDepth > 0) { navDepth -= 2; history.back(); } else go(parentOf(p, a));
  }
  async function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [p, a] = h.split('/');
    navDepth++;
    window.scrollTo(0, 0);
    document.body.dataset.view = p || 'home';
    const home = !p; $('#backBtn').hidden = home; $('#homeBtn').hidden = home;
    if (p === 'new') return viewNew();
    if (p === 'i') return viewInspect(a);
    if (p === 'r') return viewReview(a);
    if (p === 'saved') return viewList('draft');
    if (p === 'reports') return viewList('done');
    if (p === 'p') return viewPreview(a);
    if (p === 'guide') return viewGuide(a);
    if (p === 'worker') return viewWorker();
    if (p === 'settings') return viewSettings();
    return viewHome();
  }
  window.addEventListener('hashchange', route);

  function render(html) { $('#view').innerHTML = html; }

  /* ---------------- 대시보드 ---------------- */
  async function viewHome() {
    cur = null; await reload();
    const drafts = list.filter(i => i.status !== 'done'), done = list.filter(i => i.status === 'done');
    const warn = storeWarn();
    render(`
      ${warn}
      <section class="hero">
        <h2>${esc(settings.team || '현장점검')}${settings.region ? ' · ' + esc(settings.region) : ''}</h2>
        <p>${esc(CFG.source.title)}</p>
      </section>
      <div class="tiles">
        <div class="tile"><div class="v">${drafts.length}</div><div class="l">작성 중</div></div>
        <div class="tile"><div class="v">${done.length}</div><div class="l">완료</div></div>
        <div class="tile"><div class="v">${list.filter(i => i.module === 'farm').length}</div><div class="l">농가 점검</div></div>
        <div class="tile"><div class="v">${list.filter(i => i.module === 'sigun').length}</div><div class="l">시·군 점검</div></div>
      </div>
      <nav class="menu">
        <a class="mi primary" href="#/new"><b>새 점검</b><span>점검 유형과 익명 대상 번호를 선택합니다</span></a>
        <a class="mi" href="#/saved"><b>저장된 점검</b><span>작성 중 ${drafts.length}건 · 이어서 작성</span></a>
        <a class="mi" href="#/guide"><b>점검기준</b><span>문항별 기준·확인 서류·현장 질문</span></a>
        <a class="mi" href="#/reports"><b>완료 보고서</b><span>완료 ${done.length}건 · A4 PDF 저장</span></a>
        <a class="mi" href="#/worker"><b>권익침해 식별지표</b><span>문항 참고·중대 침해 시 조치 절차(응답 저장 안 함)</span></a>
        <a class="mi" href="#/settings"><b>설정·데이터 관리</b><span>점검반 정보, 예시 데이터, 기록 삭제</span></a>
      </nav>
      <h3 class="sh">점검 진행 현황</h3>
      ${drafts.length ? `<div class="list">${drafts.map(card).join('')}</div>` : '<div class="empty">작성 중인 점검이 없습니다. \'새 점검\'으로 시작하세요.</div>'}
    `);
  }
  function storeWarn() {
    const k = store.kind;
    if (k === 'memory') return `<div class="alert crit"><b>이 브라우저에서는 기기 저장이 불가능합니다.</b> 개인정보 보호(비공개) 모드를 끄고 다시 여세요. 지금 입력하는 내용은 창을 닫으면 사라집니다.</div>`;
    const p = storeInfo.persisted ? '' : ' 브라우저가 저장공간을 정리하면 기록이 지워질 수 있습니다.';
    return `<div class="alert storenote" role="note"><b>기록은 이 기기에만 저장됩니다.</b> 서버로 전송되지 않으며, 다른 기기와 공유되지 않습니다.${p} 점검을 마치면 보고서를 PDF로 저장해 두십시오.</div>`;
  }
  function card(i) {
    const pr = progress(i), m = E.module(i.module), pct = Math.round(pr.done / pr.total * 100);
    return `<a class="card" href="#/${i.status === 'done' ? 'r' : 'i'}/${i.id}">
      <div class="ct"><b>${esc(i.label)}</b>${i.sample ? '<span class="tag">예시</span>' : ''}<span class="tag ${i.status === 'done' ? 'ok' : ''}">${i.status === 'done' ? '완료' : '작성 중'}</span></div>
      <div class="cm">${esc(m.name)} · ${esc(fmtDate(i.date))}${wkText(i) ? ' · ' + esc(m.workerCounts.label) + ' ' + esc(wkText(i)) : m.workerCounts ? ' · <span class="neg">' + esc(m.workerCounts.title) + ' 미입력</span>' : ''} · 응답 ${pr.done}/${pr.total}${pr.r.N ? ` · <span class="neg">미준수 ${pr.r.N}</span>` : ''}${pr.r.U ? ` · 미확인 ${pr.r.U}` : ''}</div>
      <div class="bar"><i style="width:${pct}%"></i></div></a>`;
  }

  /* ---------------- 새 점검 ---------------- */
  let newState = null;
  async function viewNew() {
    cur = null; await reload();
    if (!newState) newState = { module: 'farm', date: today(), seq: null };
    const nextSeq = mod => list.filter(i => i.module === mod).reduce((m, i) => Math.max(m, i.seq || 0), 0) + 1;
    if (!newState.seq) newState.seq = nextSeq(newState.module);
    const m = E.module(newState.module), its = E.items(newState.module);
    const label = `${m.labelPrefix} ${newState.seq}`;
    const dup = list.find(i => i.module === newState.module && i.seq === newState.seq);
    render(`
      <h2 class="pt">새 점검</h2>
      <section class="panel">
        <div class="lbl">1. 점검 유형</div>
        <div class="seg big">${['farm', 'sigun'].map(k => `<button data-act="nmod" data-v="${k}" aria-pressed="${newState.module === k}">${esc(E.module(k).name)}</button>`).join('')}</div>
        <div class="hint">${esc(m.doc)}</div>
      </section>
      <section class="panel">
        <div class="lbl">2. 익명 점검 대상 번호</div>
        <div class="stepper"><button data-act="nseq" data-d="-1" aria-label="번호 줄이기">−</button><b>${esc(label)}</b><button data-act="nseq" data-d="1" aria-label="번호 늘리기">+</button></div>
        <div class="hint">번호는 자동으로 다음 순번이 매겨집니다. 실제 농가명·시군명과의 대응표는 앱 밖(종이 등)에서 관리하십시오.</div>
        ${dup ? `<div class="alert warn">'${esc(label)}' 기록이 이미 있습니다(${dup.status === 'done' ? '완료' : '작성 중'}). <a href="#/${dup.status === 'done' ? 'r' : 'i'}/${dup.id}">기존 기록 열기</a> 또는 번호를 바꾸세요.</div>` : ''}
      </section>
      <section class="panel">
        <label class="lbl" for="ndate">3. 점검일</label>
        <input type="date" id="ndate" value="${esc(newState.date)}">
      </section>
      <section class="panel">
        <div class="lbl">4. 적용 점검표</div>
        <ul class="cl">${m.categories.map(c => `<li>${esc(c.name)} <span>${c.items.length}개 항목</span></li>`).join('')}</ul>
        <div class="hint">총 ${its.length}개 항목 · 각 항목에 '미확인' 선택지가 추가됩니다.</div>
      </section>
      <button class="btn primary block" data-act="ncreate" ${dup ? 'disabled' : ''}>점검 시작</button>
    `);
    newState.nextSeq = nextSeq;
  }

  /* ---------------- 체크리스트 ---------------- */
  async function load(id) { const r = await store.get(id); if (!r) { toast('기록을 찾을 수 없습니다'); go('/'); return null; } cur = r; return r; }

  async function viewInspect(id) {
    if (!cur || cur.id !== id) { if (!await load(id)) return; }
    const m = E.module(cur.module), pr = progress(cur);
    const fields = (m.fields || []).map(f => fieldInput(f, (cur.fields || {})[f.k], 'field')).join('');
    render(`
      <div class="sub">
        <div class="subrow"><div><b>${esc(cur.label)}</b> <span class="muted">${esc(m.name)} · ${esc(fmtDate(cur.date))}</span></div><span class="muted sm" id="saveState">${savedAt ? '자동 저장됨' : '자동 저장'}</span></div>
        <div class="prog"><div class="bar"><i id="pbar" style="width:${Math.round(pr.done / pr.total * 100)}%"></i></div><span id="ptext">${pr.done}/${pr.total}</span></div>
      </div>
      ${m.workerCounts ? wkPanel() : ''}
      ${m.fields ? `<details class="panel"><summary class="lbl">${esc(m.fieldsTitle || (m.workerCounts ? '기타 현황(선택 입력)' : '현황(선택 입력)'))}</summary><div class="fgrid">${fields}</div><div class="hint">사업장명·대표자·주소·연락처는 입력하지 않습니다.</div></details>` : ''}
      ${m.categories.map(cat => `<section class="catsec"><h3 class="cath">${esc(cat.id)}. ${esc(cat.name)}</h3>${cat.items.map(it => itemCard(Object.assign({ cat: cat.id }, it))).join('')}<button class="btn sm" data-act="allC" data-cat="${esc(cat.id)}">${esc(cat.id)}분류 미응답 항목 모두 준수(여)로 표시</button></section>`).join('')}
      ${cur.module === 'sigun' ? `<section class="panel"><label class="lbl" for="opinion">${esc(m.opinion.l)}</label><textarea id="opinion" data-op="1" rows="4" placeholder="${esc(m.opinion.hint)}">${esc(cur.opinion || '')}</textarea><div class="pii" hidden>전화번호·등록번호·이메일 형식은 저장되지 않습니다.</div></section>` : ''}
      <div class="bottombar"><button class="btn" data-act="navBack">← 이전</button><a class="btn" href="#/">처음 화면</a><span class="grow"></span><a class="btn primary" href="#/r/${cur.id}">결과 검토 →</a></div>
    `);
  }

  function fieldInput(f, v, scope, item) {
    const id = `${scope}-${item ? item + '-' : ''}${f.k}`;
    const data = `data-scope="${scope}" data-k="${f.k}"${item ? ` data-item="${item}"` : ''}`;
    let inp;
    if (f.type === 'select') inp = `<select id="${id}" ${data}>${f.o.map(o => `<option value="${esc(o)}"${o === (v || '') ? ' selected' : ''}>${esc(o || '선택')}</option>`).join('')}</select>`;
    else if (f.type === 'date') inp = `<input type="date" id="${id}" ${data} value="${esc(v || '')}">`;
    else inp = `<input type="text" inputmode="numeric" id="${id}" ${data} value="${esc(v || '')}" maxlength="6">`;
    return `<label class="fi" for="${id}"><span>${esc(f.l)}</span>${inp}</label>`;
  }

  function itemCard(it) {
    const a = (cur.answers || {})[it.id] || {};
    const opts = E.options(it);
    const st = a.status || '';
    let body = '';
    if (st === 'N') {
      const rs = E.reasons(it);
      body += `<div class="rs"><div class="rsh">미준수 사유 <small>복수 선택 · 운영 참고 분류(법령 위반 판정 아님)</small></div>
        ${rs.map(r => `<label class="ck${r.verify ? ' v' : ''}"><input type="checkbox" data-reason="${it.id}" value="${r.c}"${(a.reasons || []).includes(r.c) ? ' checked' : ''}><span>${esc(r.l)}${r.verify ? ' <em>추가 확인</em>' : ''}</span></label>`).join('')}</div>`;
    }
    if (st) {
      const res = E.itemResult(it, a);
      if (res.findings.length || res.verifies.length) {
        body += `<div class="gen">${res.findings.map(f => `<div><span class="gl">지적</span>${esc(f.f)}</div><div><span class="gl r">권고</span>${esc(f.r)}</div>`).join('')}${res.verifies.map(v => `<div><span class="gl v">확인</span>${esc(v.f)}</div>`).join('')}</div>`;
      }
      if (it.extra && (it.extraWhen || ['C']).includes(st)) body += `<div class="fgrid">${it.extra.map(x => fieldInput(x, (a.extra || {})[x.k], 'extra', it.id)).join('')}</div>`;
      body += `<div class="meth"><span>확인 방법</span>${CFG.verifyMethods.map(mm => `<button data-act="meth" data-item="${it.id}" data-v="${esc(mm)}" aria-pressed="${(a.methods || []).includes(mm)}">${esc(mm)}</button>`).join('')}</div>`;
    }
    return `<article class="item ${st === 'N' ? 'is-n' : st === 'U' ? 'is-u' : st ? 'is-c' : ''}" id="it-${it.id}">
      <div class="iq">
        <div class="qt"><span class="qid">${esc(it.id)}</span>${esc(it.q)}${it.note ? `<small>※ ${esc(it.note)}</small>` : ''}
          <button class="gbtn" data-act="guide" data-item="${it.id}">점검기준 확인</button></div>
        <div class="opts">${opts.map(o => `<button data-act="st" data-item="${it.id}" data-v="${o.v}" class="o-${o.v}" aria-pressed="${st === o.v}">${esc(o.l)}</button>`).join('')}</div>
      </div>${body}</article>`;
  }

  function redrawItem(itemId) {
    const it = E.item(cur.module, itemId); const el = document.getElementById('it-' + itemId);
    if (!it || !el) return;
    const tmp = document.createElement('div'); tmp.innerHTML = itemCard(it); el.replaceWith(tmp.firstElementChild);
    const pr = progress(cur); $('#pbar').style.width = Math.round(pr.done / pr.total * 100) + '%'; $('#ptext').textContent = `${pr.done}/${pr.total}`;
  }
  function ans(itemId) { cur.answers = cur.answers || {}; return cur.answers[itemId] || (cur.answers[itemId] = {}); }

  /* ---------------- 점검기준 시트 ---------------- */
  function guideHTML(it, mod) {
    const m = E.module(mod);
    const sec = m.categories.find(c => c.items.some(x => x.id === it.id));
    return `<dl class="gd">
      <dt>1. 점검기준(점검표 원문)</dt><dd>${esc(it.q)}${it.note ? `<br><small>※ ${esc(it.note)}</small>` : ''}<br><small>응답: ${E.options(it).map(o => o.l).join(' / ')}</small></dd>
      <dt>2. 확인 서류·증빙 <small>운영 참고</small></dt><dd><ul>${(it.evidence || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></dd>
      <dt>3. 현장 확인 질문 예시 <small>운영 참고</small></dt><dd><ul>${(it.fieldQs || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></dd>
      <dt>4. 미준수 시 확인 요령 <small>운영 참고</small></dt><dd>${esc(it.guide || '')}<br><small>선택 가능한 사유: ${E.reasons(it).map(r => r.l).join(', ')}</small></dd>
    </dl>`;
  }
  function openGuide(itemId) {
    const mod = cur ? cur.module : (E.item('farm', itemId) ? 'farm' : 'sigun');
    const it = E.item(mod, itemId);
    $('#sheet').innerHTML = `<div class="sheetbg" data-act="closeSheet"></div><div class="sheetbox" role="dialog" aria-modal="true" aria-label="점검기준">
      <div class="shh"><b>${esc(it.id)} ${esc(it.short)}</b><button class="x" data-act="closeSheet">닫기</button></div>
      <div class="shb">${guideHTML(it, mod)}</div></div>`;
  }

  /* ---------------- 결과 검토 ---------------- */
  async function viewReview(id) {
    if (!cur || cur.id !== id) { if (!await load(id)) return; }
    const m = E.module(cur.module), r = E.evaluate(cur);
    const ta = (kind, x) => `<div class="ed" data-key="${esc(x.key)}">
        <div class="src">${esc(x.itemId)} ${esc(x.item.short)}${x.codes && x.codes.length && x.codes[0] !== 'U' ? ' · 사유: ' + esc(E.reasonLabels(x.item, x.codes).join(', ')) : ''}${x.edited ? ' · <b>수정함</b>' : ''}</div>
        <label class="fi"><span>${kind === 'f' ? '지적사항' : '확인 필요 사항'}</span><textarea rows="2" data-edit="${esc(x.key)}" data-part="f">${esc(x.f)}</textarea></label>
        <label class="fi"><span>${kind === 'f' ? '시정 권고' : '확인·조치 방향'}</span><textarea rows="2" data-edit="${esc(x.key)}" data-part="r">${esc(x.r)}</textarea></label>
        ${x.edited ? `<button class="btn sm" data-act="resetEdit" data-key="${esc(x.key)}">자동 문안으로 되돌리기</button>` : ''}
        <div class="pii" hidden>전화번호·등록번호·이메일 형식은 저장되지 않습니다.</div></div>`;
    render(`
      <h2 class="pt">결과 검토 · ${esc(cur.label)}</h2>
      <div class="muted">${esc(m.name)} · ${esc(fmtDate(cur.date))} · ${cur.status === 'done' ? '<b class="okc">완료</b>' : '작성 중'}</div>
      <div class="tiles t5">
        <div class="tile"><div class="v">${r.total}</div><div class="l">전체 항목</div></div>
        <div class="tile"><div class="v">${r.C}</div><div class="l">준수</div></div>
        <div class="tile ${r.N ? 'c' : ''}"><div class="v">${r.N}</div><div class="l">미준수</div></div>
        <div class="tile"><div class="v">${r.U}</div><div class="l">미확인</div></div>
        <div class="tile ${r.unanswered.length ? 'w' : ''}"><div class="v">${r.unanswered.length}</div><div class="l">미응답</div></div>
      </div>
      <section class="panel"><div class="lbl">분류별 결과</div>
        <div class="tw"><table class="tb"><tr><th class="l">분류</th><th>항목</th><th>준수</th><th>미준수</th><th>미확인</th><th>미해당</th></tr>
        ${r.byCat.map(c => `<tr><td class="l">${esc(c.id)}. ${esc(c.name)}</td><td>${c.total}</td><td>${c.C}</td><td class="${c.N ? 'neg' : ''}">${c.N}</td><td>${c.U}</td><td>${c.NA}</td></tr>`).join('')}</table></div></section>
      ${needWk(cur) ? `<section class="panel warnp"><div class="lbl">${esc(m.workerCounts ? m.workerCounts.title : '')}(국가별 인원)이 입력되지 않았습니다 — 완료 전에 입력이 필요합니다</div><a href="#/i/${cur.id}" data-jump="wkpanel">현황 입력하러 가기</a></section>` : ''}
      ${r.unanswered.length ? `<section class="panel warnp"><div class="lbl">미응답 항목 ${r.unanswered.length}개 — 완료 전에 응답이 필요합니다</div>
        <ul class="ul">${r.unanswered.map(it => `<li><a href="#/i/${cur.id}" data-jump="${it.id}">${esc(it.id)} ${esc(it.short)}</a></li>`).join('')}</ul></section>` : ''}
      <section class="panel"><div class="lbl">주요 지적사항·시정 권고 <small>${r.findings.length}건 · 수정 가능</small></div>
        ${r.findings.length ? r.findings.map(x => ta('f', x)).join('') : '<div class="empty">미준수로 확인된 사항이 없습니다.</div>'}</section>
      <section class="panel"><div class="lbl">추가 확인 필요 사항 <small>${r.verifies.length}건 · 확정 지적 아님</small></div>
        ${r.verifies.length ? r.verifies.map(x => ta('v', x)).join('') : '<div class="empty">해당 없음</div>'}</section>
      <div class="bottombar">
        <a class="btn" href="#/i/${cur.id}">← 점검표</a><span class="grow"></span>
        ${cur.status === 'done' ? `<button class="btn" data-act="reopen">수정 재개</button>` : `<button class="btn" data-act="complete" ${r.unanswered.length ? 'aria-disabled="true"' : ''}>점검 완료</button>`}
        <button class="btn danger" data-act="askDel" data-id="${cur.id}" data-from="review">삭제</button>
        <a class="btn primary" href="#/p/${cur.id}">보고서 · PDF</a>
      </div>
    `);
  }

  /* ---------------- 목록 ---------------- */
  let picked = new Set();
  async function viewList(kind) {
    cur = null; await reload(); picked = new Set();
    const rows = list.filter(i => kind === 'done' ? i.status === 'done' : i.status !== 'done');
    render(`
      <h2 class="pt">${kind === 'done' ? '완료 보고서' : '저장된 점검'}</h2>
      <div class="hint">${kind === 'done' ? '보고서를 선택해 한 번에 PDF로 저장하거나, 필요 없는 기록을 골라 삭제할 수 있습니다.' : '필요 없는 기록은 선택해 삭제할 수 있습니다.'}</div>
      ${rows.length ? `<div class="list">${rows.map(i => `<div class="pickrow"><label class="ck"><input type="checkbox" data-pick="${i.id}" aria-label="${esc(i.label)} 선택"><span></span></label>${card(i)}</div>`).join('')}</div>`
        : `<div class="empty">${kind === 'done' ? '완료된 점검이 없습니다.' : '작성 중인 점검이 없습니다.'}</div>`}
      ${rows.length ? `<div class="bottombar"><button class="btn" data-act="pickAll">전체 선택</button><button class="btn danger" data-act="askDel" data-from="${kind}">선택 삭제</button><span class="grow"></span>${kind === 'done' ? '<button class="btn primary" data-act="multiPdf">선택 보고서 PDF</button>' : ''}</div>` : ''}
    `);
  }

  /* ---------------- 보고서 미리보기 ---------------- */
  async function viewPreview(ids) {
    await reload();
    const sel = String(ids || '').split(',').map(id => list.find(i => i.id === id)).filter(Boolean);
    if (!sel.length) { go('/reports'); return; }
    render(`
      <div class="noprint pvbar"><button class="btn" data-act="back">← 돌아가기</button><span class="grow"></span><button class="btn primary" data-act="print">PDF 저장 · 인쇄</button></div>
      <div class="noprint hint pvhint">iPad·iPhone: 'PDF 저장 · 인쇄' → 인쇄 옵션 화면에서 공유 버튼 → '파일에 저장'. Android: 인쇄 대상에서 'PDF로 저장'.</div>
      <div class="paper">${FI.report.build(sel, settings)}</div>`);
  }

  /* ---------------- 점검기준 ---------------- */
  function viewGuide(mod) {
    cur = null; mod = mod === 'sigun' ? 'sigun' : 'farm';
    const m = E.module(mod);
    render(`
      <h2 class="pt">점검기준</h2>
      <div class="seg">${['farm', 'sigun'].map(k => `<a href="#/guide/${k}" role="button" aria-pressed="${mod === k}">${esc(E.module(k).name)}</a>`).join('')}</div>
      <div class="hint">${esc(m.doc)} · 기기에 저장되어 오프라인에서도 볼 수 있습니다. '운영 참고' 표시는 점검계획에 규정된 내용이 아닌 제안 사항입니다.</div>
      ${m.categories.map(c => `<h3 class="cath">${esc(c.id)}. ${esc(c.name)}</h3>${c.items.map(it => `<details class="panel"><summary><span class="qid">${esc(it.id)}</span>${esc(it.short)}</summary>${guideHTML(it, mod)}</details>`).join('')}`).join('')}
    `);
  }

  /* ---------------- 식별지표 참고 ---------------- */
  function viewWorker() {
    cur = null; const w = CFG.modules.worker;
    render(`
      <h2 class="pt">권익침해 식별지표 <small>참고</small></h2>
      <div class="alert"><b>응답을 저장하지 않습니다.</b> ${esc(w.notice)}</div>
      <section class="panel"><div class="lbl">중대 침해 의심 시 조치</div><ul class="ul">${w.escalation.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>
      <section class="panel"><div class="lbl">다국어 상담지</div><div class="hint">${w.languages.map(esc).join(' · ')} — 점검계획 붙임5 원본 상담지를 사용하십시오.</div></section>
      ${w.sections.map(s => `<h3 class="cath">${esc(s.name)}</h3><div class="wq">${s.qs.map(q => `<div class="wr"><span class="qid">${esc(q[0])}</span><div>${esc(q[1])}<small>${esc(q[2])}</small></div></div>`).join('')}</div>`).join('')}
    `);
  }

  /* ---------------- 설정 ---------------- */
  async function viewSettings() {
    cur = null; await reload(); storeInfo = await FI.storage.persistInfo();
    const mb = v => v == null ? '-' : (v / 1048576).toFixed(1) + 'MB';
    render(`
      <h2 class="pt">설정·데이터 관리</h2>
      <section class="panel"><div class="lbl">점검반 정보 <small>보고서 머리말에 표시 · 선택</small></div>
        <div class="fgrid"><label class="fi" for="s-team"><span>점검반</span><input id="s-team" data-set="team" value="${esc(settings.team)}" placeholder="예: 13팀" maxlength="20"></label>
        <label class="fi" for="s-region"><span>점검 지역</span><input id="s-region" data-set="region" value="${esc(settings.region)}" placeholder="예: 충남" maxlength="20"></label></div></section>
      <section class="panel"><div class="lbl">저장 상태</div>
        <ul class="ul"><li>저장 방식: ${store.kind === 'indexeddb' ? '기기 내부 IndexedDB' : store.kind === 'localstorage' ? '기기 내부 localStorage(대체)' : '저장 불가(창을 닫으면 삭제)'}</li>
        <li>저장공간 보존 요청: ${storeInfo.persisted ? '허용됨' : '허용되지 않음(브라우저가 정리할 수 있음)'}</li>
        <li>사용량: ${mb(storeInfo.usage)} / 가용: ${mb(storeInfo.quota)}</li><li>저장된 점검: ${list.length}건</li><li>앱 버전: ${esc(CFG.version)}</li></ul>
        <div class="alert">브라우저 저장소는 기기 분실, 브라우저 데이터 삭제, 앱 삭제, 장기간 미사용 시 지워질 수 있습니다. 완료한 점검은 PDF로 저장해 두십시오.</div></section>
      <section class="panel"><div class="lbl">시연용 예시 데이터</div>
        <div class="hint">실제 정보가 없는 익명 예시 3건(농가 2, 시·군 1)을 추가합니다. '예시' 표시가 붙습니다.</div>
        <div class="row"><button class="btn" data-act="sample">예시 불러오기</button><button class="btn" data-act="delSample">예시만 삭제</button></div></section>
      <section class="panel"><div class="lbl">기록 삭제</div><div id="wipe"><button class="btn danger" data-act="askWipe">이 기기의 점검 기록 모두 삭제</button></div></section>
    `);
  }

  /* ---------------- 이벤트 ---------------- */
  document.addEventListener('click', async e => {
    const jump = e.target.closest('[data-jump]');
    if (jump) { e.preventDefault(); const t = jump.dataset.jump; go('/i/' + cur.id); setTimeout(() => { const el = document.getElementById(t === 'wkpanel' ? t : 'it-' + t); el && el.scrollIntoView({ block: 'center' }); }, 80); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'nmod') { newState.module = b.dataset.v; newState.seq = null; return viewNew(); }
    if (act === 'nseq') { newState.seq = Math.max(1, newState.seq + (+b.dataset.d)); return viewNew(); }
    if (act === 'ncreate') {
      const m = E.module(newState.module);
      const rec = { id: uid(), module: newState.module, seq: newState.seq, label: `${m.labelPrefix} ${newState.seq}`, date: $('#ndate').value || today(),
        status: 'draft', answers: {}, fields: {}, edits: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), configVersion: CFG.version };
      await store.put(rec); cur = rec; newState = null; navDepth--; location.replace('#/i/' + rec.id); return;
    }
    if (act === 'st') { const a = ans(b.dataset.item); a.status = a.status === b.dataset.v ? '' : b.dataset.v; if (a.status !== 'N') a.reasons = []; if (a.extra && !(E.item(cur.module, b.dataset.item).extraWhen || ['C']).includes(a.status)) delete a.extra; queueSave(); redrawItem(b.dataset.item); return; }
    if (act === 'meth') { const a = ans(b.dataset.item); a.methods = a.methods || []; const v = b.dataset.v, i = a.methods.indexOf(v); i < 0 ? a.methods.push(v) : a.methods.splice(i, 1); queueSave(); redrawItem(b.dataset.item); return; }
    if (act === 'allC') { const m = E.module(cur.module), cat = m.categories.find(c => c.id === b.dataset.cat); let n = 0;
      cat.items.forEach(it => { const a = ans(it.id); if (!a.status) { a.status = 'C'; n++; redrawItem(it.id); } });
      queueSave(); toast(n ? `${n}개 항목을 준수(여)로 표시했습니다` : '미응답 항목이 없습니다'); return; }
    if (act === 'wk') { cur.fields = cur.fields || {}; const w = cur.fields.workers = cur.fields.workers || {}; const n = b.dataset.nat;
      w[n] = Math.max(0, Math.min(99, (+w[n] || 0) + (+b.dataset.d))); if (!w[n]) delete w[n]; queueSave();
      const tmp = document.createElement('div'); tmp.innerHTML = wkPanel(); $('#wkpanel').replaceWith(tmp.firstElementChild); return; }
    if (act === 'guide') return openGuide(b.dataset.item);
    if (act === 'closeSheet') { $('#sheet').innerHTML = ''; return; }
    if (act === 'resetEdit') { delete cur.edits[b.dataset.key]; await store.put(cur); return viewReview(cur.id); }
    if (act === 'complete') {
      const r = E.evaluate(cur);
      if (needWk(cur)) { toast(E.module(cur.module).workerCounts.title + '(국가별 인원)을 먼저 입력하세요.'); return; }
      if (r.unanswered.length) { toast(`미응답 항목 ${r.unanswered.length}개가 있습니다. 응답 후 완료하세요.`); return; }
      cur.status = 'done'; cur.completedAt = new Date().toISOString(); await store.put(cur); toast('점검을 완료했습니다'); return viewReview(cur.id);
    }
    if (act === 'reopen') { cur.status = 'draft'; await store.put(cur); go('/i/' + cur.id); return; }
    if (act === 'askDel') {
      const ids = b.dataset.id ? [b.dataset.id] : [...picked];
      if (!ids.length) { toast('삭제할 기록을 선택하세요'); return; }
      const names = ids.map(id => (list.find(i => i.id === id) || cur || {}).label).filter(Boolean);
      $('#sheet').innerHTML = `<div class="sheetbg" data-act="closeSheet"></div><div class="sheetbox" role="alertdialog" aria-modal="true" aria-label="기록 삭제 확인">
        <div class="shh"><b>점검 기록 삭제</b><button class="x" data-act="closeSheet">닫기</button></div>
        <div class="shb"><div class="alert crit"><b>${ids.length}건을 이 기기에서 삭제합니다. 되돌릴 수 없습니다.</b><br>${names.map(esc).join(', ')}<br>보고서가 필요하면 먼저 PDF로 저장하십시오.</div>
        <div class="row" style="margin-top:12px"><button class="btn" data-act="closeSheet">취소</button><span class="grow"></span><button class="btn danger" data-act="doDel" data-ids="${ids.join(',')}" data-from="${esc(b.dataset.from || '')}">삭제</button></div></div></div>`;
      return;
    }
    if (act === 'doDel') {
      const ids = b.dataset.ids.split(','), from = b.dataset.from;
      for (const id of ids) await store.remove(id);
      $('#sheet').innerHTML = ''; toast(`${ids.length}건을 삭제했습니다`);
      if (from === 'review') { cur = null; go('/saved'); return; }
      return viewList(from === 'done' ? 'done' : 'draft');
    }
    if (act === 'pickAll') { document.querySelectorAll('[data-pick]').forEach(c => { c.checked = true; picked.add(c.dataset.pick); }); return; }
    if (act === 'multiPdf') { if (!picked.size) { toast('보고서를 선택하세요'); return; } go('/p/' + [...picked].join(',')); return; }
    if (act === 'print') { try { window.print(); } catch (err) { toast('이 브라우저에서는 인쇄를 지원하지 않습니다'); } return; }
    if (act === 'sample') { for (const r of FI.samples()) await store.put(r); toast('예시 3건을 추가했습니다'); return viewSettings(); }
    if (act === 'delSample') { for (const r of list.filter(i => i.sample)) await store.remove(r.id); toast('예시를 삭제했습니다'); return viewSettings(); }
    if (act === 'askWipe') { $('#wipe').innerHTML = `<div class="alert crit">저장된 점검 ${list.length}건이 모두 삭제되며 되돌릴 수 없습니다. 필요한 보고서는 먼저 PDF로 저장하십시오.<div class="row"><button class="btn" data-act="noWipe">취소</button><button class="btn danger" data-act="doWipe">모두 삭제</button></div></div>`; return; }
    if (act === 'noWipe') return viewSettings();
    if (act === 'doWipe') { await store.clear(); toast('기기의 점검 기록을 삭제했습니다'); return viewSettings(); }
    if (act === 'back' || act === 'navBack') { navBack(); return; }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.reason) {
      const a = ans(t.dataset.reason); a.reasons = a.reasons || [];
      const i = a.reasons.indexOf(t.value); t.checked ? (i < 0 && a.reasons.push(t.value)) : (i >= 0 && a.reasons.splice(i, 1));
      queueSave(); redrawItem(t.dataset.reason); return;
    }
    if (t.dataset.pick) { t.checked ? picked.add(t.dataset.pick) : picked.delete(t.dataset.pick); return; }
    if (t.id === 'ndate' && newState) { newState.date = t.value; return; }
    if (t.dataset.scope) fieldChange(t);
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.scope && t.tagName === 'INPUT' && t.type === 'text') { t.value = t.value.replace(/[^\d]/g, ''); fieldChange(t); return; }
    if (t.dataset.wkn) { t.value = t.value.replace(/[^\d]/g, ''); cur.fields = cur.fields || {}; const w = cur.fields.workers = cur.fields.workers || {};
      const n = t.dataset.wkn; if (+t.value) w[n] = +t.value; else delete w[n]; queueSave();
      const tot = wkTotal(cur); $('#wktot').textContent = `총 ${tot}명`; $('#wkhint').textContent = tot ? wkText(cur) : '국가별 인원을 입력하세요. 입력해야 점검을 완료할 수 있습니다.';
      $('#wkpanel').classList.toggle('req', !tot); return; }
    if (t.dataset.set) { settings[t.dataset.set] = t.value; store.setMeta('settings', settings); return; }
    if (t.dataset.op || t.dataset.edit) {
      const bad = PII.test(t.value); const w = t.closest('.panel, .ed').querySelector('.pii'); if (w) w.hidden = !bad; if (bad) return;
      if (t.dataset.op) { cur.opinion = t.value; queueSave(); return; }
      cur.edits = cur.edits || {}; const k = t.dataset.edit; cur.edits[k] = cur.edits[k] || {}; cur.edits[k][t.dataset.part] = t.value; queueSave();
    }
  });
  function fieldChange(t) {
    if (!cur) return;
    if (t.dataset.scope === 'field') { cur.fields = cur.fields || {}; cur.fields[t.dataset.k] = t.value; }
    else { const a = ans(t.dataset.item); a.extra = a.extra || {}; a.extra[t.dataset.k] = t.value; }
    queueSave();
  }

  /* ---------------- 시작 ---------------- */
  async function start() {
    store = await FI.storage.init(); FI.store = store;
    settings = Object.assign(settings, (await store.getMeta('settings')) || {});
    storeInfo = await FI.storage.persistInfo();
    netState(); route();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        const el = $('#net'); el.title = '오프라인 사용 준비 완료';
        // 새 버전 확인: 앱을 다시 볼 때마다 서버의 새 파일을 확인하고, 있으면 자동 적용
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {}); });
      }).catch(() => {});
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded || !navigator.serviceWorker.controller) return; reloaded = true;
        setTimeout(() => location.reload(), 600); // 자동 저장(0.3초)이 끝난 뒤 새 버전으로 다시 불러옴
      });
    }
  }
  start();
})();
