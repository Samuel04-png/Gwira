import {createServer,type Server} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
export interface OAuthAttempt {url:string;result:Promise<{code:string;verifier:string}>;cancel():void;}
/** Loopback owns the callback. No URL, token or native-operation input comes from a renderer. */
export async function beginOAuth(project:string,port:number,timeoutMs=300000):Promise<OAuthAttempt>{
 const verifier=randomBytes(48).toString('base64url'),nonce=randomBytes(32).toString('base64url');
 const callbackPath=`/auth/callback/${nonce}`;let server:Server;let settled=false;let timer:ReturnType<typeof setTimeout>;
 let resolve!:(value:{code:string;verifier:string})=>void,reject!:(error:Error)=>void;
 const result=new Promise<{code:string;verifier:string}>((yes,no)=>{resolve=yes;reject=no});
 // A rejected abandoned attempt is handled by its owner, even if browser launch fails.
 void result.catch(()=>{});
 const finish=(error?:Error,code?:string):void=>{if(settled)return;settled=true;clearTimeout(timer);server.close();if(error)reject(error);else resolve({code:code!,verifier});};
 server=createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");res.setHeader('Content-Type','text/plain; charset=utf-8');
  const address=server.address();const expectedHost=`127.0.0.1:${typeof address==='object'&&address?address.port:port}`;
  let url:URL;try{url=new URL(req.url??'',`http://${expectedHost}`);}catch{res.writeHead(400).end('Invalid callback.');return;}
  if(req.method!=='GET'||req.headers.host!==expectedHost||url.origin!==`http://${expectedHost}`||url.pathname!==callbackPath||settled){res.writeHead(400).end('This callback is not valid.');return;}
  const codes=url.searchParams.getAll('code');if(url.searchParams.has('error')){res.end('Sign-in was cancelled. Return to Gwira.');finish(Error('Browser sign-in was cancelled. Try again.'));return;}
  if(codes.length!==1||!codes[0]||codes[0].length>4096||[...url.searchParams.keys()].some(key=>!['code'].includes(key))){res.writeHead(400).end('The callback is incomplete. Return to Gwira and try again.');return;}
  res.end('You may close this window and return to Gwira.');finish(undefined,codes[0]);
 });
 await new Promise<void>((yes,no)=>{server.once('error',no);server.listen({host:'127.0.0.1',port,exclusive:true},()=>{server.off('error',no);yes();});});
 const address=server.address();if(!address||typeof address==='string')throw Error('Loopback unavailable');
 timer=setTimeout(()=>finish(Error('Browser sign-in expired. Try again.')),timeoutMs);timer.unref();
 const callback=`http://127.0.0.1:${address.port}${callbackPath}`,url=new URL('/auth/v1/authorize',project);
 url.search=new URLSearchParams({provider:'google',redirect_to:callback,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'s256'}).toString();
 return {url:url.toString(),result,cancel:()=>finish(Error('Browser sign-in cancelled.'))};
}
