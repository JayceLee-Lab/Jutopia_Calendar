import {defaultRepeatUntil,expandEvent} from '../src/calendar.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});
const POLICY='ten-year-weekly-v1';
const renameTitle=title=>title==='수원 할머니 방문'?'수원':title==='울산 할머니 방문'?'울산':title;
export async function applyRepeatPolicy(request,env){
  if(request.method!=='POST'||!env.REPEAT_MAINTENANCE_KEY||request.headers.get('x-maintenance-key')!==env.REPEAT_MAINTENANCE_KEY)return json({error:'허용되지 않은 요청입니다.'},403);
  const {results:rows}=await env.DB.prepare('SELECT * FROM events ORDER BY family,start,id').all();
  const {results:completed}=await env.DB.prepare("SELECT key FROM maintenance_log WHERE status='done'").all();
  const done=new Set(completed.map(row=>row.key)),groups=new Map();
  for(const row of rows){
    const repeating=row.repeat_rule!=='none';
    if(!repeating&&renameTitle(row.title)===row.title)continue;
    const key=`${POLICY}:${row.family}:${repeating?(row.series_id||row.id):row.id}`;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
  }
  const pending=[...groups].filter(([key])=>!done.has(key));
  if(!pending.length)return json({done:true,remaining:0,processed:0});
  const [key,group]=pending[0],base=group[0],now=new Date().toISOString(),statements=[];
  const repeating=base.repeat_rule!=='none',repeat=base.repeat_rule==='biweekly'?'weekly':base.repeat_rule;
  const until=repeating?defaultRepeatUntil(base.start):'',series=repeating?(base.series_id||crypto.randomUUID()):'';
  statements.push(env.DB.prepare("INSERT OR IGNORE INTO maintenance_log(key,status,payload,updated_at) VALUES (?,'backup',?,?)").bind('backup:'+key,JSON.stringify(group),now));
  for(const row of group){
    const active=repeating&&row.start<=until;
    statements.push(env.DB.prepare('UPDATE events SET title=?,repeat_rule=?,repeat_until=?,series_id=?,revision=revision+1,updated_at=? WHERE id=? AND family=?').bind(renameTitle(row.title),active?repeat:'none',active?until:'',active?series:'',now,row.id,row.family));
  }
  const existingDates=new Set(group.map(row=>row.start)),added=[];
  if(repeating){
    const event={...base,title:renameTitle(base.title)};
    for(const item of expandEvent(event,repeat,until)){
      if(existingDates.has(item.start))continue;
      const id=crypto.randomUUID();added.push(id);
      statements.push(env.DB.prepare('INSERT INTO events(id,family,title,kind,icon,start,end,note,calendar_type,lunar_start,color,series_id,repeat_rule,repeat_until,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,base.family,item.title,item.kind,item.icon,item.start,item.end,item.note,item.calendar_type,item.lunar_start,item.color,series,repeat,until,now));
    }
  }
  statements.push(env.DB.prepare("INSERT INTO maintenance_log(key,status,payload,updated_at) VALUES (?,'done',?,?)").bind(key,JSON.stringify({oldCount:group.length,addedIds:added,until,repeat}),now));
  await env.DB.batch(statements);
  return json({done:pending.length===1,remaining:pending.length-1,processed:1,preserved:group.length,added:added.length});
}

