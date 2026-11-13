import {applyRepeatPolicy} from '../scripts/maintenance-repeat-policy.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {validDate,expandEvent,monthCells,upcoming,lunarToSolar,solarToLunar,eventColor,defaultRepeatUntil,layoutWeekEvents} from '../src/calendar.js';
import worker from '../dist/server/index.js';
const event={title:'가족 일정',kind:'family',icon:'🌷',start:'2026-11-13',end:'2026-11-15',note:'아이들과 함께'};
const holidays=JSON.parse(readFileSync('data/holidays.json','utf8'));
test('all months through 2035 have complete Sunday-first calendar grids',()=>{for(let y=2020;y<=2035;y++)for(let m=0;m<12;m++){const cells=monthCells(y,m);assert.equal(cells.length%7,0);assert.equal(cells.filter(c=>!c.outside).length,new Date(y,m+1,0).getDate());assert.equal(new Date(cells[0].date+'T12:00').getDay(),0);}});
test('invalid dates and out-of-range dates are rejected',()=>{assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2051-01-01'),false);assert.equal(validDate('2028-02-29'),true);});
test('removed fortnightly option is rejected',()=>{assert.throws(()=>expandEvent(event,'biweekly','2027-01-01'),/반복 설정/);});
test('leap day birthdays remain annual and never exceed 2035',()=>{const dates=expandEvent({...event,start:'2028-02-29',end:'2028-02-29'},'yearly','2035-12-31').map(e=>e.start);assert.equal(dates.length,8);assert.equal(dates[1],'2029-02-28');assert.equal(dates[4],'2032-02-29');assert.equal(dates.at(-1),'2035-02-28');});
test('upcoming includes active visits and exactly three calendar months',()=>{const events=[{start:'2026-10-30',end:'2026-11-14',title:'A'},{start:'2027-02-13',end:'2027-02-13',title:'B'},{start:'2027-02-14',end:'2027-02-14',title:'C'}];assert.deepEqual(upcoming(events,'2026-11-13').map(e=>e.title),['A','B']);});
test('Korean lunar, substitute, election, and 2035 holidays are bundled',()=>{assert.match(holidays['2026-02-17'],/설날/);assert.match(holidays['2026-09-25'],/추석/);assert.match(holidays['2026-03-02'],/대체/);assert.match(holidays['2026-06-03'],/선거/);assert.ok(holidays['2035-12-25']);for(let y=2020;y<=2035;y++)assert.ok(Object.keys(holidays).filter(d=>d.startsWith(String(y))).length>=15);});
function database(){const db=new DatabaseSync(':memory:');for(const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+file,'utf8'));const prepare=sql=>{let args=[];return{bind(...a){args=a;return this;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:db.prepare(sql).run(...args)};}};};return {DB:{prepare,async batch(items){db.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}}};}
const familyA='a'.repeat(32),familyB='b'.repeat(32);
const request=(env,method='GET',body,code=familyA)=>worker.fetch(new Request('https://calendar.example/api/events',{method,headers:{'x-family-code':code,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
test('shared API persists, isolates families, updates, detects stale edits, and deletes',async()=>{const env=database();assert.equal((await request(env,'POST',event)).status,201);const {events}=await (await request(env)).json();assert.equal(events.length,1);assert.equal(events[0].title,event.title);assert.equal((await (await request(env,'GET',null,familyB)).json()).events.length,0);const saved=events[0];assert.equal((await request(env,'PUT',{...saved,title:'변경됨'})).status,200);assert.equal((await request(env,'PUT',saved)).status,409);assert.equal((await request(env,'DELETE',{id:saved.id,revision:1})).status,409);assert.equal((await request(env,'DELETE',{id:saved.id,revision:2},familyB)).status,409);assert.equal((await request(env,'DELETE',{id:saved.id,revision:2})).status,200);assert.equal((await (await request(env)).json()).events.length,0);});
test('API repetition and validation do not partially save invalid events',async()=>{const env=database();const response=await request(env,'POST',{...event,repeat:'weekly',until:'2026-11-27'});assert.equal((await response.json()).count,3);assert.equal((await request(env,'POST',{...event,start:'2026-02-30'})).status,400);assert.equal((await request(env,'POST',{...event,repeat:'invalid'})).status,400);assert.equal((await request(env,'GET',null,'short')).status,401);assert.equal((await request({},'POST',event)).status,503);assert.equal((await (await request(env)).json()).events.length,3);});
test('static page and assets are self-contained and reject untrusted cross-origin writes',async()=>{const response=await worker.fetch(new Request('https://calendar.example/'),{});assert.equal(response.status,200);assert.match(await response.text(),/함께하는 날들이 모이는 곳/);assert.ok(response.headers.get('content-security-policy'));const result=await worker.fetch(new Request('https://calendar.example/api/events',{method:'POST',headers:{origin:'https://other.example','x-family-code':familyA},body:JSON.stringify(event)}),database());assert.equal(result.status,403);});

test('schema upgrade preserves existing records, revisions, and original colors',async()=>{
  const db=new DatabaseSync(':memory:');db.exec(readFileSync('migrations/0001_calendar.sql','utf8'));
  db.prepare('INSERT INTO events(id,family,title,kind,icon,start,end,note,revision,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run('old-record','existing-family','기존 가족 기록','ulsan','🏡','2026-11-13','2026-11-14','보존할 메모',7,'2026-11-01');
  db.exec(readFileSync('migrations/0002_lunar_colors.sql','utf8'));
  const row=db.prepare('SELECT * FROM events').get();assert.equal(row.title,'기존 가족 기록');assert.equal(row.note,'보존할 메모');assert.equal(row.revision,7);assert.equal(row.calendar_type,'solar');assert.equal(row.lunar_start,'');assert.equal(eventColor(row),'ulsan');
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
  const env=database();await request(env,'POST',{...event,repeat:'weekly',until:'2026-12-04'});
  let rows=(await (await request(env)).json()).events;assert.equal(rows.length,4);assert.equal(new Set(rows.map(e=>e.series_id)).size,1);assert.ok(rows[0].series_id);assert.ok(rows.every(e=>e.repeat_rule==='weekly'));
  const past={...rows[0]},selected={...rows[1]};
  assert.equal((await request(env,'PUT',{...selected,repeat:'yearly',until:'2028-12-31'})).status,200);
  rows=(await (await request(env)).json()).events;
  assert.deepEqual(rows.map(e=>e.start),['2026-11-13','2026-11-20','2027-11-20','2028-11-20']);
  const preserved=rows.find(e=>e.id===past.id);assert.equal(preserved.title,past.title);assert.equal(preserved.note,past.note);assert.equal(preserved.repeat_until,'2026-11-19');
  const changed=rows.find(e=>e.id===selected.id);assert.equal(changed.repeat_rule,'yearly');assert.notEqual(changed.series_id,past.series_id);
  assert.equal((await request(env,'PUT',{...changed,repeat:'none'})).status,200);
  rows=(await (await request(env)).json()).events;assert.deepEqual(rows.map(e=>e.start),['2026-11-13','2026-11-20']);assert.equal(rows[1].repeat_rule,'none');
});
test('editing title only preserves a series, and stale repeat edits cannot delete or insert records',async()=>{
  const env=database();await request(env,'POST',{...event,repeat:'weekly',until:'2026-11-27'});
  const original=(await (await request(env)).json()).events,first=original[0];
  assert.equal((await request(env,'PUT',{...first,title:'선택한 일정만 수정',repeat:'weekly',until:first.repeat_until})).status,200);
  let rows=(await (await request(env)).json()).events;assert.equal(rows.length,3);assert.equal(rows[1].title,event.title);
  assert.equal((await request(env,'PUT',{...first,repeat:'none'})).status,409);
  rows=(await (await request(env)).json()).events;assert.equal(rows.length,3);
  assert.equal((await (await request(env,'GET',null,familyB)).json()).events.length,0);
});
test('a legacy independent record can gain recurrence without touching other independent records',async()=>{
  const env=database();await request(env,'POST',event);await request(env,'POST',{...event,start:'2026-11-27',end:'2026-11-29',title:'기존 별도 일정'});
  const first=(await (await request(env)).json()).events[0];
  assert.equal((await request(env,'PUT',{...first,repeat:'weekly',until:'2026-11-27'})).status,200);
  const rows=(await (await request(env)).json()).events;assert.equal(rows.length,4);assert.ok(rows.some(e=>e.title==='기존 별도 일정'&&e.series_id===''));
  assert.equal((await request(env,'PUT',{...rows[0],repeat:'weekly',until:'2026-01-01'})).status,400);assert.equal((await (await request(env)).json()).events.length,4);
});

test('weekly repeats retain weekday and duration across year boundaries',()=>{
  const dates=expandEvent({...event,start:'2026-12-25',end:'2026-12-27'},'weekly','2027-01-15');
  assert.deepEqual(dates.map(e=>[e.start,e.end]),[['2026-12-25','2026-12-27'],['2027-01-01','2027-01-03'],['2027-01-08','2027-01-10'],['2027-01-15','2027-01-17']]);
});
test('monthly repeats clamp to month end and restore the original day in later months',()=>{
  const dates=expandEvent({...event,start:'2027-01-31',end:'2027-01-31'},'monthly','2027-05-31');
  assert.deepEqual(dates.map(e=>e.start),['2027-01-31','2027-02-28','2027-03-31','2027-04-30','2027-05-31']);
  assert.deepEqual(expandEvent({...event,start:'2028-01-31',end:'2028-01-31'},'monthly','2028-03-31').map(e=>e.start),['2028-01-31','2028-02-29','2028-03-31']);
});
test('lunar monthly recurrence includes leap months in chronological order',()=>{
  const lunar={year:2025,month:5,day:1,leap:false},start=lunarToSolar(lunar);
  const dates=expandEvent({...event,start,end:start,calendar_type:'lunar',lunar_start:JSON.stringify(lunar)},'monthly','2025-09-01');
  assert.deepEqual(dates.map(e=>e.start),['2025-05-27','2025-06-25','2025-07-25','2025-08-23']);
  assert.deepEqual(dates.map(e=>JSON.parse(e.lunar_start).leap),[false,false,true,false]);
});
test('weekly and monthly rules survive API readback and recurrence edits',async()=>{
  const env=database();assert.equal((await request(env,'POST',{...event,repeat:'weekly',until:'2026-12-04'})).status,201);
  let rows=(await (await request(env)).json()).events;assert.equal(rows.length,4);assert.ok(rows.every(e=>e.repeat_rule==='weekly'&&e.repeat_until==='2026-12-04'));
  assert.equal((await request(env,'PUT',{...rows[0],repeat:'monthly',until:'2027-01-31'})).status,200);
  rows=(await (await request(env)).json()).events;assert.deepEqual(rows.map(e=>e.start),['2026-11-13','2026-12-13','2027-01-13']);assert.ok(rows.every(e=>e.repeat_rule==='monthly'&&e.repeat_until==='2027-01-31'));
});

test('omitted recurrence end defaults to ten years and handles leap-day anniversaries',async()=>{
  assert.equal(defaultRepeatUntil('2026-11-13'),'2036-11-13');assert.equal(defaultRepeatUntil('2028-02-29'),'2038-02-28');
  const env=database();const result=await request(env,'POST',{...event,repeat:'weekly'});assert.equal(result.status,201);
  const rows=(await (await request(env)).json()).events;assert.ok(rows.length>=521);assert.ok(rows.every(e=>e.repeat_until==='2036-11-13'));assert.ok(rows.at(-1).start.startsWith('2036-'));
});
test('2050 calendars and lunar public holidays are supported',()=>{
  assert.equal(validDate('2050-12-31'),true);assert.ok(holidays['2050-12-25']);
  for(let year=2036;year<=2050;year++){
    for(const [month,day,label] of [[1,1,'설날'],[4,8,'부처님오신날'],[8,15,'추석']])assert.match(holidays[lunarToSolar({year,month,day,leap:false})],new RegExp(label));
  }
});
test('one-time data maintenance backs up originals, converts fortnightly to weekly, extends ten years, and renames',async()=>{
  const env=database();await request(env,'POST',{...event,title:'수원 할머니 방문'});await request(env,'POST',{...event,title:'수원 할머니 방문',start:'2026-11-27',end:'2026-11-29'});
  await env.DB.prepare("UPDATE events SET repeat_rule='biweekly',repeat_until='2026-12-31',series_id='legacy-series'").run();
  const original=(await (await request(env)).json()).events;
  const maintenanceEnv={...env,REPEAT_MAINTENANCE_KEY:'test-maintenance-key'};
  const admin=()=>applyRepeatPolicy(new Request('https://calendar.example/api/admin/repeat-policy',{method:'POST',headers:{'x-maintenance-key':'test-maintenance-key'}}),maintenanceEnv);
  assert.equal((await worker.fetch(new Request('https://calendar.example/api/admin/repeat-policy',{method:'POST'}),maintenanceEnv)).status,404);assert.equal((await applyRepeatPolicy(new Request('https://calendar.example/api/admin/repeat-policy',{method:'POST'}),maintenanceEnv)).status,403);
  const response=await admin();assert.equal(response.status,200);assert.equal((await response.json()).done,true);
  const rows=(await (await request(env)).json()).events;assert.ok(rows.length>=521);assert.ok(rows.every(e=>e.title==='수원'&&e.repeat_rule==='weekly'&&e.repeat_until==='2036-11-13'));
  for(const old of original){const preserved=rows.find(e=>e.id===old.id);assert.equal(preserved.start,old.start);assert.equal(preserved.end,old.end);assert.equal(preserved.note,old.note);assert.equal(preserved.icon,old.icon);}
  const backups=await env.DB.prepare("SELECT payload FROM maintenance_log WHERE status='backup'").all();assert.equal(backups.results.length,1);assert.equal(JSON.parse(backups.results[0].payload).length,2);assert.ok(JSON.parse(backups.results[0].payload).every(row=>row.title==='수원 할머니 방문'&&row.repeat_rule==='biweekly'));
  assert.equal((await (await admin()).json()).processed,0);assert.equal((await (await request(env)).json()).events.length,rows.length);
});

test('series scope applies changed color/icon to all occurrences while preserving dates and custom content',async()=>{
  const env=database();await request(env,'POST',{...event,color:'mint',repeat:'weekly',until:'2026-11-27'});await request(env,'POST',{...event,title:'별도 일정',color:'sand'});await request(env,'POST',{...event,color:'butter',repeat:'weekly',until:'2026-11-27'},familyB);
  let all=(await (await request(env)).json()).events,group=all.filter(e=>e.series_id),first=group[0];
  await request(env,'PUT',{...first,title:'개별 제목',note:'개별 메모'});all=(await (await request(env)).json()).events;group=all.filter(e=>e.series_id);const selected=group[1],dates=group.map(e=>[e.id,e.start,e.end,e.lunar_start,e.repeat_until]);
  const response=await request(env,'PUT',{...selected,color:'blue',icon:'⭐',apply_scope:'series'});assert.equal(response.status,200);assert.equal((await response.json()).updated_count,3);
  all=(await (await request(env)).json()).events;group=all.filter(e=>e.series_id);assert.ok(group.every(e=>e.color==='blue'&&e.icon==='⭐'));assert.deepEqual(group.map(e=>[e.id,e.start,e.end,e.lunar_start,e.repeat_until]),dates);assert.equal(group[0].title,'개별 제목');assert.equal(group[0].note,'개별 메모');assert.equal(all.find(e=>!e.series_id).color,'sand');assert.ok((await (await request(env,'GET',null,familyB)).json()).events.every(e=>e.color==='butter'));
  assert.equal((await request(env,'PUT',{...selected,color:'pink',apply_scope:'series'})).status,409);assert.ok((await (await request(env)).json()).events.filter(e=>e.series_id).every(e=>e.color==='blue'));
});
test('series icon removal preserves other fields and scope is rejected for independent records',async()=>{
  const env=database();await request(env,'POST',{...event,repeat:'weekly',until:'2026-11-27'});let rows=(await (await request(env)).json()).events;
  await request(env,'PUT',{...rows[0],color:'pink'});rows=(await (await request(env)).json()).events;assert.equal((await request(env,'PUT',{...rows[1],icon:'',apply_scope:'series'})).status,200);
  rows=(await (await request(env)).json()).events;assert.ok(rows.every(e=>e.icon===''));assert.equal(rows[0].color,'pink');
  await request(env,'POST',{...event,title:'독립 일정'});const single=(await (await request(env)).json()).events.find(e=>!e.series_id);assert.equal((await request(env,'PUT',{...single,apply_scope:'series',color:'mint'})).status,400);assert.equal((await request(env,'PUT',{...rows[0],apply_scope:'invalid'})).status,400);
});
test('lunar dates remain specific to each occurrence after series-wide content editing',async()=>{
  const env=database(),lunar={year:2026,month:1,day:1,leap:false};await request(env,'POST',{...event,start:'2026-02-17',end:'2026-02-17',calendar_type:'lunar',lunar_start:JSON.stringify(lunar),repeat:'yearly',until:'2028-12-31'});
  const before=(await (await request(env)).json()).events;assert.equal((await request(env,'PUT',{...before[1],title:'음력 가족 생일',icon:'🎂',apply_scope:'series'})).status,200);const after=(await (await request(env)).json()).events;
  assert.ok(after.every(e=>e.title==='음력 가족 생일'&&e.icon==='🎂'));assert.deepEqual(after.map(e=>[e.start,e.end,e.lunar_start]),before.map(e=>[e.start,e.end,e.lunar_start]));
});
test('series-wide content editing can accompany a recurrence change while retaining past occurrence dates',async()=>{
  const env=database();await request(env,'POST',{...event,repeat:'weekly',until:'2026-11-27'});const before=(await (await request(env)).json()).events;
  const result=await request(env,'PUT',{...before[1],repeat:'monthly',until:'2027-01-31',color:'mint',icon:'🍀',apply_scope:'series'});assert.equal(result.status,200);assert.equal((await result.json()).updated_count,4);const rows=(await (await request(env)).json()).events;
  assert.deepEqual(rows.map(e=>e.start),['2026-11-13','2026-11-20','2026-12-20','2027-01-20']);assert.ok(rows.every(e=>e.icon==='🍀'&&e.color==='mint'));assert.equal(rows[0].id,before[0].id);
});

test('different named family events on the same date have independent IDs and edit/delete safely',async()=>{
  const env=database(),titles=['가족 외식','학교 행사','영화 관람'];for(const title of titles)assert.equal((await request(env,'POST',{...event,kind:'family',title})).status,201);
  let rows=(await (await request(env)).json()).events;assert.equal(rows.length,3);assert.equal(new Set(rows.map(e=>e.id)).size,3);assert.deepEqual(rows.map(e=>e.title).sort(),titles.sort());
  const selected=rows[0];assert.equal((await request(env,'PUT',{...selected,title:'개별 수정'})).status,200);rows=(await (await request(env)).json()).events;assert.equal(rows.filter(e=>e.title==='개별 수정').length,1);assert.equal(rows.length,3);
  assert.equal((await request(env,'DELETE',{id:selected.id,revision:2})).status,200);assert.equal((await (await request(env)).json()).events.length,2);
});
test('overlapping recurring family events remain separate series on matching dates',async()=>{
  const env=database();for(const title of ['가족 운동','가족 독서'])assert.equal((await request(env,'POST',{...event,kind:'family',title,repeat:'weekly',until:'2026-11-27'})).status,201);
  const rows=(await (await request(env)).json()).events;assert.equal(rows.length,6);assert.equal(new Set(rows.map(e=>e.series_id)).size,2);for(const date of ['2026-11-13','2026-11-20','2026-11-27'])assert.equal(rows.filter(e=>e.start===date).length,2);
});

test('converting independent events into a series reuses matching future records without duplicates',async()=>{
  const env=database();await request(env,'POST',event);await request(env,'POST',{...event,start:'2026-11-20',end:'2026-11-22',note:'기존 회차별 메모',color:'pink',icon:'⭐'});await request(env,'POST',{...event,start:'2026-11-27',end:'2026-11-29'});
  const original=(await (await request(env)).json()).events,root=original[0];const response=await request(env,'PUT',{...root,repeat:'weekly',until:'2026-11-27'});assert.equal(response.status,200);const result=await response.json();assert.equal(result.created_count,0);assert.equal(result.reused_count,2);
  let rows=(await (await request(env)).json()).events;assert.equal(rows.length,3);assert.deepEqual(rows.map(e=>e.id),original.map(e=>e.id));assert.equal(new Set(rows.map(e=>e.series_id)).size,1);assert.ok(rows[0].series_id);assert.ok(rows.every(e=>e.repeat_rule==='weekly'));assert.equal(rows[1].note,'기존 회차별 메모');assert.equal(rows[1].color,'pink');assert.equal(rows[1].icon,'⭐');
  assert.equal((await request(env,'PUT',{...root,repeat:'weekly',until:'2026-11-27'})).status,409);assert.equal((await (await request(env)).json()).events.length,3);
  assert.equal((await request(env,'PUT',{...rows[0],repeat:'weekly',until:'2026-11-27'})).status,200);assert.equal((await (await request(env)).json()).events.length,3);
});
test('matching occurrences in another series are kept without inserting extra copies or changing their group',async()=>{
  const env=database();await request(env,'POST',event);await request(env,'POST',{...event,start:'2026-11-20',end:'2026-11-22',repeat:'weekly',until:'2026-11-27'});
  const before=(await (await request(env)).json()).events;const response=await request(env,'PUT',{...before[0],repeat:'weekly',until:'2026-11-27'});assert.equal(response.status,200);const result=await response.json();assert.equal(result.created_count,0);assert.equal(result.reused_count,0);
  const after=(await (await request(env)).json()).events;assert.equal(after.length,3);assert.deepEqual(after.slice(1),before.slice(1));
});
test('recurrence duplicate protection preserves differently named, typed, or duration events on the same date',async()=>{
  const env=database();await request(env,'POST',event);for(const extra of [{title:'다른 가족 행사'},{kind:'birthday'},{end:'2026-11-20'}])await request(env,'POST',{...event,start:'2026-11-20',end:'2026-11-22',...extra});
  const before=(await (await request(env)).json()).events;assert.equal((await request(env,'PUT',{...before[0],repeat:'weekly',until:'2026-11-20'})).status,200);const after=(await (await request(env)).json()).events;assert.equal(after.length,5);for(const row of before.slice(1))assert.deepEqual(after.find(e=>e.id===row.id),row);
});
test('existing ambiguous duplicate records are not deleted or automatically merged',async()=>{
  const env=database();await request(env,'POST',event);for(let i=0;i<2;i++)await request(env,'POST',{...event,start:'2026-11-20',end:'2026-11-22'});const before=(await (await request(env)).json()).events;
  const result=await (await request(env,'PUT',{...before[0],repeat:'weekly',until:'2026-11-20'})).json();assert.equal(result.created_count,0);assert.equal(result.reused_count,0);const after=(await (await request(env)).json()).events;assert.equal(after.length,3);assert.deepEqual(after.slice(1),before.slice(1));
});
test('lunar recurrence conversion reuses the proper lunar-year record and never another family calendar',async()=>{
  const env=database(),base={...event,start:'2026-02-17',end:'2026-02-17',calendar_type:'lunar',lunar_start:JSON.stringify({year:2026,month:1,day:1,leap:false})};await request(env,'POST',base);const future={...base,start:'2027-02-07',end:'2027-02-07',lunar_start:JSON.stringify({year:2027,month:1,day:1,leap:false})};await request(env,'POST',future);await request(env,'POST',future,familyB);
  const before=(await (await request(env)).json()).events;assert.equal((await request(env,'PUT',{...before[0],repeat:'yearly',until:'2027-12-31'})).status,200);const after=(await (await request(env)).json()).events;assert.equal(after.length,2);assert.equal(after[1].id,before[1].id);assert.equal(after[1].lunar_start,future.lunar_start);assert.ok(after[1].series_id);const other=(await (await request(env,'GET',null,familyB)).json()).events;assert.equal(other.length,1);assert.equal(other[0].series_id,'');assert.equal(other[0].revision,1);
});

test('series deletion removes every occurrence including past dates but preserves same-name independent and other-series records',async()=>{
  const env=database();for(let i=0;i<2;i++)await request(env,'POST',{...event,repeat:'weekly',until:'2026-11-27'});await request(env,'POST',event);await request(env,'POST',{...event,repeat:'weekly',until:'2026-11-27'},familyB);
  const before=(await (await request(env)).json()).events,selected=before.find(e=>e.start==='2026-11-20'),targetSeries=selected.series_id;const preserved=before.filter(e=>e.series_id!==targetSeries);
  const response=await request(env,'DELETE',{id:selected.id,revision:selected.revision,delete_scope:'series'});assert.equal(response.status,200);assert.equal((await response.json()).deleted_count,3);const after=(await (await request(env)).json()).events;assert.equal(after.length,4);assert.deepEqual(after.map(e=>e.id).sort(),preserved.map(e=>e.id).sort());assert.equal((await (await request(env,'GET',null,familyB)).json()).events.length,3);
});
test('single occurrence deletion keeps the remaining series and allows subsequent explicit series deletion',async()=>{
  const env=database();await request(env,'POST',{...event,repeat:'weekly',until:'2026-11-27'});const before=(await (await request(env)).json()).events;const response=await request(env,'DELETE',{id:before[1].id,revision:before[1].revision,delete_scope:'one'});assert.equal((await response.json()).deleted_count,1);let after=(await (await request(env)).json()).events;assert.equal(after.length,2);assert.ok(after.every(e=>e.series_id===before[0].series_id));
  assert.equal((await (await request(env,'DELETE',{id:after[0].id,revision:after[0].revision,delete_scope:'series'})).json()).deleted_count,2);assert.equal((await (await request(env)).json()).events.length,0);
});
test('stale or foreign series deletion cannot remove any occurrence',async()=>{
  const env=database();await request(env,'POST',{...event,repeat:'weekly',until:'2026-11-27'});const before=(await (await request(env)).json()).events,selected=before[0];await request(env,'PUT',{...selected,note:'먼저 수정한 메모'});
  assert.equal((await request(env,'DELETE',{id:selected.id,revision:selected.revision,delete_scope:'series'})).status,409);const latest=(await (await request(env)).json()).events[0];assert.equal((await request(env,'DELETE',{id:latest.id,revision:latest.revision,delete_scope:'series'},familyB)).status,409);assert.equal((await request(env,'DELETE',{id:latest.id,revision:latest.revision,delete_scope:'invalid'})).status,400);assert.equal((await (await request(env)).json()).events.length,3);
});
test('independent records cannot request group deletion and omitted scope still deletes one record only',async()=>{
  const env=database();await request(env,'POST',event);await request(env,'POST',event);const rows=(await (await request(env)).json()).events;
  assert.equal((await request(env,'DELETE',{id:rows[0].id,revision:rows[0].revision,delete_scope:'series'})).status,400);assert.equal((await (await request(env)).json()).events.length,2);
  assert.equal((await request(env,'DELETE',{id:rows[0].id,revision:rows[0].revision})).status,200);assert.equal((await (await request(env)).json()).events.length,1);
});

test('multi-day bars clip at week boundaries with continuation markers and separate overlapping lanes',()=>{
  const days=Array.from({length:7},(_,i)=>`2026-11-${String(8+i).padStart(2,'0')}`),events=[{...event,id:'early',start:'2026-11-09',end:'2026-11-10'},{...event,id:'long',start:'2026-11-13',end:'2026-11-18'},{...event,id:'overlap',start:'2026-11-14',end:'2026-11-16'}];
  const first=layoutWeekEvents(events,days),long=first.periods.find(s=>s.event.id==='long'),overlap=first.periods.find(s=>s.event.id==='overlap');assert.deepEqual([long.startColumn,long.endColumn,long.starts,long.ends],[5,6,true,false]);assert.notEqual(long.lane,overlap.lane);assert.equal(first.periodLaneCount,2);
  const next=layoutWeekEvents(events,Array.from({length:7},(_,i)=>`2026-11-${15+i}`));const continued=next.periods.find(s=>s.event.id==='long');assert.deepEqual([continued.startColumn,continued.endColumn,continued.starts,continued.ends],[0,3,false,true]);
});
test('distinct same-name periods stay separate and single-day event text is never capped',()=>{
  const days=Array.from({length:7},(_,i)=>`2026-11-${String(8+i).padStart(2,'0')}`),periods=[{...event,id:'first',start:'2026-11-09',end:'2026-11-12'},{...event,id:'second',start:'2026-11-09',end:'2026-11-12'}];const singles=Array.from({length:12},(_,i)=>({...event,id:'single-'+i,title:'긴 일정 이름 '+i,start:'2026-11-10',end:'2026-11-10'}));
  const layout=layoutWeekEvents([...periods,...singles],days);assert.equal(layout.periods.length,2);assert.equal(layout.periodLaneCount,2);assert.equal(layout.singles[2].length,12);assert.equal(layout.eventRowCount,14);
});
test('two-day periods spanning Saturday and Sunday render one segment in each week',()=>{
  const event={id:'boundary',title:'주말 방문',start:'2026-11-14',end:'2026-11-15'};
  const before=layoutWeekEvents([event],Array.from({length:7},(_,i)=>`2026-11-${String(8+i).padStart(2,'0')}`)).periods[0],after=layoutWeekEvents([event],Array.from({length:7},(_,i)=>`2026-11-${15+i}`)).periods[0];assert.deepEqual([before.startColumn,before.endColumn,before.starts,before.ends],[6,6,true,false]);assert.deepEqual([after.startColumn,after.endColumn,after.starts,after.ends],[0,0,false,true]);
});

test('visit-line layout includes single-day visits without duplicating them and separates overlaps',()=>{
  const days=Array.from({length:7},(_,i)=>`2026-11-${String(8+i).padStart(2,'0')}`),visits=[
    {id:'long',start:'2026-11-09',end:'2026-11-12'},
    {id:'single',start:'2026-11-10',end:'2026-11-10'},
    {id:'same-day',start:'2026-11-10',end:'2026-11-10'},
    {id:'after',start:'2026-11-13',end:'2026-11-13'}
  ];
  const layout=layoutWeekEvents(visits,days,{singleDayAsBars:true}),byId=Object.fromEntries(layout.periods.map(segment=>[segment.event.id,segment]));
  assert.equal(layout.periods.length,4);assert.ok(layout.singles.every(items=>items.length===0));assert.equal(layout.eventRowCount,3);
  assert.deepEqual([byId.single.startColumn,byId.single.endColumn],[2,2]);
  assert.equal(new Set([byId.long.lane,byId.single.lane,byId['same-day'].lane]).size,3);
  assert.equal(byId.after.lane,byId.long.lane);
});

test('grandmother colors are fixed and reserved shades are rejected for other categories',async()=>{
  const env=database();for(const [kind,color] of [['suwon','suwon'],['ulsan','ulsan']]){assert.equal((await request(env,'POST',{...event,kind,color:'blue'})).status,201);const row=(await (await request(env)).json()).events.find(e=>e.kind===kind);assert.equal(row.color,color);assert.equal(eventColor({...row,color:'pink'}),color);}
  for(const kind of ['birthday','family'])for(const color of ['suwon','ulsan'])assert.equal((await request(env,'POST',{...event,kind,color})).status,400);
  assert.equal((await request(env,'POST',{...event,kind:'family',color:'mint'})).status,201);
});
test('legacy sage and peach colors remain available without changing event identity or notes',async()=>{
  const env=database();await request(env,'POST',{...event,kind:'family',color:'pink'});const before=(await (await request(env)).json()).events[0];await env.DB.prepare("UPDATE events SET color='sage' WHERE id=?").bind(before.id).run();
  const after=(await (await request(env)).json()).events[0];assert.equal(after.color,'sage');assert.equal(after.id,before.id);assert.equal(after.note,before.note);assert.equal(after.revision,before.revision);assert.equal(after.start,before.start);assert.equal(eventColor({...after,kind:'birthday',color:'peach'}),'peach');
});
test('changing a grandmother category across a series enforces its new fixed color',async()=>{
  const env=database();await request(env,'POST',{...event,kind:'suwon',repeat:'weekly',until:'2026-11-20'});const rows=(await (await request(env)).json()).events;assert.ok(rows.every(e=>e.color==='suwon'));
  assert.equal((await request(env,'PUT',{...rows[0],kind:'ulsan',color:'pink',apply_scope:'series'})).status,200);assert.ok((await (await request(env)).json()).events.every(e=>e.kind==='ulsan'&&e.color==='ulsan'));
});


test('sage and peach are available for birthdays and family events on creation and edit',async()=>{
  const env=database();for(const kind of ['birthday','family'])for(const color of ['sage','peach']){
    assert.equal((await request(env,'POST',{...event,kind,color})).status,201);
    const row=(await (await request(env)).json()).events.find(e=>e.kind===kind&&e.color===color);assert.ok(row);
    const changed=color==='sage'?'peach':'sage';assert.equal((await request(env,'PUT',{...row,color:changed})).status,200);
    assert.equal((await (await request(env)).json()).events.find(e=>e.id===row.id).color,changed);
  }
});
test('restoring visit names is family-scoped, backed up, repeat-safe, and idempotent',async()=>{
  const env=database();await request(env,'POST',{...event,kind:'suwon',title:'수원 할머니 방문',repeat:'weekly',until:'2026-11-27'});
  await request(env,'POST',{...event,kind:'ulsan',title:'울산 할머니 방문'});await request(env,'POST',{...event,kind:'suwon',title:'수원 할머니와 여행'});await request(env,'POST',{...event,title:'수원'});
  await request(env,'POST',{...event,kind:'suwon',title:'수원 할머니 방문'},familyB);
  await env.DB.prepare("UPDATE events SET title=CASE kind WHEN 'suwon' THEN '수원' ELSE '울산' END WHERE title IN ('수원 할머니 방문','울산 할머니 방문')").run();
  const before=(await (await request(env)).json()).events,foreign=(await (await request(env,'GET',null,familyB)).json()).events;
  const reply=await request(env,'PATCH',{action:'restore-visit-titles'});assert.equal(reply.status,200);assert.equal((await reply.json()).updated_count,4);
  const after=(await (await request(env)).json()).events;assert.equal(after.length,before.length);
  for(const old of before){const row=after.find(e=>e.id===old.id),renamed=(old.kind==='suwon'&&old.title==='수원')||(old.kind==='ulsan'&&old.title==='울산');
    assert.equal(row.title,renamed?(old.kind==='suwon'?'수원 할머니 방문':'울산 할머니 방문'):old.title);
    assert.equal(row.revision,old.revision+(renamed?1:0));
    for(const key of ['id','start','end','note','icon','series_id','repeat_rule','repeat_until','color'])assert.equal(row[key],old[key]);
  }
  assert.deepEqual((await (await request(env,'GET',null,familyB)).json()).events,foreign);
  assert.equal((await (await request(env,'PATCH',{action:'restore-visit-titles'})).json()).updated_count,0);
  const backups=(await env.DB.prepare("SELECT payload FROM maintenance_log WHERE status='backup'").all()).results;assert.equal(backups.length,1);assert.equal(JSON.parse(backups[0].payload).length,4);
  assert.equal((await request(env,'PUT',before.find(e=>e.title==='울산'))).status,409);
  assert.equal((await request(env,'PATCH',{action:'unknown'})).status,400);assert.equal((await request(env,'PATCH',{action:'restore-visit-titles'},'short')).status,401);
});
test('old clients saving short grandmother defaults receive restored titles',async()=>{
  const env=database();for(const [kind,title] of [['suwon','수원'],['ulsan','울산']]){
    assert.equal((await request(env,'POST',{...event,kind,title})).status,201);
    assert.equal((await (await request(env)).json()).events.find(e=>e.kind===kind).title,title+' 할머니 방문');
  }
});
