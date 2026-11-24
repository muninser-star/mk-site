/* ТЗ-075: one immutable authorised snapshot feeds print and CSV. */
function bpDiaryDate(day){return /^\d{4}-\d{2}-\d{2}$/.test(String(day))?day.slice(8,10)+'.'+day.slice(5,7)+'.'+day.slice(0,4):String(day||'');}
function bpDiaryDay(iso){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));}
function bpDiaryExcluded(name){const n=String(name||'').toLowerCase().replace(/ё/g,'е').replace(/[«»„“”"']/g,'').replace(/\s+/g,' ').trim();return ['мирена','вмс мирена'].includes(n);}
const BP_DIARY_LEGEND='Утро 00:00–11:59 · День 12:00–17:59 · Вечер 18:00–23:59 · Europe/Moscow';
function bpDiaryRows(rows,intakes,from,to,meds,symptoms=[]){
 const out=[],clock=iso=>new Intl.DateTimeFormat('ru',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
 for(let day=from;day<=to;day=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10)){
 const r=rows.filter(x=>bpDiaryDay(x.measured_at)===day).sort((a,b)=>a.measured_at.localeCompare(b.measured_at)||Number(a.id)-Number(b.id));
 const groups=[[],[],[]],comments=[];
 r.forEach((x,i)=>{const time=clock(x.measured_at),hour=Number(time.slice(0,2)),label=time+' №'+(i+1);groups[hour<12?0:hour<18?1:2].push(label+' — '+x.sys+'/'+x.dia+(x.pulse!=null?'; пульс '+x.pulse:''));const comment=String(x.comment||'').trim(),legacy=comment.toLowerCase()==='в покое',condition=String(x.note||'').trim()||(legacy?comment:'');if(condition)groups[hour<12?0:hour<18?1:2][groups[hour<12?0:hour<18?1:2].length-1]+='\n  Условия: '+condition;if(comment&&!legacy)comments.push(label+' — '+comment);});
 symptoms.filter(x=>x.date===day).forEach(x=>comments.push('Симптом: '+x.name+(x.time?' · '+x.time:'')+(x.date_warning?' · '+x.date_warning:'')+(x.source_warning?' · '+x.source_warning:'')));
 const facts=intakes.filter(x=>x.date===day&&!bpDiaryExcluded(x.name));
 out.push([bpDiaryDate(day),...groups.map(x=>x.join('\n')||'—'),comments.join('\n')||'—',[...meds(day),...facts.map(x=>'Прием: '+x.name+(x.time?' · '+x.time:''))].join('\n')||'—']);
 }return out;
}
function bpDiaryCSV(rows){return '\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/^(\s*[=+@-])/,'\'$1').replace(/"/g,'""')+'"').join(';')).join('\r\n');}

/* Optional weather context. Only a public city/date-range query leaves the browser. */
const BP_WEATHER_NOTE='Москва · Open-Meteo · модельные данные, не показания метеостанции; давление у поверхности, мм рт. ст.; осадки за предыдущий час.';
let bpWeatherVisible=false;
const bpWeatherCache=new Map();
function bpWeatherShift(day,n){return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)}
async function bpWeatherLoad(from,to){
 const today=bpDiaryDay(new Date()), last=to>today?today:to;
 if(from>last)return new Map();
 const key=from+'|'+last, cached=bpWeatherCache.get(key);
 if(cached&&Date.now()-cached.at<600000)return cached.promise;
 const promise=(async()=>{
  const out=new Map(), cutoff=bpWeatherShift(today,-6);
  const fetchRange=async(a,b,recent)=>{
   const params=new URLSearchParams({latitude:'55.75',longitude:'37.62',hourly:'surface_pressure,precipitation,temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day',wind_speed_unit:'ms',timezone:'GMT',start_date:bpWeatherShift(a,-1),end_date:b});
   const endpoint=recent?'https://api.open-meteo.com/v1/forecast':'https://archive-api.open-meteo.com/v1/archive';
   const response=await fetch(endpoint+'?'+params,{referrerPolicy:'no-referrer',credentials:'omit',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('weather');
   const h=(await response.json()).hourly;
   if(!Array.isArray(h?.time))throw Error('weather');
   h.time.forEach((t,i)=>{
    const ts=Date.parse(t+'Z');
    if(!Number.isFinite(ts)||ts>Date.now())return;
    const num=k=>typeof h[k]?.[i]==='number'&&Number.isFinite(h[k][i])?h[k][i]:null;
    const p=num('surface_pressure');
    out.set(ts,{p:p==null?null:p*0.750061683,prec:num('precipitation'),temp:num('temperature_2m'),rh:num('relative_humidity_2m'),code:num('weather_code'),wind:num('wind_speed_10m'),isDay:num('is_day'),recent});
   });
  };
  const jobs=[];
  for(let a=bpWeatherShift(from,-2);a<=last;){
   const recent=a>cutoff, limit=bpWeatherShift(a,89);
   const b=[last,limit,recent?last:cutoff].sort()[0];
   jobs.push(fetchRange(a,b,recent));a=bpWeatherShift(b,1);
  }
  await Promise.allSettled(jobs);
  if(!out.size)throw Error('weather unavailable');
  return out;
 })();
 bpWeatherCache.set(key,{at:Date.now(),promise});
 if(bpWeatherCache.size>8)bpWeatherCache.delete(bpWeatherCache.keys().next().value);
 try{return await promise}catch(e){bpWeatherCache.delete(key);throw e}
}
function bpWeatherCondition(w){
 const c=w.code;
 let condition='';
 if(c===0)condition=w.isDay===0?'🌙 Ясно':'☀️ Ясно';
 else if(c===1||c===2)condition='⛅ Переменная облачность';
 else if(c===3)condition='☁️ Пасмурно';
 else if([45,48].includes(c))condition='🌫️ Туман';
 else if([51,53,55,56,57].includes(c))condition='🌦️ Морось';
 else if([61,63,65,66,67,80,81,82].includes(c))condition='🌧️ Дождь';
 else if([71,73,75,77,85,86].includes(c))condition='❄️ Снег';
 else if([95,96,99].includes(c))condition='⛈️ Гроза';
 const wind=Number.isFinite(w.wind)?'💨 Ветер '+w.wind.toFixed(1).replace('.',',')+' м/с':'';
 return [condition,wind].filter(Boolean).join(' · ');
}
function bpWeatherHTML(value){
 return esc(String(value??'')).replace(/(?:осадки )?(?:-?\d+(?:[,.]\d+)?|—) (?:мм рт\. ст\.|мм)(?!\S)/g,m=>'<strong>'+m+'</strong>');
}
function bpDiaryReadingHTML(line){
 return esc(line).replace(/( — )(\d{2,3}\/\d{2,3})(?=;|$)/,(_,prefix,bp)=>prefix+'<strong>'+bp+'</strong>');
}

function bpWeatherAt(map,iso){
 const t=Math.floor(Date.parse(iso)/3600000)*3600000, w=map.get(t);
 if(!w)return 'Нет данных';
 const fmt=(n,d=1)=>n==null?'—':n.toFixed(d).replace('.',',');
 const delta=[3,6,12,24,48].map(h=>{const prev=map.get(t-h*3600000)?.p,d=w.p==null||prev==null?null:w.p-prev;return h+'ч '+(d==null?'—':(d>0?'+':'')+fmt(d));}).join(' · ');
 const condition=bpWeatherCondition(w);
 return fmt(w.p)+' мм рт. ст. · осадки '+fmt(w.prec)+' мм'+(condition?'\n'+condition:'')+'\n'+fmt(w.temp)+' °C · влажность '+fmt(w.rh,0)+'%\nΔ давления: '+delta+(w.recent?' · оперативная модель':'');
}
function bpWeatherDay(map,day,rows){
 const start=Date.parse(day+'T00:00:00+03:00'), end=start+86400000, now=Date.now();
 const hours=Array.from({length:24},(_,i)=>map.get(start+(i+1)*3600000)).filter(Boolean);
 const p=hours.map(w=>w.p).filter(Number.isFinite), rain=hours.map(w=>w.prec).filter(Number.isFinite);
 const f=n=>n.toFixed(1).replace('.',',');
 const daily=end<=now&&hours.length===24&&p.length===24&&rain.length===24?'Среднее за сутки: '+f(p.reduce((a,b)=>a+b,0)/24)+' мм рт. ст. · осадки '+f(rain.reduce((a,b)=>a+b,0))+' мм':'Суточные данные неполные';
 const lines=rows.filter(r=>bpDiaryDay(r.measured_at)===day).sort((a,b)=>a.measured_at.localeCompare(b.measured_at)).map(r=>new Intl.DateTimeFormat('ru',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'}).format(new Date(r.measured_at))+' — '+bpWeatherAt(map,r.measured_at));
 return [daily,...lines].join('\n');
}

function bpDiaryColgroup(withWeather){const widths=withWeather?[8,14,14,14,13,13,24]:[9,17,17,17,20,20];return '<colgroup>'+widths.map(w=>'<col style="width:'+w+'%">').join('')+'</colgroup>';}
function bpDiaryOpen(){
 const person=cur, today=bpDiaryDay(new Date()), from=new Date(Date.parse(today+'T12:00:00Z')-29*86400000).toISOString().slice(0,10);
 bmScreen(bmClose()+bmHeading('Дневник для врача')+`<style>.mbox.bp-diary-dialog{box-sizing:border-box;width:min(1360px,100%);max-width:calc(100vw - 32px);min-width:0}.bp-diary-dialog p{white-space:normal;overflow-wrap:anywhere}.bp-diary-controls{display:flex;flex-wrap:wrap;align-items:end;gap:12px;margin:16px 0}.bp-diary-controls label{display:grid;gap:6px;font-size:14px}.bp-diary-actions{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.bp-diary-note{font-size:13px;line-height:1.5;margin:12px 0 16px}.bp-diary-scroll{box-sizing:border-box;width:100%;min-width:0;max-width:100%;overflow:auto;overscroll-behavior-x:contain;border:1px solid var(--surface-2);border-radius:8px}.bp-diary-scroll:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.tbl.bp-diary-table{width:100%;min-width:1100px;table-layout:fixed;font-size:13px}.tbl.bp-diary-table--weather{min-width:1500px}.tbl.bp-diary-table th,.tbl.bp-diary-table td{vertical-align:top;line-height:1.6;padding:12px;white-space:pre-wrap;overflow-wrap:normal;word-break:normal}.tbl.bp-diary-table th{white-space:normal;background:var(--surface-1)}.tbl.bp-diary-table th:first-child,.tbl.bp-diary-table td:first-child{position:sticky;left:0;z-index:1;background:var(--card);box-shadow:1px 0 0 var(--surface-2)}.tbl.bp-diary-table th:first-child{background:var(--surface-1);z-index:2}.tbl.bp-diary-table tbody tr:nth-child(even) td:first-child{background:var(--surface-1)}.tbl.bp-diary-table--weather td:last-child{white-space:pre-wrap;overflow-wrap:break-word;word-break:normal}.tbl.bp-diary-table td:nth-child(-n+4){white-space:pre;font-variant-numeric:tabular-nums}.tbl.bp-diary-table td:nth-child(n+5){overflow-wrap:anywhere}.tbl.bp-diary-table tbody tr:nth-child(even){background:var(--surface-1)}#bpDiaryResult{min-width:0}#bpDiaryStatus{margin:12px 0}</style><p>${esc(DATA[person].name||DATA[person].short||person)} · Europe/Moscow</p><div class="bp-diary-controls"><label>С <input id="bpDiaryFrom" type="date" value="${from}"></label> <label>По <input id="bpDiaryTo" type="date" value="${today}"></label><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="bpDiaryWeather"> <span id="bpDiaryWeatherLabel">Показывать погоду</span></label><button class="btn btn-primary" id="bpDiaryBuild">Сформировать</button></div><p id="bpDiaryStatus" role="status"></p><div id="bpDiaryResult"></div>`,'bp-diary-dialog');
 let request=0; const invalidate=()=>{request++;modal.querySelector('#bpDiaryResult').innerHTML='';}; modal.querySelector('#bpDiaryFrom').onchange=invalidate;modal.querySelector('#bpDiaryTo').onchange=invalidate; modal.querySelector('#bpDiaryWeather').onchange=e=>{modal.querySelector('#bpDiaryWeatherLabel').textContent=e.target.checked?'Отключить погоду':'Показывать погоду';const started=request>0;invalidate();if(started)modal.querySelector('#bpDiaryBuild').click();};
 modal.querySelector('#bpDiaryBuild').onclick=async()=>{
 const ticket=++request;
 const status=modal.querySelector('#bpDiaryStatus'), result=modal.querySelector('#bpDiaryResult'), a=modal.querySelector('#bpDiaryFrom').value,b=modal.querySelector('#bpDiaryTo').value;
 result.innerHTML='';
 if(!a||!b||a>b||!/^\d{4}-\d\d-\d\d$/.test(a)||!/^\d{4}-\d\d-\d\d$/.test(b)){status.textContent='Проверьте даты периода.';return;}
 status.textContent='Загружаем полный дневник…';
 try{
 const [pressure,book]=await Promise.all([mkApi('bp_export',{person,from:a,to:b,time_zone:'Europe/Moscow'}),mkApi('medbook')]);
 if(cur!==person||!result.isConnected||ticket!==request)return;
 if(!pressure.complete||!Array.isArray(pressure.rows)||!Array.isArray(pressure.intakes)||!Array.isArray(pressure.symptoms)||!book.data||!book.data[person]||!Array.isArray(pressure.plans))throw Error('incomplete');
 const d=book.data[person], pp=pressure.plans, courses=[...(d.meds||[]),...((d.sym||{}).ep||[]).flatMap(e=>(e.rx||[]).filter(x=>x.m).map(x=>({n:x.m,from:x.from,to:x.to,how:x.how})))];
 const meds=day=>[...new Set(courses.filter(m=>m.n&&!bpDiaryExcluded(m.n)).flatMap(m=>{
 const candidate=pp.find(x=>x.med_key===medKeyOf(m.n)), sourceStart=m.from||m.data?.from||'',sourceEnd=m.stopped||m.to||'',planStart=candidate?.started_on||'';
 const conflict=!!(planStart&&((sourceEnd&&sourceEnd<planStart)||(sourceStart&&sourceStart>planStart))),p=conflict?null:candidate;
 const start=medStart(m)||p?.started_on||'', s=medCourseStatus(m,p,start,day);
 if(!start||start>day)return !start?['Период назначения не установлен: '+m.n]:[];
 if(p?.declined_on&&p.declined_on<=day)return [];
 const end=p?.stop_on||m.to;
 if(end&&day>=end)return ['Плановое завершение '+bpDiaryDate(end)+' · дальнейший приём не подтверждён: '+m.n];
 const scheme=medSchemes(p).filter(x=>x.on<=day).sort((x,y)=>y.on.localeCompare(x.on))[0];
 return [(s.confirmedStart?'Курс начат (дозы не подтверждены): ':'Назначено: ')+m.n+(scheme?.text?' · '+scheme.text:m.how?' · '+m.how:'')];
 }))];
 const headers=['Дата','Утро','День','Вечер','Комментарий','Лекарство'], rows=bpDiaryRows(pressure.rows,pressure.intakes,a,b,meds,pressure.symptoms), name=d.name||d.short||person;
 const withWeather=modal.querySelector('#bpDiaryWeather').checked;let weatherWarning='';if(withWeather){headers.push('Погода · Москва');status.textContent='Загружаем погоду…';let weather;try{weather=await bpWeatherLoad(a,b)}catch(e){weatherWarning=' Погода недоступна; данные давления сохранены.';}if(cur!==person||!result.isConnected||ticket!==request)return;rows.forEach((r,i)=>r.push(weather?bpWeatherDay(weather,bpWeatherShift(a,i),pressure.rows):'Нет данных'));}
 const weatherLegend=withWeather?' · '+BP_WEATHER_NOTE:'';
 const cell=(v,i)=>withWeather&&i===6?bpWeatherHTML(v):i>0&&i<4?String(v).split('\n').map(line=>line.startsWith('  Условия: ')?'<span style="display:block;white-space:normal;overflow-wrap:anywhere">'+esc(line.trim())+'</span>':'<span style="display:block;white-space:nowrap">'+bpDiaryReadingHTML(line)+'</span>').join(''):esc(v);
 const table='<table>'+bpDiaryColgroup(withWeather)+'<thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map((v,i)=>'<td>'+cell(v,i)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 const html='<!doctype html><html lang="ru"><meta charset="utf-8"><title>Дневник давления</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial;color:#000}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #555;padding:5px;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:auto}h1{font-size:18px}@media print{button{display:none}td span{white-space:normal!important;overflow-wrap:break-word}}</style><h1>Дневник давления — '+esc(name)+'</h1><p>'+esc(bpDiaryDate(a))+' — '+esc(bpDiaryDate(b))+' · Europe/Moscow</p><p>' +BP_DIARY_LEGEND+esc(weatherLegend)+'</p>'+table+'</html>';
 status.textContent='Измерений: '+pressure.rows.length+'. Проверьте дневник перед печатью.'+weatherWarning;
 result.innerHTML='<p class="muted bp-diary-note">' +BP_DIARY_LEGEND+esc(weatherLegend)+'</p><div class="bp-diary-actions"><button class="btn btn-primary" id="bpDiaryPrint">Просмотр и печать / PDF</button> <button class="btn btn-secondary" id="bpDiaryCSV">Скачать для Excel / Google Таблиц</button></div><p class="muted bp-diary-note">Файл CSV: в Excel выберите импорт UTF-8, разделитель «;». В Google Таблицах: Файл → Импорт → Загрузить, разделитель «;». Это снимок, без автоматической синхронизации.</p><div class="bp-diary-scroll" tabindex="0" role="region" aria-label="Дневник давления, таблица с горизонтальной прокруткой">'+table.replace('<table>','<table class="tbl bp-diary-table'+(withWeather?' bp-diary-table--weather':'')+'">')+'</div>';
 result.querySelector('#bpDiaryPrint').onclick=()=>{if(cur!==person)return;const w=window.open('','_blank');if(!w){status.textContent='Разрешите открытие окна для печати.';return;}w.document.write(html);w.document.close();w.focus();w.print();};
 result.querySelector('#bpDiaryCSV').onclick=()=>{if(cur!==person)return;const url=URL.createObjectURL(new Blob([bpDiaryCSV([headers,...rows])],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='Дневник-давления_'+a+'_'+b+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 }catch(e){if(status.isConnected&&ticket===request)status.textContent='Не удалось получить полный дневник. Проверьте связь и повторите.';}
 };
}
document.addEventListener('click',e=>{if(e.target.closest?.('[data-bpdiary]'))bpDiaryOpen();});
