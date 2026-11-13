import { validDate, expandEvent, icons, kinds } from './calendar.js';
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
      return new Response(request.method==='HEAD'?null:asset.body,{headers:{'content-type':asset.type,'cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"}});
    }
    try {
      if (url.pathname!=='/api/events') return json({error:'찾을 수 없는 요청입니다.'},404);
      if (request.headers.get('origin') && request.headers.get('origin')!==url.origin) return json({error:'허용되지 않은 요청입니다.'},403);
      const code=request.headers.get('x-family-code')||'';
      if (!/^[a-zA-Z0-9_-]{20,128}$/.test(code)) return json({error:'가족 공유 코드를 확인해 주세요.'},401);
      if (!env.DB) return json({error:'공유 저장소 연결이 필요합니다. 관리자에게 문의해 주세요.'},503);
      const family=await hash(code);
      if (request.method==='GET') {
        const {results}=await env.DB.prepare('SELECT id,title,kind,icon,start,end,note,revision,updated_at FROM events WHERE family = ? ORDER BY start,title').bind(family).all();
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
      if (!title || title.length>80 || !kinds[body.kind] || !icons.includes(body.icon) || !validDate(body.start) || !validDate(body.end) || body.end<body.start || typeof body.note!=='string' || body.note.length>1000) return json({error:'제목, 날짜, 메모를 확인해 주세요.'},400);
      const event={title,kind:body.kind,icon:body.icon,start:body.start,end:body.end,note:body.note.trim()}, now=new Date().toISOString();
      if (request.method==='PUT') {
        if (typeof body.id!=='string'||!Number.isInteger(body.revision)) return json({error:'일정을 확인해 주세요.'},400);
        const result=await env.DB.prepare('UPDATE events SET title=?,kind=?,icon=?,start=?,end=?,note=?,revision=revision+1,updated_at=? WHERE id=? AND family=? AND revision=?').bind(title,event.kind,event.icon,event.start,event.end,event.note,now,body.id,family,body.revision).run();
        return result.meta.changes?json({ok:true}):json({error:'다른 가족이 먼저 수정했습니다. 창을 닫고 최신 일정을 다시 열어 주세요.'},409);
      }
      let expanded; try {expanded=expandEvent(event,body.repeat||'none',body.until);} catch(e) {return json({error:e.message},400);}
      await env.DB.batch(expanded.map(e=>env.DB.prepare('INSERT INTO events (id,family,title,kind,icon,start,end,note,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),family,e.title,e.kind,e.icon,e.start,e.end,e.note,now)));
      return json({ok:true,count:expanded.length},201);
    } catch (error) {console.error('Calendar API error',error.message);return json({error:'저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'},500);}
  }
};
