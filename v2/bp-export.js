/* ТЗ-075: one immutable authorised snapshot feeds print and CSV. */
function bpDiaryDay(iso){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));}
function bpDiaryRows(rows,intakes,from,to,meds){
 const out=[];
 for(let day=from;day<=to;day=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10)){
 const r=rows.filter(x=>bpDiaryDay(x.measured_at)===day).sort((a,b)=>a.measured_at.localeCompare(b.measured_at)||Number(a.id)-Number(b.id));
 const numbered=fn=>r.map((x,i)=>(i+1)+'. '+fn(x)).join('\n');
 out.push([day,numbered(x=>new Intl.DateTimeFormat('ru',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'}).format(new Date(x.measured_at))),r.length?numbered(x=>x.sys+'/'+x.dia):'Нет измерений',numbered(x=>x.pulse??'—'),numbered(x=>[x.note,x.comment].filter(Boolean).join(' · ')||'—'),[...meds(day),...intakes.filter(x=>x.date===day).map(x=>'Приём отмечен: '+x.name+(x.time?' · '+x.time:'')),...(intakes.some(x=>x.date===day)?[]:['Запись о фактическом приёме за этот день отсутствует'])].join('\n')]);
 }return out;
}
function bpDiaryCSV(rows){return '\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/^(\s*[=+@-])/,'\'$1').replace(/"/g,'""')+'"').join(';')).join('\r\n');}
function bpDiaryOpen(){
 const person=cur, today=bpDiaryDay(new Date()), from=new Date(Date.parse(today+'T12:00:00Z')-29*86400000).toISOString().slice(0,10);
 bmScreen(bmClose()+bmHeading('Дневник для врача')+`<p>${esc(DATA[person].name||DATA[person].short||person)} · Europe/Moscow</p><label>С <input id="bpDiaryFrom" type="date" value="${from}"></label> <label>По <input id="bpDiaryTo" type="date" value="${today}"></label><p><button class="btn btn-primary" id="bpDiaryBuild">Сформировать</button></p><p id="bpDiaryStatus" role="status"></p><div id="bpDiaryResult"></div>`);
 let request=0; const invalidate=()=>{request++;modal.querySelector('#bpDiaryResult').innerHTML='';}; modal.querySelector('#bpDiaryFrom').onchange=invalidate;modal.querySelector('#bpDiaryTo').onchange=invalidate;
 modal.querySelector('#bpDiaryBuild').onclick=async()=>{
 const ticket=++request;
 const status=modal.querySelector('#bpDiaryStatus'), result=modal.querySelector('#bpDiaryResult'), a=modal.querySelector('#bpDiaryFrom').value,b=modal.querySelector('#bpDiaryTo').value;
 result.innerHTML='';
 if(!a||!b||a>b||!/^\d{4}-\d\d-\d\d$/.test(a)||!/^\d{4}-\d\d-\d\d$/.test(b)){status.textContent='Проверьте даты периода.';return;}
 status.textContent='Загружаем полный дневник…';
 try{
 const [pressure,book]=await Promise.all([mkApi('bp_export',{person,from:a,to:b,time_zone:'Europe/Moscow'}),mkApi('medbook')]);
 if(cur!==person||!result.isConnected||ticket!==request)return;
 if(!pressure.complete||!Array.isArray(pressure.rows)||!Array.isArray(pressure.intakes)||!book.data||!book.data[person]||!Array.isArray(pressure.plans))throw Error('incomplete');
 const d=book.data[person], pp=pressure.plans, courses=[...(d.meds||[]),...((d.sym||{}).ep||[]).flatMap(e=>(e.rx||[]).filter(x=>x.m).map(x=>({n:x.m,from:x.from,to:x.to,how:x.how})))];
 const meds=day=>[...new Set(courses.filter(m=>m.n).flatMap(m=>{
 const candidate=pp.find(x=>x.med_key===medKeyOf(m.n)), sourceStart=m.from||m.data?.from||'',sourceEnd=m.stopped||m.to||'',planStart=candidate?.started_on||'';
 const conflict=!!(planStart&&((sourceEnd&&sourceEnd<planStart)||(sourceStart&&sourceStart>planStart))),p=conflict?null:candidate;
 const start=medStart(m)||p?.started_on||'', s=medCourseStatus(m,p,start,day);
 if(!start||start>day)return !start?['Период назначения не установлен: '+m.n]:[];
 if(p?.declined_on&&p.declined_on<=day)return [];
 const end=p?.stop_on||m.to;
 if(end&&day>=end)return ['Плановое завершение '+end+' · дальнейший приём не подтверждён: '+m.n];
 const scheme=medSchemes(p).filter(x=>x.on<=day).sort((x,y)=>y.on.localeCompare(x.on))[0];
 return [(s.confirmedStart?'Курс начат (дозы не подтверждены): ':'Назначено: ')+m.n+(scheme?.text?' · '+scheme.text:m.how?' · '+m.how:'')];
 }))];
 const headers=['Дата','Время','Давление, мм рт. ст.','Пульс, уд/мин','Комментарий','Лекарства'], rows=bpDiaryRows(pressure.rows,pressure.intakes,a,b,meds), name=d.name||d.short||person;
 const table='<table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 const html='<!doctype html><html lang="ru"><meta charset="utf-8"><title>Дневник давления</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial;color:#000}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #555;padding:5px;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:auto}h1{font-size:18px}@media print{button{display:none}}</style><h1>Дневник давления — '+esc(name)+'</h1><p>'+esc(a)+' — '+esc(b)+' · Europe/Moscow</p>'+table+'</html>';
 status.textContent='Измерений: '+pressure.rows.length+'. Проверьте дневник перед печатью.';
 result.innerHTML='<button class="btn btn-primary" id="bpDiaryPrint">Просмотр и печать / PDF</button> <button class="btn btn-secondary" id="bpDiaryCSV">Скачать для Excel / Google Таблиц</button><p class="muted">Файл CSV: в Excel выберите импорт UTF-8, разделитель «;». В Google Таблицах: Файл → Импорт → Загрузить, разделитель «;». Это снимок, без автоматической синхронизации.</p><div style="overflow:auto">'+table+'</div>';
 result.querySelector('#bpDiaryPrint').onclick=()=>{if(cur!==person)return;const w=window.open('','_blank');if(!w){status.textContent='Разрешите открытие окна для печати.';return;}w.document.write(html);w.document.close();w.focus();w.print();};
 result.querySelector('#bpDiaryCSV').onclick=()=>{if(cur!==person)return;const url=URL.createObjectURL(new Blob([bpDiaryCSV([headers,...rows])],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='Дневник-давления_'+a+'_'+b+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 }catch(e){if(status.isConnected&&ticket===request)status.textContent='Не удалось получить полный дневник. Проверьте связь и повторите.';}
 };
}
document.addEventListener('click',e=>{if(e.target.closest?.('[data-bpdiary]'))bpDiaryOpen();});



