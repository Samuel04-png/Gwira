const {app,BrowserWindow}=require('electron');const fs=require('node:fs/promises'),path=require('node:path');
app.setPath('userData','/tmp/gwira-auth-live-qa');process.env.ELECTRON_RENDERER_URL??='http://127.0.0.1:5175/';
const nativeFetch=globalThis.fetch;globalThis.fetch=async(...args)=>{const response=await nativeFetch(...args);if(String(args[0]).includes('/auth/v1/otp')){let code;try{const body=await response.clone().json();code=body.code||body.error_code;}catch{}console.log(JSON.stringify({operation:'otp',status:response.status,providerCode:typeof code==='string'?code:undefined}));}return response;};
const recipient=process.env.GWIRA_AUTH_TEST_EMAIL;
const out=path.resolve(process.env.GWIRA_AUTH_TEST_ARTIFACT_DIR||'artifacts/workflow/authentication-supabase/live'),wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{await fs.mkdir(out,{recursive:true});await import('../dist/main/main.js');await app.whenReady();let w;for(let i=0;i<100;i++){w=BrowserWindow.getAllWindows()[0];if(w&&!w.webContents.isLoading())break;await wait(100);}w.setTitle('Gwira — Authentication verification');w.setContentSize(1100,760);w.show();w.focus();
 const ev=s=>w.webContents.executeJavaScript(s,true);for(let i=0;i<100;i++){if(await ev(`document.querySelector('.account-screen')?.dataset.authPhase==='signed_out'`))break;await wait(100);}
 await fs.writeFile(path.join(out,'welcome.png'),(await w.webContents.capturePage()).toPNG());
 if(process.env.GWIRA_SEND_AUTH_TEST_OTP==='1'){
  if(!recipient||!/^\S+@\S+\.\S+$/.test(recipient))throw Error('Set the explicitly authorized test email.');
  await ev(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Continue with Email')?.click()`);await wait(200);
  await ev(`(()=>{const e=document.querySelector('input[type=email]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(recipient)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait(100);await ev(`document.querySelector('.account-panel form').requestSubmit()`);
  for(let i=0;i<200;i++){const phase=await ev(`document.querySelector('.account-screen')?.dataset.authPhase`);if(phase==='awaiting_verification'||phase==='error'||phase==='signed_out') {if(i>3)break;}await wait(100);}
  const result=await ev(`({phase:document.querySelector('.account-screen')?.dataset.authPhase,error:document.querySelector('.account-error')?.textContent})`);console.log(JSON.stringify(result));await fs.writeFile(path.join(out,'otp-request.json'),JSON.stringify(result,null,2));await fs.writeFile(path.join(out,'otp-entry-or-error.png'),(await w.webContents.capturePage()).toPNG());
 }
 // Leave only this QA window available for the authorized recipient to enter their code.
 console.log('AUTH_LIVE_QA_WINDOW_READY');
})().catch(e=>{console.error(e.message);app.exit(1)});
