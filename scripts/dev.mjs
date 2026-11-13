import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});
mkdirSync('work',{recursive:true});
const db=new DatabaseSync('work/calendar.sqlite');
if(!db.prepare("SELECT name FROM sqlite_master WHERE name='events'").get()) db.exec(readFileSync('migrations/0001_calendar.sql','utf8'));
db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
for(const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')&&f!=='0001_calendar.sql').sort()){
  if(!db.prepare('SELECT name FROM local_migrations WHERE name=?').get(file)){
    db.exec('BEGIN');try{db.exec(readFileSync('migrations/'+file,'utf8'));db.prepare('INSERT INTO local_migrations(name) VALUES (?)').run(file);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  }
}
function prepare(sql){let args=[];return {bind(...a){args=a;return this;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:db.prepare(sql).run(...args)};}};}
const env={DB:{prepare,async batch(statements){db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}}};
const worker=(await import('../dist/server/index.js')).default;
const port=Number(process.env.PORT||3000);
createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const response=await worker.fetch(new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(body.length?{body,duplex:'half'}:{})}),env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){console.error(e);res.writeHead(500);res.end('Server error');}}).listen(port,'0.0.0.0',()=>console.log(`Local: http://localhost:${port}`));
