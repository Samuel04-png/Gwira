/** Local guidance only. Supabase remains authoritative; no passwords leave the app for scoring. */
export function passwordStrength(value:string):{score:number;label:string;common:boolean}{
 if(!value)return {score:0,label:'Use at least 12 characters',common:false};
 const normalized=value.toLowerCase().replace(/[^a-z0-9]/g,'');
 const common=/(password|qwerty|letmein|welcome|123456|administrator|iloveyou)/.test(normalized)||/^(.)\1+$/.test(normalized)||/^(abc|123|test)+$/.test(normalized);
 const score=common||value.length<12?1:value.length<16?2:value.length<22?3:4;
 return {score,label:common?'Weak · avoid common passwords':['','Weak · use at least 12 characters','Fair · try a longer phrase','Good · a longer phrase is stronger','Strong · keep it unique'][score],common};
}
