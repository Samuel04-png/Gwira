import {createServer} from 'node:http';import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
const user='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333';let orgs=[],sent=0,refresh=0,offline=false,autoconfirm=false;const requests=[];
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');requests.push(url.pathname);if(url.pathname==='/qa/autoconfirm'){autoconfirm=true;res.end('{}');return;}if(url.pathname==='/qa/offline'){offline=true;res.end('{}');return;}if(offline){req.socket.destroy();return;}let raw='';for await(const part of req)raw+=part;let input;try{input=raw?JSON.parse(raw):{};}catch{res.writeHead(400).end();return;}let data={};
 if(url.pathname==='/auth/v1/otp'){sent++;}
 else if(url.pathname==='/auth/v1/verify'){if(input.token!=='000000'){res.writeHead(403,{'Content-Type':'application/json'}).end('{}');return;}data={access_token:'local-fixture-access',refresh_token:'local-fixture-refresh',expires_in:1};}
 else if(url.pathname==='/auth/v1/signup'){if(autoconfirm)data={access_token:'local-fixture-access',refresh_token:'local-fixture-refresh',expires_in:3600};}
 else if(url.pathname==='/auth/v1/recover'||url.pathname==='/auth/v1/resend'){}
 else if(url.pathname==='/auth/v1/token'){if(url.searchParams.get('grant_type')==='password'&&input.password!=='local-fixture-password'){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({code:'invalid_credentials'}));return;}if(url.searchParams.get('grant_type')==='refresh_token')refresh++;data={access_token:'local-fixture-access',refresh_token:'local-fixture-refresh',expires_in:3600};}
 else if(url.pathname==='/auth/v1/user')data={id:user,email:'qa@example.test',email_confirmed_at:'2026-11-03',user_metadata:{full_name:'Local QA account'}};
 else if(url.pathname==='/rest/v1/organizations')data=orgs;
 else if(url.pathname==='/rest/v1/organization_memberships')data=orgs.map((o,i)=>({organization_id:o.id,role:i===0?'owner':'member'}));
 else if(url.pathname==='/rest/v1/teams')data=[];
 else if(url.pathname==='/rest/v1/organization_invitations'||url.pathname==='/rest/v1/invitation_teams')data=[];
 else if(url.pathname==='/rest/v1/rpc/create_organization_once'){if(!orgs.length)orgs=[{id:a,name:input.p_name}];data=a;}
 else if(url.pathname==='/qa/add-organization'){orgs.push({id:b,name:'Second local QA organization'});}
 else if(url.pathname==='/auth/v1/settings')data={external:{email:true,google:false}};
 else if(url.pathname!=='/auth/v1/logout'){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(data));
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,out=path.resolve('artifacts/workflow/authentication-supabase/local-integration');await fs.mkdir(out,{recursive:true});const profile=await fs.mkdtemp(path.join(os.tmpdir(),'gwira-account-qa-'));
try{for(const phase of ['flow','restart']){await new Promise((resolve,reject)=>{const child=spawn('node_modules/.bin/electron',['scripts/authentication-qa.cjs'],{env:{...process.env,AUTH_QA_PHASE:phase,AUTH_QA_PROFILE:profile,AUTH_QA_OUTPUT:out,GWIRA_SUPABASE_URL:base,GWIRA_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_fixture_123456789',GWIRA_AUTH_ENVIRONMENT:'development',GWIRA_GOOGLE_AUTH_ENABLED:'false',ELECTRON_RENDERER_URL:process.env.ELECTRON_RENDERER_URL||'http://127.0.0.1:5175/'},stdio:'inherit'});child.on('exit',code=>code?reject(Error('Electron Auth QA failed: '+code)):resolve());});}
 if(sent!==1)throw Error('Duplicate OTP requests: '+sent);if(refresh<1)throw Error('Session refresh was not exercised');await fs.writeFile(path.join(out,'transport-results.json'),JSON.stringify({fixture:true,otpRequests:sent,refreshRequests:refresh,requestPaths:[...new Set(requests)],profile},null,2));
}finally{server.close();}
