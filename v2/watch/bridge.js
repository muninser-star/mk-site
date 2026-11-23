(function(){
"use strict";
/* MEDBOOK_WATCH_BRIDGE_V2 — separate wearable timeline events, clickable trends. No credentials stored here. */
const API="https://cuhplpukqhdfutcymtmv.supabase.co/functions/v1/wearable-metrics";
const TITLES={steps:"👣 Шаги",heart_rate_avg:"❤️ Пульс за день",heart_rate_min:"Пульс минимум",heart_rate_max:"Пульс максимум",resting_heart_rate:"🫀 Пульс в покое",sleep_minutes:"🌙 Сон",active_kcal:"🔥 Активные калории",resting_kcal:"🌿 Калории в покое",total_kcal:"⚡ Всего калорий"};
const ORDER=["steps","heart_rate_avg","resting_heart_rate","sleep_minutes","active_kcal"];
let rows=[],started=0,pending=false,ready=false;
const validDay=d=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d);
const fmt=(x,digits=0)=>Number(x).toLocaleString("ru-RU",{maximumFractionDigits:digits});
const val=(row,type)=>row==null?null:type==="sleep_minutes"?fmt(Number(row.value_num)/60,1)+" ч":type==="steps"?fmt(row.value_num)+" шагов":type==="heart_rate_avg"||type==="resting_heart_rate"?fmt(row.value_num,1)+" уд/мин":fmt(row.value_num)+" ккал";
const safe=(s)=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function group(){
 const days=new Map();
 for(const r of rows){
   if(!days.has(r.day))days.set(r.day,{});
   days.get(r.day)[r.metric]=r;
 }
 return [...days].map(([d,metrics])=>({d,k:"watch",t:"Данные с часов",sys:null,st:"",r:{metrics}}))
  .sort((a,b)=>b.d.localeCompare(a.d));
}
function summary(metrics){
 return ORDER.filter(k=>metrics[k]).map(k=>TITLES[k]+": "+val(metrics[k],k));
}
async function load(key,person,onReady){
 if(person!=="denis"||!key||key.length<20||pending||Date.now()-started<15*60*1000)return;
 pending=true;started=Date.now();
 try{
  const to=new Date();const local=new Date(to.getTime()-to.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const response=await fetch(API,{method:"POST",headers:{"content-type":"application/json","x-mk-key":key},
   body:JSON.stringify({action:"list",person:"denis",from:"2026-10-01",to:local}),cache:"no-store"});
  if(!response.ok)throw Error("watch_access");
  const payload=await response.json();if(payload.status!=="ok"||!Array.isArray(payload.rows))throw Error("watch_response");
  rows=payload.rows.filter(r=>r&&validDay(r.day)&&TITLES[r.metric]&&Number.isFinite(+r.value_num)&&+r.value_num>=0);
  ready=true;
  if(typeof onReady==="function")onReady();
 }catch(_){started=0;}finally{pending=false;}
}
// Wearable metrics are a distinct timeline type; legacy life_events are suppressed after loading.
function isReady(){return ready;}
function events(person){return person==="denis"&&ready?group():[];}
function eventHtml(e,esc,icon){
 const ss=typeof esc==="function"?esc:safe;
 const metrics=e.r&&e.r.metrics||{};
 const details=summary(metrics);
 const partial=Object.values(metrics).some(r=>r.quality==="partial");
 const hasHuawei=Object.values(metrics).some(r=>r.source==="huawei_health");
 const fallback=Object.values(metrics).some(r=>r.quality==="suspect");
 const label="Показатели за "+e.d.split("-").reverse().join(".");
 const ico=typeof icon==="function"?icon("dynamics"):"";
 return '<a class="tl-item tl-item--nodate is-link" href="/v2/watch/?day='+encodeURIComponent(e.d)+'" style="color:inherit;text-decoration:none" aria-label="'+ss(label)+' — открыть динамику">'
   +'<div class="tl-ic">'+ico+'</div><div style="min-width:0">'
   +'<div class="tl-title" style="display:flex;flex-wrap:wrap;gap:4px 12px">'
   +details.map(line=>'<span>'+ss(line)+'</span>').join('')+'</div>'
   +(partial?'<div class="tl-meta">⏳ День ещё не завершён</div>':'')
   +(fallback?'<div class="tl-meta">⚠️ Возможны шаги телефона</div>':'')
   +'<div class="tl-meta">📈 Смотреть динамику →</div>'
   +'</div></a>';
}
function homeHtml(person,esc){
 if(person!=="denis")return "";
 const ss=typeof esc==="function"?esc:safe;
 const e=group()[0];
 const details=e?summary(e.r.metrics).slice(0,4):[];
 const label=e?'Последние данные за '+e.d.split("-").reverse().join("."):'Автоматические данные часов';
 return '<div class="card"><div class="watchhead"><h2>Активность с часов</h2><a href="/v2/watch/" class="eplink" style="white-space:nowrap">Графики →</a></div>'
  +'<div class="muted" style="font-size:13px;margin-bottom:8px">'+ss(label)+'</div>'
  +(details.length?'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">'+details.map(x=>'<span class="tag tag--gray">'+ss(x)+'</span>').join('')+'</div>':'')
  +'<a href="/v2/watch/" class="eplink" style="display:inline-block;padding:6px 0">История и все показатели →</a></div>';
}
window.mkWatch=Object.freeze({load,events,isReady,eventHtml,homeHtml});
})();