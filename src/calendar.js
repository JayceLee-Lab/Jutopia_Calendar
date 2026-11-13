import { lunarMonths } from './lunar-data.js';
export const MIN_YEAR = 2020, MAX_YEAR = 2050;
export const icons = ['','🏡','🌷','🎂','🎉','🍽️','✈️','🏥','🎒','💛','⭐','🎈','🎁','👨‍👩‍👧‍👦','🚗','📚','🎵','⚽','🛍️','🐾','🍀'];
export const kinds = { suwon: { label: '수원 할머니', title: '수원 할머니 방문', color: 'suwon', icon: '🌷' }, ulsan: { label: '울산 할머니', title: '울산 할머니 방문', color: 'ulsan', icon: '🏡' }, birthday: { label: '생일', color: 'lavender', icon: '🎂' }, family: { label: '가족 행사', color: 'blue', icon: '🎉' } };
export const repeatLabels = {none:'반복 안 함',weekly:'매주',monthly:'매월',yearly:'매년'};
export const colors = {sage:'세이지',peach:'살구',lavender:'라벤더',blue:'하늘',pink:'분홍',butter:'버터',mint:'민트',lilac:'라일락',aqua:'아쿠아',sand:'모래',suwon:'수원 할머니',ulsan:'울산 할머니'};
export function eventColor(event) {if(event.kind==='suwon'||event.kind==='ulsan')return kinds[event.kind].color;return Object.hasOwn(colors,event.color)&&!['suwon','ulsan'].includes(event.color)?event.color:kinds[event.kind].color;}
export function isGrandmaEvent(event){return event.kind==='suwon'||event.kind==='ulsan';}
export function readLunar(value) {try {return typeof value==='string'?JSON.parse(value):value;} catch {return null;}}
export function lunarToSolar(value) {
  const lunar=readLunar(value);
  if(!lunar || !Number.isInteger(lunar.year) || !Number.isInteger(lunar.month) || !Number.isInteger(lunar.day) || typeof lunar.leap!=='boolean') return null;
  const month=lunarMonths.find(m=>m[0]===lunar.year&&m[1]===lunar.month&&Boolean(m[2])===lunar.leap);
  return month&&lunar.day>=1&&lunar.day<=month[4]?addDays(month[3],lunar.day-1):null;
}
export function solarToLunar(date) {
  if(!validDate(date))return null;
  const month=lunarMonths.find(m=>date>=m[3]&&date<=addDays(m[3],m[4]-1));
  return month?{year:month[0],month:month[1],day:Math.round((parseDate(date)-parseDate(month[3]))/86400000)+1,leap:Boolean(month[2])}:null;
}
export function lunarLabel(event) {const value=readLunar(event.lunar_start);return event.calendar_type==='lunar'&&value?`음력 ${value.leap?'윤 ':''}${value.month}월 ${value.day}일`:'';}
export function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function parseDate(value) { return new Date(`${value}T12:00:00`); }
export function addDays(value, n) { const d=parseDate(value); d.setDate(d.getDate()+n); return dateKey(d); }
export function todayKey() { return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function validDate(s) { return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number(s.slice(0,4))>=MIN_YEAR && Number(s.slice(0,4))<=MAX_YEAR && dateKey(parseDate(s))===s; }
export function defaultRepeatUntil(start){const d=parseDate(start),year=Math.min(d.getFullYear()+10,MAX_YEAR);return dateKey(new Date(year,d.getMonth(),Math.min(d.getDate(),new Date(year,d.getMonth()+1,0).getDate()),12));}
export function expandEvent(event, repeat='none', until=defaultRepeatUntil(event.start)) {
  if (!validDate(event.start) || !validDate(event.end) || event.end<event.start) throw new Error('시작일과 종료일을 확인해 주세요.');
  if (!Object.hasOwn(repeatLabels,repeat)) throw new Error('반복 설정을 확인해 주세요.');
  if (repeat==='none') return [event];
  if(!until)until=defaultRepeatUntil(event.start);
  if (!validDate(until) || until<event.start) throw new Error('반복 종료일을 확인해 주세요.');
  const out=[]; const duration=Math.round((parseDate(event.end)-parseDate(event.start))/86400000);
  if (repeat==='monthly' && event.calendar_type==='lunar') {
    const lunar=readLunar(event.lunar_start);
    if(!lunar||lunarToSolar(lunar)!==event.start)throw new Error('음력 날짜를 확인해 주세요.');
    for(const month of lunarMonths){
      const occurrence={year:month[0],month:month[1],leap:Boolean(month[2]),day:Math.min(lunar.day,month[4])};
      const start=lunarToSolar(occurrence);
      if(start<event.start||start>until||!validDate(start))continue;
      const end=addDays(start,duration);
      if(validDate(end))out.push({...event,start,end,lunar_start:JSON.stringify(occurrence)});
    }
    return out;
  }
  if (repeat==='yearly' && event.calendar_type==='lunar') {
    const lunar=readLunar(event.lunar_start);
    if(!lunar || lunarToSolar(lunar)!==event.start)throw new Error('음력 날짜를 확인해 주세요.');
    for(let year=lunar.year;year<=MAX_YEAR;year++) {
      let occurrence={...lunar,year};
      let start=lunarToSolar(occurrence);
      if(!start&&lunar.day===30){occurrence={...occurrence,day:29};start=lunarToSolar(occurrence);}
      if(!start||start>until||!validDate(start))continue;
      const end=addDays(start,duration);
      if(validDate(end))out.push({...event,start,end,lunar_start:JSON.stringify(occurrence)});
    }
    return out;
  }
  let start=event.start;
  for (let i=0;start<=until;i++) {
    const end=addDays(start,duration);
    if (!validDate(end)) break;
    out.push({...event,start,end,...(event.calendar_type==='lunar'?{lunar_start:JSON.stringify(solarToLunar(start))}:{})});
    if (repeat==='weekly') start=addDays(start,7);
    else if(repeat==='monthly'){
      const initial=parseDate(event.start),next=new Date(initial.getFullYear(),initial.getMonth()+i+1,1,12);
      const day=Math.min(initial.getDate(),new Date(next.getFullYear(),next.getMonth()+1,0).getDate());
      next.setDate(day);start=dateKey(next);
    }
    else {
      const year=Number(event.start.slice(0,4))+i+1;
      start=`${year}${event.start.slice(4)}`;
      if (!validDate(start) && event.start.endsWith('02-29')) start=`${year}-02-28`;
    }
    if (out.length>2000) throw new Error('반복 일정이 너무 많습니다.');
  }
  return out;
}
export function monthCells(year,month) { const first=new Date(year,month,1,12), count=new Date(year,month+1,0).getDate(); const total=Math.ceil((first.getDay()+count)/7)*7; return Array.from({length:total},(_,i)=>{ const d=new Date(year,month,i-first.getDay()+1,12);return {date:dateKey(d),day:d.getDate(),outside:d.getMonth()!==month}; }); }
export function upcoming(events,today=todayKey()) { const end=parseDate(today); const day=end.getDate();end.setDate(1);end.setMonth(end.getMonth()+3);end.setDate(Math.min(day,new Date(end.getFullYear(),end.getMonth()+1,0).getDate()));return events.filter(e=>e.end>=today&&e.start<=dateKey(end)).sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title)); }

export function layoutWeekEvents(events,cells,{singleDayAsBars=false}={}){
  const dates=cells.map(cell=>typeof cell==='string'?cell:cell.date),first=dates[0],last=dates.at(-1);
  const visible=events.filter(event=>event.start<=last&&event.end>=first);
  const masks=[],periods=[];
  for(const event of visible.filter(e=>singleDayAsBars||e.start!==e.end).sort((a,b)=>a.start.localeCompare(b.start)||b.end.localeCompare(a.end)||String(a.id).localeCompare(String(b.id)))){
    const startColumn=event.start<first?0:dates.indexOf(event.start),endColumn=event.end>last?dates.length-1:dates.indexOf(event.end);
    let lane=0;while(masks[lane]?.some((used,column)=>used&&column>=startColumn&&column<=endColumn))lane++;
    if(!masks[lane])masks[lane]=Array(dates.length).fill(false);
    for(let column=startColumn;column<=endColumn;column++)masks[lane][column]=true;
    periods.push({event,startColumn,endColumn,lane,starts:event.start>=first,ends:event.end<=last});
  }
  const singles=dates.map(date=>singleDayAsBars?[]:visible.filter(event=>event.start===date&&event.end===date));
  return {periods,singles,periodLaneCount:masks.length,eventRowCount:masks.length+Math.max(0,...singles.map(items=>items.length))};
}
