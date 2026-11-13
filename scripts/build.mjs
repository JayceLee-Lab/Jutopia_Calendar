import {readFile,mkdir,writeFile,copyFile,cp} from 'node:fs/promises';
const assets={};
for(const [path,file,type] of [
 ['/index.html','web/index.html','text/html; charset=utf-8'],
 ['/style.css','web/style.css','text/css; charset=utf-8'],
 ['/app.js','web/app.js','text/javascript; charset=utf-8'],
 ['/lunar-data.js','src/lunar-data.js','text/javascript; charset=utf-8'],
 ['/calendar.js','src/calendar.js','text/javascript; charset=utf-8'],
 ['/holidays.json','data/holidays.json','application/json; charset=utf-8']
]) assets[path]={body:await readFile(file,'utf8'),type};
assets['/ju-topia-logo-v1.png']={base64:(await readFile('web/assets/ju-topia-logo-v1.png')).toString('base64'),type:'image/png'};
const source=await readFile('src/worker.js','utf8');
const utility=(await readFile('src/lunar-data.js','utf8')).replaceAll('export ','')+'\n'+(await readFile('src/calendar.js','utf8')).replace(/^import .*;\n/,'').replaceAll('export ','');
const worker=source.replace(/^import .*;\n/,'').replace('__ASSETS__',JSON.stringify(assets));
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',utility+'\n'+worker);
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built self-contained Worker + calendar assets.');

await cp('drizzle','dist/drizzle',{recursive:true});
