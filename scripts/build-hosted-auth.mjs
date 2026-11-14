import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
const code=await new Promise(resolve=>spawn('node_modules/.bin/tsc',['-p','tsconfig.server.json'],{stdio:'inherit'}).on('exit',resolve));
if(code)process.exit(code);
const target='dist-server/server/hostedAuth';await fs.mkdir(target,{recursive:true});
for(const file of ['accept.html','accept.js','accept.css'])await fs.copyFile('server/hostedAuth/'+file,target+'/'+file);
await fs.copyFile('src/renderer/assets/gwira-logo.png',target+'/gwira-logo.png');
await fs.copyFile('src/renderer/tokens.css',target+'/tokens.css');
console.log('Hosted acceptance build ready. No deployment performed.');
