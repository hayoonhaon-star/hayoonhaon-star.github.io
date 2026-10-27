/*
 * 시연용 예시 데이터 (samples.js)
 * 실제 센터와 무관한 가상 방문번호(91~93)를 씁니다.
 * 예시 기록에는 sample:true 가 붙고, 대시보드에서는 기본적으로 제외됩니다.
 */
window.CI = window.CI || {};
CI.samples = function () {
  const now = new Date().toISOString(), y = new Date().getFullYear();
  const C = { status: 'C' };
  const base = (id, type, extra) => Object.assign({
    id, schema: 1, type, sub: type === 'A' ? '시군형' : '', op: '농협', centerId: '', inspectorId: '', date: `${y}-11-17`, round: 1,
    status: 'draft', pre: {}, docs: {}, answers: {}, actions: {}, form: {}, formMemo: {}, opinion: '', prior: [],
    sample: true, createdAt: now, updatedAt: now, configVersion: CI.CONFIG.version
  }, extra);
  const preA = { staff: 1, support: 1, hire: '계약직', period: '26.1.~12.', bud_total: 80, bud_nat: 40, bud_loc: 40, base: '26.10.31.', farms: 312, match: 5840,
    trend: '사과 적과 80% 완료', wtrend: '평균 12~15만원', p_c1: 24000, e_c1: 20000, p_c2: 5000, e_c2: 3600, p_c3: 2000, e_c3: 1500, p_c4: 1000, e_c4: 300,
    p_h1: 6000, e_h1: 2100, p_h2: 30000, e_h2: 21500, p_h3: 8000, e_h3: 5200, p_h4: 4000, e_h4: 1900, why: '전담인력 채용 지연', pool_total: 420, pool_in: 350, pool_out: 70, teams: 6, team_people: 15 };
  const a1 = base(CI.engine.makeId('충남', 91, `${y}-11-17`, 1, true), 'A', { region: '충남', visit: '91', centerId: '충남-91', status: 'done', completedAt: now, pre: preA,
    docs: { 'D-CONTRACT': 'R', 'D-POOL': 'R', 'D-PAY': 'R', 'D-EDU': 'M', 'D-ENARA': 'R' },
    answers: {
      'A1-01': C, 'A1-02': C, 'A1-03': C, 'A1-04': { status: 'N', reasons: ['EDU-SAFE'], note: '전담인력 1명 중대재해처벌법 과정 미이수', rec: '- 안전 교육(중대재해처벌법 포함) 이수' }, 'A1-05': C,
      'A2-01': C, 'A2-02': { status: 'N', reasons: ['TEAM-MIN'], note: '6개 반 15명 편성, 2명 편성 반 3개', rec: '- 영농작업반 편성 인원 보완(작업반장 포함 3명 이상)' }, 'A2-03': C, 'A2-04': { status: 'NA' },
      'A3-01': { status: 'C', checks: { posts: 3 } }, 'A3-02': { status: 'C', checks: { smpN: 5, smpOk: 5 } }, 'A3-03': C, 'A3-04': C, 'A3-05': C, 'A3-06': C,
      'A4-01': { status: 'U', note: '교육 결과보고서 사후 제출 예정' }, 'A4-02': C, 'A4-03': C, 'A4-04': { status: 'NA' },
      'A5-01': C, 'A5-02': C, 'A5-03': C, 'A5-04': { status: 'N', reasons: ['FEE-TRANS'], checks: { dist: '30㎞ 미만', trans: 15000, lodge: 30000, snack: 5000 }, note: '지급대장 표본 5건 중 2건 1일 15천원 지급(30㎞ 미만)', rec: '- 교통비 초과 지급액 확인 및 환수 여부 검토' }, 'A5-05': { status: 'C', checks: { lead: 10000 } }, 'A5-06': C, 'A5-07': C,
      'A6-01': C, 'A6-02': C, 'A6-03': C
    },
    actions: { 'A1-04': { case: 'auto', status: '조치 완료', date: `${y}-11-28` }, 'A2-02': { case: 'auto', status: '조치 중' }, 'A5-04': { case: 'auto', status: '조치 전' } },
    form: { plan: '보통', fund: '보통', match: '양호', staff: '보통', will: '양호' },
    opinion: '○ 점검 결과 전체 29개 항목 중 적정 23건, 미흡 3건, 확인필요 1건, 해당없음 2건임.\n○ 주요 미흡 사항: 담당자 교육 이수, 영농작업반 구성·운영, 농작업 참여비 — 시정 조치 요청.'
  });
  const a2 = base(CI.engine.makeId('전남', 92, `${y}-11-17`, 1, true), 'A', { region: '전남', visit: '92', centerId: '전남-92', pre: Object.assign({}, preA, { teams: 4, team_people: 20, why: '' }),
    answers: { 'A1-01': C, 'A1-02': C, 'A1-03': { status: 'N', reasons: ['FAC-TEL'] } } });
  const b1 = base(CI.engine.makeId('경북', 93, `${y}-11-17`, 1, true), 'B', { region: '경북', visit: '93', centerId: '경북-93', status: 'done', completedAt: now,
    pre: { staff: 1, hire: '내부직원', bud_total: 100, bud_nat: 50, bud_loc: 50, base: '26.10.31.', farms: 58, alloc: 60, intro: 56, escape: 3, ended: 10, current: 43, match: 6120,
      p_c1: 30000, e_c1: 25000, p_c2: 6000, e_c2: 4000, p_c3: 2000, e_c3: 1200, p_c4: 2000, e_c4: 800, p_h1: 5000, e_h1: 3000, p_h3: 10000, e_h3: 6000, p_h4: 45000, e_h4: 30000, teams: 4, team_people: 47, interp: '있음', interp_n: 2 },
    answers: {
      'B1-01': C, 'B1-02': C, 'B1-03': C, 'B2-01': C, 'B2-02': { status: 'C', checks: { econ: 20 } }, 'B2-03': { status: 'U', note: '이용료 산정 근거 자료 추가 제출 요청' },
      'B3-01': C, 'B3-02': C, 'B3-03': { status: 'C', checks: { wage: 10320 } }, 'B3-04': C, 'B3-05': C, 'B3-06': { status: 'N', reasons: ['TIP-LATE'], note: '채용 후 2개월 경과 시점까지 조사 결과 미제출', rec: '- 조사 결과 즉시 제출' }, 'B3-07': C,
      'B4-01': C, 'B4-02': C, 'B4-03': C, 'B4-04': C, 'B4-05': C, 'B5-01': C, 'B5-02': C, 'B5-03': { status: 'NA' },
      'B6-01': { status: 'C', checks: { room: 3.2 }, dorm: {} }, 'B6-02': { status: 'C', checks: { feeMode: '숙식 모두', ord: 2156880, fee: 400000 } }
    },
    actions: { 'B3-06': { case: 'auto', status: '조치 중' } },
    form: { plan: '양호', fund: '양호', worker: '보통', staff: '양호', dorm: '양호', will: '양호' }
  });
  return [a1, a2, b1];
};
