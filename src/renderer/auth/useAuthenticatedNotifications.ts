import {useEffect, useRef, useState} from 'react';
import type {CloudNotification} from '../../shared/cloudNotifications.js';
import type {ExpectedWorkspace} from '../../shared/scopedPreferences.js';

export function useAuthenticatedNotifications(scope: ExpectedWorkspace | undefined) {
 const [items,setItems]=useState<CloudNotification[]>([]);
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[marking,setMarking]=useState<string>();
 const sequence=useRef(0),live=useRef(false),lock=useRef(false);
 useEffect(()=>{
  live.current=true;setItems([]);
  if(scope)void refresh();
  const timer=window.setInterval(()=>{if(scope)void refresh();},30000);
  return()=>{window.clearInterval(timer);live.current=false;sequence.current++;};
 },[scope?.userId,scope?.organizationId]);
 async function load(afterMark=false):Promise<void>{
  if(!scope||(lock.current&&!afterMark))return;
  const request=++sequence.current;setLoading(true);setError('');
  try{
   const result=await window.codexDesktop.notifications.request({type:'list'},scope);
   if(!Array.isArray(result))throw Error('Invalid notification response.');
   if(live.current&&request===sequence.current)setItems(result);
  }catch{if(live.current&&request===sequence.current)setError('Notifications could not be loaded. Check your connection and try again.');}
  finally{if(live.current&&request===sequence.current)setLoading(false);}
 }
 async function refresh():Promise<void>{await load();}
 async function markRead(id:string):Promise<void>{
  if(!scope||lock.current)return;
  lock.current=true;setMarking(id);setError('');const request=++sequence.current;
  try{
   await window.codexDesktop.notifications.request({type:'mark_read',id},scope);
   if(live.current&&request===sequence.current)await load(true);
  }catch{if(live.current&&request===sequence.current)setError('Could not mark this notification as read. Try again.');}
  finally{lock.current=false;if(live.current)setMarking(undefined);}
 }
 return {items,loading,error,marking,refresh,markRead};
}
