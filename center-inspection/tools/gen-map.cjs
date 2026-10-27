const fs=require('fs'),vm=require('vm');const ctx={window:{}};ctx.CI=undefined;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','js/config/criteria.js'),'utf8').replace('window.CI = window.CI || {};','var CI = window.CI = window.CI || {};'),ctx);
const C=ctx.window.CI.CONFIG;
let md='# 점검항목 · 미흡 사유 · 시정 권고 대응표\n\n> js/config/criteria.js에서 자동 생성(기준 버전 '+C.version+'). 근거 쪽수는 「'+C.source.title+'」 하단 인쇄 쪽수입니다.\n>\n> 미흡 사유와 권고 문안은 시행지침을 바탕으로 한 **운영 참고 분류**이며 법령 위반·행정처분 판단 기준이 아닙니다. **[행정 확인 필요]** 항목은 시행지침에 세부 판단 기준이 없어 점검자 판단으로 기록합니다.\n\n';
for(const t of ['A','B']){const T=C.types[t];md+='## '+T.name+' (점검표 '+T.form+')\n\n';
 for(const cat of T.categories){md+='### '+cat.name+'\n\n| 항목 | 확인 기준 | 근거 | 미흡 사유 → 시정 권고 | 후속 조치 |\n|---|---|---|---|---|\n';
  for(const it of cat.items){md+='| **'+it.id+'** '+it.t+(it.crit?' **[중대]**':'')+(it.confirm?'<br>[행정 확인 필요] '+it.confirm:'')+' | '+it.c.replace(/\|/g,'/')+' | '+C.source.short+' '+it.ref+' | '+it.reasons.map(r=>r.l+' → '+r.r).join('<br>')+'<br>기타 → 기타 사유 확인 후 시정 조치 | '+(it.fu||'')+' |\n';}
  md+='\n';}}
md+='## 자동 검증 규칙\n\n| 규칙 | 내용 | 시행지침 수치 | 구분 | 후속 조치 |\n|---|---|---|---|---|\n';
for(const [k,r] of Object.entries(C.rules)){md+='| '+k+' | '+r.l+' | '+(r.std.map(s=>C.std[s].l+' ('+C.std[s].ref+')').join('<br>')||('시행지침 '+(r.ref||'')))+' | '+(r.kind==='violation'?'기준 위반(수치 확인)':'사람 확인 필요')+' | '+r.act+' |\n';}
fs.writeFileSync(require('path').join(__dirname,'..','docs/점검항목_사유_권고_대응표.md'),md);
console.log('items',['A','B'].map(t=>C.types[t].categories.reduce((s,c)=>s+c.items.length,0)),'confirm',['A','B'].map(t=>C.types[t].categories.flatMap(c=>c.items).filter(i=>i.confirm).length));
