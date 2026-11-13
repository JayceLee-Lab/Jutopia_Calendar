import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {validDate,expandEvent,monthCells,upcoming,lunarToSolar,solarToLunar,eventColor} from '../src/calendar.js';
import worker from '../dist/server/index.js';
const event={title:'수원 할머니 방문',kind:'suwon',icon:'🌷',start:'2026-11-13',end:'2026-11-15',note:'아이들과 함께'};
const holidays=JSON.parse(readFileSync('data/holidays.json','utf8'));
test('all months through 2035 have complete Sunday-first calendar grids',()=>{for(let y=2020;y<=2035;y++)for(let m=0;m<12;m++){const cells=monthCells(y,m);assert.equal(cells.length%7,0);assert.equal(cells.filter(c=>!c.outside).length,new Date(y,m+1,0).getDate());assert.equal(new Date(cells[0].date+'T12:00').getDay(),0);}});
test('invalid dates and out-of-range dates are rejected',()=>{assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2036-01-01'),false);assert.equal(validDate('2028-02-29'),true);});
test('fortnightly visits preserve duration across month and year boundaries',()=>{const expanded=expandEvent({...event,start:'2026-12-25',end:'2026-12-27'},'biweekly','2027-01-31');assert.deepEqual(expanded.map(e=>[e.start,e.end]),[['2026-12-25','2026-12-27'],['2027-01-08','2027-01-10'],['2027-01-22','2027-01-24']]);});
test('leap day birthdays remain annual and never exceed 2035',()=>{const dates=expandEvent({...event,start:'2028-02-29',end:'2028-02-29'},'yearly','2035-12-31').map(e=>e.start);assert.equal(dates.length,8);assert.equal(dates[1],'2029-02-28');assert.equal(dates[4],'2032-02-29');assert.equal(dates.at(-1),'2035-02-28');});
test('upcoming includes active visits and exactly three calendar months',()=>{const events=[{start:'2026-10-30',end:'2026-11-14',title:'A'},{start:'2027-02-13',end:'2027-02-13',title:'B'},{start:'2027-02-14',end:'2027-02-14',title:'C'}];assert.deepEqual(upcoming(events,'2026-11-13').map(e=>e.title),['A','B']);});
test('Korean lunar, substitute, election, and 2035 holidays are bundled',()=>{assert.match(holidays['2026-02-17'],/설날/);assert.match(holidays['2026-09-25'],/추석/);assert.match(holidays['2026-03-02'],/대체/);assert.match(holidays['2026-06-03'],/선거/);assert.ok(holidays['2035-12-25']);for(let y=2020;y<=2035;y++)assert.ok(Object.keys(holidays).filter(d=>d.startsWith(String(y))).length>=15);});
function database(){const db=new DatabaseSync(':memory:');for(const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+file,'utf8'));const prepare=sql=>{let args=[];return{bind(...a){args=a;return this;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:db.prepare(sql).run(...args)};}};};return {DB:{prepare,async batch(items){db.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}}};}
const familyA='a'.repeat(32),familyB='b'.repeat(32);
const request=(env,method='GET',body,code=familyA)=>worker.fetch(new Request('https://calendar.example/api/events',{method,headers:{'x-family-code':code,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
test('shared API persists, isolates families, updates, detects stale edits, and deletes',async()=>{const env=database();assert.equal((await request(env,'POST',event)).status,201);const {events}=await (await request(env)).json();assert.equal(events.length,1);assert.equal(events[0].title,event.title);assert.equal((await (await request(env,'GET',null,familyB)).json()).events.length,0);const saved=events[0];assert.equal((await request(env,'PUT',{...saved,title:'변경됨'})).status,200);assert.equal((await request(env,'PUT',saved)).status,409);assert.equal((await request(env,'DELETE',{id:saved.id,revision:1})).status,409);assert.equal((await request(env,'DELETE',{id:saved.id,revision:2},familyB)).status,409);assert.equal((await request(env,'DELETE',{id:saved.id,revision:2})).status,200);assert.equal((await (await request(env)).json()).events.length,0);});
test('API repetition and validation do not partially save invalid events',async()=>{const env=database();const response=await request(env,'POST',{...event,repeat:'biweekly',until:'2026-12-15'});assert.equal((await response.json()).count,3);assert.equal((await request(env,'POST',{...event,start:'2026-02-30'})).status,400);assert.equal((await request(env,'POST',{...event,repeat:'invalid'})).status,400);assert.equal((await request(env,'GET',null,'short')).status,401);assert.equal((await request({},'POST',event)).status,503);assert.equal((await (await request(env)).json()).events.length,3);});
test('static page and assets are self-contained and reject untrusted cross-origin writes',async()=>{const response=await worker.fetch(new Request('https://calendar.example/'),{});assert.equal(response.status,200);assert.match(await response.text(),/함께하는 날들이 모이는 곳/);assert.ok(response.headers.get('content-security-policy'));const result=await worker.fetch(new Request('https://calendar.example/api/events',{method:'POST',headers:{origin:'https://other.example','x-family-code':familyA},body:JSON.stringify(event)}),database());assert.equal(result.status,403);});

test('schema upgrade preserves existing records, revisions, and original colors',async()=>{
  const db=new DatabaseSync(':memory:');db.exec(readFileSync('migrations/0001_calendar.sql','utf8'));
  db.prepare('INSERT INTO events(id,family,title,kind,icon,start,end,note,revision,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run('old-record','existing-family','기존 가족 기록','ulsan','🏡','2026-11-13','2026-11-14','보존할 메모',7,'2026-11-01');
  db.exec(readFileSync('migrations/0002_lunar_colors.sql','utf8'));
  const row=db.prepare('SELECT * FROM events').get();assert.equal(row.title,'기존 가족 기록');assert.equal(row.note,'보존할 메모');assert.equal(row.revision,7);assert.equal(row.calendar_type,'solar');assert.equal(row.lunar_start,'');assert.equal(eventColor(row),'peach');
});
test('Korean lunar conversion agrees with all bundled lunar public holidays through 2035',()=>{
  for(let year=2020;year<=2035;year++){
    for(const [month,day,name] of [[1,1,'설날'],[4,8,'부처님오신날'],[8,15,'추석']]){
      const solar=lunarToSolar({year,month,day,leap:false});assert.match(holidays[solar],new RegExp(name),`${year} ${month}/${day}`);
      assert.deepEqual(solarToLunar(solar),{year,month,day,leap:false});
    }
  }
  assert.equal(lunarToSolar({year:2025,month:6,day:1,leap:true}),'2025-07-25');
  assert.equal(lunarToSolar({year:2026,month:6,day:1,leap:true}),null);
});
test('lunar annual recurrence follows lunar dates and skips missing leap months',()=>{
  const lunar={year:2026,month:1,day:1,leap:false};
  const annual=expandEvent({...event,start:'2026-02-17',end:'2026-02-17',calendar_type:'lunar',lunar_start:JSON.stringify(lunar)},'yearly','2028-12-31');
  assert.deepEqual(annual.map(e=>e.start),['2026-02-17','2027-02-07','2028-01-27']);
  assert.deepEqual(JSON.parse(annual[1].lunar_start),{...lunar,year:2027});
  const leap={year:2025,month:6,day:1,leap:true};
  const leapEvents=expandEvent({...event,start:'2025-07-25',end:'2025-07-25',calendar_type:'lunar',lunar_start:JSON.stringify(leap)},'yearly','2026-12-31');
  assert.deepEqual(leapEvents.map(e=>e.start),['2025-07-25']);
});
test('lunar 30th day annual fallback is the 29th only when the month is shorter',()=>{
  const lunar={year:2025,month:1,day:30,leap:false},start=lunarToSolar(lunar);
  const annual=expandEvent({...event,start,end:start,calendar_type:'lunar',lunar_start:JSON.stringify(lunar)},'yearly','2035-12-31');
  assert.ok(annual.length>5);
  for(const row of annual){const value=JSON.parse(row.lunar_start);assert.equal(value.month,1);assert.equal(row.start,lunarToSolar(value));if(value.day===29)assert.equal(lunarToSolar({...value,day:30}),null);else assert.equal(value.day,30);}
});
test('API saves selected pastel color and lunar metadata, and rejects inconsistent dates',async()=>{
  const env=database(),lunar={year:2026,month:8,day:15,leap:false};
  const body={...event,title:'음력 생일',kind:'birthday',start:'2026-09-25',end:'2026-09-25',calendar_type:'lunar',lunar_start:JSON.stringify(lunar),color:'mint',repeat:'yearly',until:'2028-12-31'};
  assert.equal((await request(env,'POST',body)).status,201);
  const saved=(await (await request(env)).json()).events;assert.equal(saved.length,3);
  for(const row of saved){assert.equal(row.color,'mint');assert.equal(row.calendar_type,'lunar');assert.equal(lunarToSolar(row.lunar_start),row.start);}
  const updated={...saved[0],color:'pink'};assert.equal((await request(env,'PUT',updated)).status,200);assert.equal((await (await request(env)).json()).events[0].color,'pink');
  assert.equal((await request(env,'POST',{...body,start:'2026-09-26',end:'2026-09-26'})).status,400);
  assert.equal((await request(env,'POST',{...body,color:'untrusted-color'})).status,400);
  assert.equal((await (await request(env)).json()).events.length,3);
});

test('API accepts and preserves an explicitly unselected icon',async()=>{
  const env=database();assert.equal((await request(env,'POST',{...event,icon:''})).status,201);
  const saved=(await (await request(env)).json()).events[0];assert.equal(saved.icon,'');
  assert.equal((await request(env,'PUT',{...saved,title:'아이콘 없는 일정 수정'})).status,200);
  assert.equal((await (await request(env)).json()).events[0].icon,'');
});

test('editing recurrence rebuilds only selected and future occurrences and preserves history',async()=>{
  const env=database();await request(env,'POST',{...event,repeat:'biweekly',until:'2026-12-31'});
  let rows=(await (await request(env)).json()).events;assert.equal(rows.length,4);assert.equal(new Set(rows.map(e=>e.series_id)).size,1);assert.ok(rows[0].series_id);assert.ok(rows.every(e=>e.repeat_rule==='biweekly'));
  const past={...rows[0]},selected={...rows[1]};
  assert.equal((await request(env,'PUT',{...selected,repeat:'yearly',until:'2028-12-31'})).status,200);
  rows=(await (await request(env)).json()).events;
  assert.deepEqual(rows.map(e=>e.start),['2026-11-13','2026-11-27','2027-11-27','2028-11-27']);
  const preserved=rows.find(e=>e.id===past.id);assert.equal(preserved.title,past.title);assert.equal(preserved.note,past.note);assert.equal(preserved.repeat_until,'2026-11-26');
  const changed=rows.find(e=>e.id===selected.id);assert.equal(changed.repeat_rule,'yearly');assert.notEqual(changed.series_id,past.series_id);
  assert.equal((await request(env,'PUT',{...changed,repeat:'none'})).status,200);
  rows=(await (await request(env)).json()).events;assert.deepEqual(rows.map(e=>e.start),['2026-11-13','2026-11-27']);assert.equal(rows[1].repeat_rule,'none');
});
test('editing title only preserves a series, and stale repeat edits cannot delete or insert records',async()=>{
  const env=database();await request(env,'POST',{...event,repeat:'biweekly',until:'2026-12-15'});
  const original=(await (await request(env)).json()).events,first=original[0];
  assert.equal((await request(env,'PUT',{...first,title:'선택한 일정만 수정',repeat:'biweekly',until:first.repeat_until})).status,200);
  let rows=(await (await request(env)).json()).events;assert.equal(rows.length,3);assert.equal(rows[1].title,event.title);
  assert.equal((await request(env,'PUT',{...first,repeat:'none'})).status,409);
  rows=(await (await request(env)).json()).events;assert.equal(rows.length,3);
  assert.equal((await (await request(env,'GET',null,familyB)).json()).events.length,0);
});
test('a legacy independent record can gain recurrence without touching other independent records',async()=>{
  const env=database();await request(env,'POST',event);await request(env,'POST',{...event,start:'2026-11-27',end:'2026-11-29',title:'기존 별도 일정'});
  const first=(await (await request(env)).json()).events[0];
  assert.equal((await request(env,'PUT',{...first,repeat:'biweekly',until:'2026-12-15'})).status,200);
  const rows=(await (await request(env)).json()).events;assert.equal(rows.length,4);assert.ok(rows.some(e=>e.title==='기존 별도 일정'&&e.series_id===''));
  assert.equal((await request(env,'PUT',{...rows[0],repeat:'biweekly',until:'2026-01-01'})).status,400);assert.equal((await (await request(env)).json()).events.length,4);
});
