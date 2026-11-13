import {MIN_YEAR,MAX_YEAR,kinds,icons,dateKey,parseDate,todayKey,addDays,monthCells,upcoming,validDate,colors,eventColor,lunarToSolar,solarToLunar,readLunar,lunarLabel,repeatLabels,defaultRepeatUntil} from '/calendar.js';
const $=id=>document.getElementById(id), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validCode=code=>/^[a-zA-Z0-9_-]{20,128}$/.test(code||'');
let storage;try{storage=localStorage;}catch{}
const textSizes=[100,115,130,150];
let textSize=100;
try{const saved=Number(storage?.getItem('jutopia-text-size'));if(textSizes.includes(saved))textSize=saved;}catch{}
function applyTextSize(size){
  textSize=size;
  document.documentElement.dataset.textSize=String(size);
  $('font-size-value').textContent=`${size}%`;
  $('font-decrease').disabled=size===textSizes[0];
  $('font-increase').disabled=size===textSizes.at(-1);
  $('font-reset').disabled=size===100;
  try{storage?.setItem('jutopia-text-size',String(size));}catch{}
}
$('font-decrease').onclick=()=>applyTextSize(textSizes[Math.max(0,textSizes.indexOf(textSize)-1)]);
$('font-increase').onclick=()=>applyTextSize(textSizes[Math.min(textSizes.length-1,textSizes.indexOf(textSize)+1)]);
$('font-reset').onclick=()=>applyTextSize(100);
applyTextSize(textSize);
const invited=new URLSearchParams(location.hash.slice(1)).get('family');
let remembered;try{remembered=storage?.getItem('jutopia-family');}catch{}
let family=validCode(invited)?invited:validCode(remembered)?remembered:crypto.randomUUID().replaceAll('-','');
function persistFamily(){try{storage?.setItem('jutopia-family',family);}catch{}history.replaceState(null,'',`${location.pathname}${location.search}#family=${family}`);}
persistFamily();
const today=todayKey();let shown=parseDate(today);if(shown.getFullYear()>MAX_YEAR)shown=parseDate('2050-12-01');if(shown.getFullYear()<MIN_YEAR)shown=parseDate('2020-01-01');
let events=[],holidays={},filter='all',editing=null,selectedIcon='',selectedColor='sage',busy=false,requestSequence=0,toastTimer,hasLoaded=false;
for(let y=MIN_YEAR;y<=MAX_YEAR;y++) $('year').add(new Option(`${y}년`,y));
for(let m=0;m<12;m++) $('month').add(new Option(`${m+1}월`,m));
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500);}
function syncStatus(message,failed=false){$('sync-state').replaceChildren(Object.assign(document.createElement('span'),{}),document.createTextNode(message));$('sync-state').classList.toggle('offline',failed);}
async function api(method='GET',body){const response=await fetch('/api/events',{method,headers:{'x-family-code':family,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(12000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'서버에 연결하지 못했습니다.');return result;}
async function loadEvents(quiet=false){const sequence=++requestSequence;try{const result=await api();if(sequence!==requestSequence)return;events=result.events;hasLoaded=true;render();syncStatus('가족과 동기화됨 · 15초마다 갱신');}catch(e){if(sequence!==requestSequence)return;syncStatus(hasLoaded?'연결 끊김 · 재연결 시 자동 갱신':'연결 실패 · 공유 저장소 확인 필요',true);if(!quiet)toast(e.message);}}
function rangeText(e,year=false){const start=parseDate(e.start),end=parseDate(e.end);const f=d=>`${year?`${d.getFullYear()}. `:''}${d.getMonth()+1}. ${d.getDate()}`;return e.start===e.end?`${f(start)} (${['일','월','화','수','목','금','토'][start.getDay()]})`:`${f(start)} — ${f(end)}`;}
function currentEvents(){return events.filter(e=>filter==='all'||e.kind===filter);}
function bindEvent(button,event){let timer,sx,sy,longPressed=false;button.addEventListener('pointerdown',e=>{if(e.button!==0)return;longPressed=false;sx=e.clientX;sy=e.clientY;timer=setTimeout(()=>{longPressed=true;openEvent(event);navigator.vibrate?.(20);},550);});for(const name of ['pointerup','pointercancel','pointerleave'])button.addEventListener(name,()=>clearTimeout(timer));button.addEventListener('pointermove',e=>{if(Math.abs(e.clientX-sx)>9||Math.abs(e.clientY-sy)>9)clearTimeout(timer);});button.addEventListener('contextmenu',e=>{e.preventDefault();clearTimeout(timer);if(!longPressed)openEvent(event);});button.addEventListener('click',e=>{e.stopPropagation();if(!longPressed)openEvent(event);longPressed=false;});}
function renderCalendar(){
  const year=shown.getFullYear(),month=shown.getMonth();
  $('month-label').textContent=`${year}년 ${month+1}월`;$('year').value=year;$('month').value=month;
  $('prev').disabled=year===MIN_YEAR&&month===0;$('next').disabled=year===MAX_YEAR&&month===11;
  $('calendar').setAttribute('aria-label',`${year}년 ${month+1}월 달력`);
  const fragment=document.createDocumentFragment(),filtered=currentEvents();
  for(const cell of monthCells(year,month)){
    const holiday=holidays[cell.date],div=document.createElement('div');
    div.className=`day-cell${cell.outside?' outside':''}${holiday?' holiday':''}${cell.date===today?' is-today':''}`;
    div.dataset.date=cell.date;
    const supported=Number(cell.date.slice(0,4))>=MIN_YEAR&&Number(cell.date.slice(0,4))<=MAX_YEAR;
    div.innerHTML=`<div class="date-line"><button class="date-button" aria-label="${cell.date}${holiday?' '+esc(holiday):''} 일정 등록" ${supported?'':'disabled'} ${cell.date===today?'aria-current="date"':''}>${cell.day}</button>${holiday?`<span class="holiday-name" title="${esc(holiday)}">${esc(holiday)}</span>`:''}</div>`;
    div.addEventListener('click',()=>{if(supported)openEvent(null,cell.date);});
    const dayEvents=filtered.filter(e=>e.start<=cell.date&&e.end>=cell.date),iconEvents=dayEvents.filter(e=>e.icon);
    for(const event of dayEvents){
      const button=document.createElement('button');button.className=`event-chip ${eventColor(event)}${event.start<cell.date?' continuation':''}`;
      button.textContent=event.title;
      button.title=`${event.title} · ${rangeText(event,true)}${lunarLabel(event)?' · '+lunarLabel(event):''}${event.note?'\n'+event.note:''}`;
      button.setAttribute('aria-label',`${event.title}, ${rangeText(event,true)}, 수정 또는 삭제`);bindEvent(button,event);div.append(button);
    }
    if(iconEvents.length){
      const group=document.createElement('div');
      group.className=`day-icons${iconEvents.length>1?' multiple':''}${iconEvents.length>3?' crowded':''}${iconEvents.length>2?' overflow':''}`;
      group.setAttribute('role','group');group.setAttribute('aria-label',`${cell.date} 일정 아이콘 ${iconEvents.length}개`);
      for(const event of iconEvents.slice(0,2)){
        const icon=document.createElement('button');icon.type='button';icon.className='day-icon';icon.textContent=event.icon;
        icon.title=event.title;icon.setAttribute('aria-label',`${event.title}, 일정 수정 또는 삭제`);
        bindEvent(icon,event);group.append(icon);
      }
      if(iconEvents.length>2){
        const more=document.createElement('button');more.type='button';more.className='day-icons-more';more.textContent=`+${iconEvents.length-2}`;
        more.setAttribute('aria-label',`나머지 ${iconEvents.length-2}개 아이콘 일정 보기`);more.title=iconEvents.slice(2).map(event=>event.title).join('\n');
        more.onclick=event=>{event.stopPropagation();showMoreIcons(cell.date,iconEvents.slice(2));};group.append(more);
      }
      div.append(group);
    }
    fragment.append(div);
  }
  $('calendar').replaceChildren(fragment);
}
function showMoreIcons(date,remaining){
  const day=parseDate(date);$('more-icons-title').textContent=`${day.getMonth()+1}월 ${day.getDate()}일 · 더 있는 일정 ${remaining.length}개`;
  $('more-icons-list').replaceChildren(...remaining.map(event=>{
    const button=document.createElement('button');button.type='button';button.className='more-icon-event';
    const icon=document.createElement('span');icon.className='more-icon-symbol';icon.textContent=event.icon;icon.setAttribute('aria-hidden','true');
    const title=document.createElement('span');title.textContent=event.title;button.append(icon,title);
    button.onclick=()=>{$('more-icons-dialog').close();openEvent(event);};return button;
  }));$('more-icons-dialog').showModal();
}
$('close-more-icons').onclick=()=>$('more-icons-dialog').close();
function renderSummary(){for(const kind of ['suwon','ulsan']){const next=events.filter(e=>e.kind===kind&&e.end>=today).sort((a,b)=>a.start.localeCompare(b.start))[0];$(`${kind}-next`).textContent=next?rangeText(next):'아직 정해진 방문이 없어요';$(`${kind}-detail`).textContent=next?(next.note||'함께할 시간을 기다리고 있어요'):'방문 일정을 등록해 보세요';const days=next?Math.round((parseDate(next.start)-parseDate(today))/86400000):null;$(`${kind}-count`).textContent=next?(days<=0?'방문 중':`D−${days}`):'♡';}}
function renderUpcoming(){const list=upcoming(currentEvents());$('upcoming-count').textContent=`${list.length}개의 일정`;const fragment=document.createDocumentFragment();if(!list.length){const empty=document.createElement('div');empty.className='empty-state';empty.innerHTML=`<span class="empty-icon">🌿</span><strong>${hasLoaded?'기다려지는 날을 하나 더해 볼까요?':'가족 달력을 연결하고 있어요'}</strong><p>${hasLoaded?'앞으로 3개월 동안의 일정이 이곳에 모여요.':'연결 후 가족의 일정이 여기에 표시됩니다.'}</p><button>＋ 첫 일정 등록하기</button>`;empty.querySelector('button').onclick=()=>openEvent();fragment.append(empty);}for(const event of list){const d=parseDate(event.start),button=document.createElement('button');button.className='upcoming-item';button.innerHTML=`<div class="upcoming-date"><span>${d.getFullYear()!==Number(today.slice(0,4))?d.getFullYear()+'. ':''}${d.getMonth()+1}월</span>${d.getDate()}</div><div class="upcoming-content"><strong>${esc(event.icon)} ${esc(event.title)}</strong><p>${esc(rangeText(event))}${event.start<today?' · 진행 중':''}${lunarLabel(event)?' · '+esc(lunarLabel(event)):''}</p><span class="category-label ${eventColor(event)}">${kinds[event.kind].label}</span></div>`;bindEvent(button,event);fragment.append(button);}$('upcoming-list').replaceChildren(fragment);}
function render(){renderCalendar();renderSummary();renderUpcoming();if($('search-dialog').open)renderSearch();}
function renderColors(){
  $('color-options').replaceChildren(...Object.entries(colors).map(([color,label])=>{
    const button=document.createElement('button');button.type='button';button.className=`color-option ${color}${selectedColor===color?' selected':''}`;button.textContent=label;button.setAttribute('aria-pressed',String(selectedColor===color));button.setAttribute('aria-label',`${label} 색상`);button.onclick=()=>{selectedColor=color;renderColors();};return button;
  }));
}
for(let year=MIN_YEAR-1;year<=MAX_YEAR;year++)$('lunar-year').add(new Option(`${year}년`,year));
for(let month=1;month<=12;month++)$('lunar-month').add(new Option(`${month}월`,month));
for(let day=1;day<=30;day++)$('lunar-day').add(new Option(`${day}일`,day));
function lunarInput(){return {year:Number($('lunar-year').value),month:Number($('lunar-month').value),day:Number($('lunar-day').value),leap:$('lunar-leap').checked};}
function setLunarInput(value,duration=1){
  const lunar=readLunar(value)||solarToLunar(today);
  $('lunar-year').value=lunar.year;$('lunar-month').value=lunar.month;$('lunar-day').value=lunar.day;$('lunar-leap').checked=lunar.leap;$('lunar-duration').value=duration;
}
function updateLunarPreview(){
  const start=lunarToSolar(lunarInput()),duration=Number($('lunar-duration').value);
  if(!start||!validDate(start)||!Number.isInteger(duration)||duration<1||duration>366){$('lunar-preview').textContent='존재하는 음력 날짜(윤달 여부 포함)와 1~366일의 기간을 선택해 주세요.';return false;}
  const end=addDays(start,duration-1);
  if(!validDate(end)){$('lunar-preview').textContent='2050년 12월 31일까지 표시할 수 있어요.';return false;}
  $('event-start').value=start;$('event-end').value=end;$('event-until').min=start;if($('event-until').value&&$('event-until').value<start)$('event-until').value=start;
  $('lunar-preview').textContent=`달력에 표시되는 양력: ${start}${start===end?'':' ~ '+end}`;return true;
}
function updateCalendarType(convert=true){
  const lunar=$('event-calendar-type').value==='lunar';
  if(lunar&&convert){const start=$('event-start').value||today,end=$('event-end').value||start;setLunarInput(solarToLunar(start),Math.max(1,Math.round((parseDate(end)-parseDate(start))/86400000)+1));}
  $('solar-fields').hidden=lunar;$('lunar-fields').hidden=!lunar;
  $('solar-fields').querySelectorAll('input').forEach(e=>{e.disabled=lunar;e.required=!lunar;});
  $('lunar-fields').querySelectorAll('input,select').forEach(e=>e.disabled=!lunar);
  if(lunar)updateLunarPreview();
}
$('event-calendar-type').onchange=()=>updateCalendarType();
for(const id of ['lunar-year','lunar-month','lunar-day','lunar-leap','lunar-duration'])$(id).addEventListener('change',updateLunarPreview);
function renderIcons(){
  const labels={'':'선택 안 함','🏡':'집','🌷':'꽃','🎂':'생일 케이크','🎉':'축하','🍽️':'식사','✈️':'여행','🏥':'병원','🎒':'학교','💛':'하트','⭐':'별','🎈':'풍선','🎁':'선물','👨‍👩‍👧‍👦':'가족','🚗':'자동차','📚':'책','🎵':'음악','⚽':'축구','🛍️':'쇼핑','🐾':'반려동물','🍀':'행운'};
  $('icon-options').replaceChildren(...icons.map(icon=>{
    const button=document.createElement('button');button.type='button';button.className='icon-option'+(icon===''?' no-icon':'')+(icon===selectedIcon?' selected':'');
    button.textContent=icon||'선택 안 함';button.title=labels[icon];button.setAttribute('aria-label',labels[icon]);button.setAttribute('aria-pressed',String(icon===selectedIcon));
    button.onclick=()=>{selectedIcon=icon;renderIcons();};return button;
  }));
}
function updateRepeat(){const repeats=$('event-repeat').value!=='none';$('until-label').hidden=!repeats;$('event-until').required=false;$('event-until').disabled=!repeats;$('event-until').min=$('event-start').value;$('event-until').title=`비우면 ${defaultRepeatUntil($('event-start').value||today)}까지 반복`;}
function openEvent(event=null,date=today){if(busy)return;editing=event?{...event}:null;$('event-form').reset();$('form-error').textContent='';$('dialog-title').textContent=event?'일정 수정':'새로운 일정';$('event-kind').value=event?.kind||'suwon';$('event-title').value=event?.title||'수원';$('event-start').value=event?.start||date;$('event-end').value=event?.end||date;$('event-note').value=event?.note||'';$('event-repeat').value=event?.repeat_rule||'none';$('repeat-current').hidden=!event;$('repeat-current').textContent=event?`현재 저장된 설정: ${repeatLabels[event.repeat_rule]||repeatLabels.none}${event.repeat_rule&&event.repeat_rule!=='none'&&event.repeat_until?' · 종료 '+event.repeat_until:''}`:'';$('event-until').value=event?.repeat_until||'';$('repeat-fields').hidden=false;$('repeat-help').hidden=false;$('repeat-help').open=false;$('delete').hidden=!event;selectedIcon=event?.icon??'';selectedColor=event?eventColor(event):kinds.suwon.color;$('event-calendar-type').value=event?.calendar_type||'solar';setLunarInput(event?.lunar_start||solarToLunar(event?.start||date),event?Math.round((parseDate(event.end)-parseDate(event.start))/86400000)+1:1);renderIcons();renderColors();updateCalendarType(false);updateRepeat();$('event-dialog').showModal();}
$('add').onclick=()=>openEvent();$('event-kind').onchange=()=>{const kind=$('event-kind').value;selectedIcon=kind==='birthday'?'🎂':'';selectedColor=kinds[kind].color;renderIcons();renderColors();if(!editing||['수원','울산','수원 할머니 방문','울산 할머니 방문','가족 생일','가족 행사'].includes($('event-title').value))$('event-title').value=kind==='birthday'?'가족 생일':kind==='family'?'가족 행사':kind==='suwon'?'수원':'울산';};$('event-repeat').onchange=updateRepeat;$('event-start').onchange=()=>{if($('event-end').value<$('event-start').value)$('event-end').value=$('event-start').value;updateRepeat();};
function setBusy(value){busy=value;$('event-form').querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=value);$('save').textContent=value?'저장 중…':'저장하기';if(!value){updateCalendarType(false);updateRepeat();}}
$('event-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>{if(!busy)$('event-dialog').close();});
let choosingScope=false;
function chooseSaveScope(){
  const dialog=$('scope-dialog');dialog.returnValue='';
  return new Promise(resolve=>{dialog.addEventListener('close',()=>resolve(['one','series'].includes(dialog.returnValue)?dialog.returnValue:null),{once:true});dialog.showModal();});
}
document.querySelectorAll('[data-save-scope]').forEach(button=>button.onclick=()=>$('scope-dialog').close(button.dataset.saveScope));
$('event-form').onsubmit=async e=>{e.preventDefault();if(busy||choosingScope)return;if($('event-calendar-type').value==='lunar'&&!updateLunarPreview()){$('form-error').textContent=$('lunar-preview').textContent;return;}const event={title:$('event-title').value,kind:$('event-kind').value,icon:selectedIcon,color:selectedColor,calendar_type:$('event-calendar-type').value,lunar_start:$('event-calendar-type').value==='lunar'?JSON.stringify(lunarInput()):'',start:$('event-start').value,end:$('event-end').value,note:$('event-note').value,repeat:$('event-repeat').value,until:$('event-until').value,...(editing?{id:editing.id,revision:editing.revision}:{})};if(event.end<event.start){$('form-error').textContent='종료일은 시작일 이후로 선택해 주세요.';return;}if(editing?.series_id&&editing.repeat_rule!=='none'){
  const changed=['title','kind','icon','color','note'].some(field=>(field==='title'||field==='note'?event[field].trim():event[field])!==(field==='color'?eventColor(editing):editing[field]));
  if(changed){choosingScope=true;let scope;try{scope=await chooseSaveScope();}finally{choosingScope=false;}if(!scope)return;event.apply_scope=scope;}
}setBusy(true);++requestSequence;try{const result=await api(editing?'PUT':'POST',event);$('event-dialog').close();toast(event.apply_scope==='series'&&result.updated_count>1?`반복 일정 ${result.updated_count}개에 변경 사항을 적용했어요.`:result.count>1?`${result.count}개의 반복 일정을 저장했어요.`:'일정을 저장했어요. 가족에게 곧 반영됩니다.');await loadEvents();}catch(error){$('form-error').textContent=error.message;syncStatus('저장 실패 · 다시 시도해 주세요',true);await loadEvents(true);}finally{setBusy(false);}};
$('delete').onclick=()=>$('confirm-dialog').showModal();$('cancel-delete').onclick=()=>$('confirm-dialog').close();$('confirm-delete').onclick=async()=>{if(busy||!editing)return;$('confirm-delete').disabled=true;setBusy(true);++requestSequence;try{await api('DELETE',{id:editing.id,revision:editing.revision});$('confirm-dialog').close();$('event-dialog').close();toast('일정을 삭제했어요.');await loadEvents();}catch(e){$('confirm-dialog').close();$('form-error').textContent=e.message;await loadEvents(true);}finally{$('confirm-delete').disabled=false;setBusy(false);}};
function moveMonth(delta){const d=new Date(shown.getFullYear(),shown.getMonth()+delta,1,12);if(d.getFullYear()<MIN_YEAR||d.getFullYear()>MAX_YEAR)return;shown=d;renderCalendar();}$('prev').onclick=()=>moveMonth(-1);$('next').onclick=()=>moveMonth(1);$('today').onclick=()=>{shown=parseDate(today);if(shown.getFullYear()>MAX_YEAR)shown=parseDate('2050-12-01');renderCalendar();};for(const id of ['year','month'])$(id).onchange=()=>{shown=new Date(Number($('year').value),Number($('month').value),1,12);renderCalendar();};$('filters').onclick=e=>{const button=e.target.closest('[data-kind]');if(!button)return;filter=button.dataset.kind;document.querySelectorAll('.filter').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});renderCalendar();renderUpcoming();};
$('share').onclick=()=>{$('share-link').value=`${location.origin}${location.pathname}#family=${family}`;$('share-dialog').showModal();};document.querySelector('.close-share').onclick=()=>$('share-dialog').close();$('copy-link').onclick=async()=>{try{await navigator.clipboard.writeText($('share-link').value);toast('가족 초대 링크를 복사했어요.');}catch{$('share-link').select();toast('링크를 선택했어요. 복사해서 가족에게 보내 주세요.');}};$('join').onclick=()=>{let code=$('join-code').value.trim();try{if(code.includes('#'))code=new URLSearchParams(new URL(code).hash.slice(1)).get('family');}catch{}if(!validCode(code)){toast('올바른 초대 링크나 공유 코드를 입력해 주세요.');return;}family=code;persistFamily();events=[];hasLoaded=false;render();$('share-dialog').close();syncStatus('가족 달력 연결 중');loadEvents();};
$('holiday-info').onclick=()=>toast('2020–2050년 한국 공휴일·음력 명절·대체공휴일 포함. 향후 지정되는 임시공휴일과 법령 변경은 데이터 갱신 후 반영됩니다.');
render();fetch('/holidays.json').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>{holidays=data;renderCalendar();}).catch(()=>toast('공휴일 정보를 불러오지 못했어요. 새로고침해 주세요.'));
loadEvents();setInterval(()=>{if(!document.hidden&&!busy)loadEvents(true);},15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy)loadEvents(true);});window.addEventListener('online',()=>loadEvents(true));window.addEventListener('offline',()=>syncStatus('오프라인 · 인터넷 연결을 확인해 주세요',true));

let swipeStart=null,swipeWasHorizontal=false,suppressCalendarClickUntil=0;
$('calendar').addEventListener('touchstart',event=>{
  if(event.touches.length!==1){swipeStart=null;return;}
  swipeStart={x:event.touches[0].clientX,y:event.touches[0].clientY,time:Date.now()};swipeWasHorizontal=false;
},{passive:true});
$('calendar').addEventListener('touchmove',event=>{
  if(!swipeStart||event.touches.length!==1)return;
  const dx=event.touches[0].clientX-swipeStart.x,dy=event.touches[0].clientY-swipeStart.y;
  if(Math.abs(dx)>25&&Math.abs(dx)>Math.abs(dy)*1.5){swipeWasHorizontal=true;suppressCalendarClickUntil=Date.now()+500;}
},{passive:true});
$('calendar').addEventListener('touchend',event=>{
  if(!swipeStart)return;const point=event.changedTouches[0];
  const dx=point.clientX-swipeStart.x,dy=point.clientY-swipeStart.y;
  if(swipeWasHorizontal&&Math.abs(dx)>=60&&Math.abs(dx)>Math.abs(dy)*1.5&&Date.now()-swipeStart.time<1000&&!$('event-dialog').open){moveMonth(dx<0?1:-1);suppressCalendarClickUntil=Date.now()+500;}
  swipeStart=null;
},{passive:true});
$('calendar').addEventListener('touchcancel',()=>{swipeStart=null;},{passive:true});
$('calendar').addEventListener('click',event=>{if(Date.now()<suppressCalendarClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);

let searchLimit=30;
function renderSearch(){
  const query=$('search-query').value.normalize('NFKC').trim().toLocaleLowerCase();
  const matches=events.filter(event=>!query||[event.title,event.note,kinds[event.kind].label,event.start,event.end,lunarLabel(event)].join(' ').normalize('NFKC').toLocaleLowerCase().includes(query)).sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title));
  $('search-status').textContent=query?`전체 기간에서 ${matches.length}개의 일정을 찾았어요.`:`전체 기간의 일정 ${matches.length}개 · 검색어를 입력해 보세요.`;
  const items=matches.slice(0,searchLimit).map(event=>{const button=document.createElement('button');button.type='button';button.className='search-result';button.innerHTML=`<strong>${event.icon?esc(event.icon)+' ':''}${esc(event.title)}</strong><span>${esc(rangeText(event,true))}${lunarLabel(event)?' · '+esc(lunarLabel(event)):''}</span>${event.note?`<small>${esc(event.note.slice(0,120))}</small>`:''}`;button.onclick=()=>{$('search-dialog').close();openEvent(event);};return button;});
  $('search-results').replaceChildren(...items);$('search-more').hidden=matches.length<=searchLimit;
}
$('search').onclick=()=>{searchLimit=30;renderSearch();$('search-dialog').showModal();$('search-query').focus();};$('close-search').onclick=()=>$('search-dialog').close();$('search-query').oninput=()=>{searchLimit=30;renderSearch();};$('search-more').onclick=()=>{searchLimit+=30;renderSearch();};
