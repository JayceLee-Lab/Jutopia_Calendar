import {writeFile} from 'node:fs/promises';
const databaseId=process.env.CLOUDFLARE_D1_DATABASE_ID;
if(!/^[0-9a-f-]{36}$/i.test(databaseId||'')) throw new Error('GitHub Repository variable CLOUDFLARE_D1_DATABASE_ID must contain the D1 database UUID.');
const name=process.env.CLOUDFLARE_WORKER_NAME||'jutopia-calendar';
if(!/^[a-z0-9-]{3,63}$/.test(name))throw new Error('Invalid CLOUDFLARE_WORKER_NAME');
await writeFile('work/wrangler.json',JSON.stringify({
  name,main:'../dist/server/index.js',compatibility_date:'2026-01-01',workers_dev:true,
  d1_databases:[{binding:'DB',database_name:'jutopia-calendar',database_id:databaseId,migrations_dir:'../migrations'}]
},null,2));
