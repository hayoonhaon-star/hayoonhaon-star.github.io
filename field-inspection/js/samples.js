/*
 * 시연용 익명 예시 데이터 (samples.js)
 * 실제 농가·시군·개인 정보와 무관한 가상의 점검 결과입니다.
 */
window.FI = window.FI || {};
FI.samples = function () {
  const now = new Date().toISOString();
  const d = new Date(); const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const C = { status: 'C', methods: ['현장 확인'] };
  const base = (id, module, seq, label, extra) => Object.assign({
    id, module, seq, label, date: ymd, status: 'draft', answers: {}, fields: {}, edits: {}, sample: true,
    createdAt: now, updatedAt: now, configVersion: FI.CONFIG.version
  }, extra);

  const f1 = base('sample-farm-1', 'farm', 901, '방문 농가 901', {
    status: 'done', completedAt: now,
    fields: { alloc: '6', workers: { '라오스': 4, '베트남': 2 } },
    answers: {
      'F-A1': C, 'F-A2': { status: 'N', reasons: ['A2-NOKEEP', 'A2-UNDERST'], methods: ['서류 확인', '관계자 확인'] },
      'F-A3': C, 'F-A4': { status: 'N', reasons: ['A4-TIME'], methods: ['서류 확인'] }, 'F-A5': C,
      'F-A6': C, 'F-A7': { status: 'N', reasons: ['A7-PROOF'], methods: ['서류 확인'] },
      'F-B1': C, 'F-B2': { status: 'N', reasons: ['B2-ROOM', 'B2-WC'], methods: ['현장 확인'] }, 'F-B3': C,
      'F-B4': { status: 'N', reasons: ['B4-DETECT', 'B4-EXT'], methods: ['현장 확인'] }, 'F-B5': C, 'F-B6': C,
      'F-C1': { status: 'C', extra: { eduDate: ymd }, methods: ['서류 확인'] }, 'F-C2': { status: 'U' }, 'F-C3': C, 'F-C4': C
    }
  });
  const f2 = base('sample-farm-2', 'farm', 902, '방문 농가 902', {
    fields: { alloc: '4', workers: { '라오스': 4 } },
    answers: { 'F-A1': C, 'F-A2': C, 'F-A3': { status: 'N', reasons: ['A3-3RD'] }, 'F-A4': C, 'F-B1': { status: 'N', reasons: ['B1-NOHOT'] } }
  });
  const s1 = base('sample-sigun-1', 'sigun', 901, '점검 시·군 901', {
    status: 'done', completedAt: now,
    fields: { mode: 'MOU', emp: '120', alloc: '500', ret: '200', away: '3', acc: '0', staff: '1명', workers: { '라오스': 300, '베트남': 180 } },
    answers: {
      'S-A1': { status: 'N', reasons: ['SA1-NONE'], extra: { site: '80', doc: '30', none: '10' } },
      'S-A2': { status: 'NA' },
      'S-A3': { status: 'C', extra: { n: '120', times: '2', way: '대면' } },
      'S-A4': { status: 'N', reasons: ['SA4-REPORT'], extra: { n: '480', times: '1', way: '대면' } },
      'S-B1': { status: 'C', extra: { eduDate: ymd } }, 'S-B2': { status: 'U' }, 'S-B3': { status: 'N', reasons: ['SB3-PART'] }
    },
    opinion: '(예시) 동절기 한랭질환 예방용품 지원 예산 확대 건의'
  });
  return [f1, f2, s1];
};
