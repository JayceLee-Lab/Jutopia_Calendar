import { validDate, expandEvent, icons, kinds, colors, lunarToSolar, readLunar, addDays } from './calendar.js';
// Build injects the static asset map here. No network dependency for the UI.
const assets = __ASSETS__;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
      const asset=assets[url.pathname==='/'?'/index.html':url.pathname];
      if (!asset) return new Response('Not found',{status:404});
      return new Response(request.method==='HEAD'?null:(asset.base64?Uint8Array.from(atob(asset.base64),char=>char.charCodeAt(0)):asset.body),{headers:{'content-type':asset.type,'cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"}});
    }
    try {
      if (url.pathname!=='/api/events') return json({error:'찾을 수 없는 요청입니다.'},404);
      if (request.headers.get('origin') && request.headers.get('origin')!==url.origin) return json({error:'허용되지 않은 요청입니다.'},403);
      const code=request.headers.get('x-family-code')||'';
      if (!/^[a-zA-Z0-9_-]{20,128}$/.test(code)) return json({error:'가족 공유 코드를 확인해 주세요.'},401);
      if (!env.DB) return json({error:'공유 저장소 연결이 필요합니다. 관리자에게 문의해 주세요.'},503);
      const family=await hash(code);
      if (request.method==='GET') {
        const {results}=await env.DB.prepare('SELECT id,title,kind,icon,start,end,note,calendar_type,lunar_start,color,series_id,repeat_rule,repeat_until,revision,updated_at FROM events WHERE family = ? ORDER BY start,title').bind(family).all();
        return json({events:results});
      }
      if (Number(request.headers.get('content-length'))>16384) return json({error:'일정 내용이 너무 깁니다.'},413);
      const raw=await request.text(); if (raw.length>16384) return json({error:'일정 내용이 너무 깁니다.'},413);
      let body; try { body=JSON.parse(raw); } catch {return json({error:'올바른 JSON이 필요합니다.'},400);}
      if (!body || typeof body!=='object') return json({error:'일정 내용을 확인해 주세요.'},400);
      if (request.method==='DELETE') {
        if (typeof body.id!=='string'||!Number.isInteger(body.revision)) return json({error:'일정을 확인해 주세요.'},400);
        const result=await env.DB.prepare('DELETE FROM events WHERE id = ? AND family = ? AND revision = ?').bind(body.id,family,body.revision).run();
        return result.meta.changes?json({ok:true}):json({error:'다른 가족이 수정했거나 삭제한 일정입니다. 최신 일정을 확인해 주세요.'},409);
      }
      if (!['POST','PUT'].includes(request.method)) return json({error:'지원하지 않는 요청입니다.'},405);
      const title=typeof body.title==='string'?body.title.trim():'';
      if (!title || title.length>80 || (typeof body.kind!=='string' || !Object.hasOwn(kinds,body.kind)) || !icons.includes(body.icon) || !validDate(body.start) || !validDate(body.end) || body.end<body.start || typeof body.note!=='string' || body.note.length>1000) return json({error:'제목, 날짜, 메모를 확인해 주세요.'},400);
      const calendarType=body.calendar_type??'solar',color=body.color??'';
      if(!['solar','lunar'].includes(calendarType)||typeof color!=='string'||(color!==''&&!Object.hasOwn(colors,color)))return json({error:'달력 종류와 색상을 확인해 주세요.'},400);
      const lunar=calendarType==='lunar'?readLunar(body.lunar_start):null;
      if(calendarType==='lunar'&&(!lunar||lunarToSolar(lunar)!==body.start))return json({error:'음력 날짜와 변환된 양력 날짜가 일치하지 않습니다.'},400);
      const event={title,kind:body.kind,icon:body.icon,start:body.start,end:body.end,note:body.note.trim(),calendar_type:calendarType,lunar_start:lunar?JSON.stringify(lunar):'',color}, now=new Date().toISOString();
      const updateSql='UPDATE events SET title=?,kind=?,icon=?,start=?,end=?,note=?,calendar_type=?,lunar_start=?,color=?,series_id=?,repeat_rule=?,repeat_until=?,revision=revision+1,updated_at=? WHERE id=? AND family=? AND revision=?';
      const updateValues=e=>[e.title,e.kind,e.icon,e.start,e.end,e.note,e.calendar_type,e.lunar_start,e.color,e.series_id,e.repeat_rule,e.repeat_until,now];
      const columns='id,family,title,kind,icon,start,end,note,calendar_type,lunar_start,color,series_id,repeat_rule,repeat_until,updated_at';
      const insertValues=(e,series,repeat,until)=>[crypto.randomUUID(),family,e.title,e.kind,e.icon,e.start,e.end,e.note,e.calendar_type,e.lunar_start,e.color,series,repeat,until,now];
      const placeholders=Array(15).fill('?').join(',');
      if (request.method==='PUT') {
        if(typeof body.id!=='string'||!Number.isInteger(body.revision))return json({error:'일정을 확인해 주세요.'},400);
        const existing=await env.DB.prepare('SELECT id,start,revision,series_id,repeat_rule,repeat_until FROM events WHERE id=? AND family=?').bind(body.id,family).all();
        const current=existing.results[0];
        if(!current||current.revision!==body.revision)return json({error:'다른 가족이 먼저 수정했거나 삭제했습니다. 최신 일정을 다시 열어 주세요.'},409);
        const repeat=body.repeat??current.repeat_rule,until=repeat==='none'?'':body.until??current.repeat_until;
        if(!['none','biweekly','yearly'].includes(repeat))return json({error:'반복 설정을 확인해 주세요.'},400);
        const changed=repeat!==current.repeat_rule||until!==current.repeat_until;
        if(!changed){
          const updated={...event,series_id:current.series_id,repeat_rule:current.repeat_rule,repeat_until:current.repeat_until};
          const result=await env.DB.prepare(updateSql).bind(...updateValues(updated),body.id,family,body.revision).run();
          return result.meta.changes?json({ok:true}):json({error:'다른 가족이 먼저 수정했습니다. 최신 일정을 다시 열어 주세요.'},409);
        }
        let expanded;try{expanded=expandEvent(event,repeat,until||undefined);}catch(e){return json({error:e.message},400);}
        const series=crypto.randomUUID(),updated={...event,series_id:series,repeat_rule:repeat,repeat_until:until};
        const guard='EXISTS (SELECT 1 FROM events WHERE id=? AND family=? AND revision=? AND series_id=?)';
        const guardValues=[body.id,family,body.revision+1,series];
        const statements=[env.DB.prepare(updateSql).bind(...updateValues(updated),body.id,family,body.revision)];
        if(current.series_id){
          statements.push(env.DB.prepare('DELETE FROM events WHERE family=? AND series_id=? AND start>=? AND id<>? AND '+guard).bind(family,current.series_id,current.start,body.id,...guardValues));
          statements.push(env.DB.prepare('UPDATE events SET repeat_until=?,revision=revision+1,updated_at=? WHERE family=? AND series_id=? AND start<? AND '+guard).bind(addDays(current.start,-1),now,family,current.series_id,current.start,...guardValues));
        }
        for(const e of expanded.slice(1))statements.push(env.DB.prepare(`INSERT INTO events (${columns}) SELECT ${placeholders} WHERE ${guard}`).bind(...insertValues(e,series,repeat,until),...guardValues));
        const results=await env.DB.batch(statements);
        return results[0].meta.changes?json({ok:true,count:expanded.length}):json({error:'다른 가족이 먼저 수정했습니다. 최신 일정을 다시 열어 주세요.'},409);
      }
      const repeat=body.repeat||'none',until=repeat==='none'?'':body.until;
      let expanded;try{expanded=expandEvent(event,repeat,until);}catch(e){return json({error:e.message},400);}
      const series=repeat==='none'?'':crypto.randomUUID();
      await env.DB.batch(expanded.map(e=>env.DB.prepare(`INSERT INTO events (${columns}) VALUES (${placeholders})`).bind(...insertValues(e,series,repeat,until||''))));
      return json({ok:true,count:expanded.length},201);
    } catch (error) {console.error('Calendar API error',error.message);return json({error:'저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'},500);}
  }
};
