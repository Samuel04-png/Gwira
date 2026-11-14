export interface AuthConfiguration {url:string;publishableKey:string;environment:'development'|'staging'|'production';google:boolean;callbackPort:number;apiUrl?:string;}
export function authConfiguration(env:Readonly<Record<string,string|undefined>>,options:{packaged?:boolean}={}):AuthConfiguration|undefined {
 const raw=env.GWIRA_SUPABASE_URL,key=env.GWIRA_SUPABASE_PUBLISHABLE_KEY,environment=env.GWIRA_AUTH_ENVIRONMENT;
 if(!raw||!key)return undefined;
 if(!['development','staging','production'].includes(environment??''))throw Error('Choose the approved authentication environment.');
 if(options.packaged&&environment!=='production')throw Error('Packaged Gwira requires production authentication configuration.');
 const url=new URL(raw);const local=environment==='development'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname);
 if((url.protocol!=='https:'&&!local)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Configure a trusted Supabase project URL.');
 // Legacy service-role and secret keys are deliberately rejected.
 if(!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key))throw Error('Configure a Supabase public publishable key, never a service credential.');
 const port=Number(env.GWIRA_AUTH_CALLBACK_PORT??43821);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Configure a valid loopback callback port.');
 let apiUrl:string|undefined;if(env.GWIRA_AUTH_API_URL){const u=new URL(env.GWIRA_AUTH_API_URL);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('Configure the trusted HTTPS account API origin.');apiUrl=u.origin;}
 return {url:url.origin,publishableKey:key,environment:environment as AuthConfiguration['environment'],google:env.GWIRA_GOOGLE_AUTH_ENABLED==='true'&&env.GWIRA_GOOGLE_CALLBACK_CONFIGURED==='true',callbackPort:port,apiUrl};
}
