import React, { useEffect, useState } from 'react';
import { MessageActionButton } from './MessageActionButton.js';

type Playback = {id?: string; phase: 'idle' | 'starting' | 'speaking' | 'paused'; error?: string};
let playback: Playback = {phase:'idle'};
let active: SpeechSynthesisUtterance | undefined;
const listeners = new Set<(next: Playback) => void>();
function publish(next: Playback): void { playback = next; listeners.forEach(listener => listener(next)); }
function stopReading(): void { active = undefined; window.speechSynthesis?.cancel(); publish({phase:'idle'}); }
function spokenResponse(element: HTMLElement | null): string {
 if (!element) return '';
 const copy = element.cloneNode(true) as HTMLElement;
 copy.querySelectorAll('pre,code,button,img,script,style,.message-image-collection,.image-lightbox,.message-file-attachments').forEach(node => node.remove());
 copy.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,tr,td,th,blockquote').forEach(node => node.appendChild(document.createTextNode(' ')));
 return (copy.textContent ?? '').replace(/\s+/g,' ').trim();
}

/** One system speech playback owner for both conversation surfaces. UI reflects real events. */
export function ReadAloudControl({id, response, running, text, label = 'Read aloud'}: {text?: string; label?: string; id: string; response: React.RefObject<HTMLDivElement | null>; running: boolean}): React.ReactElement | null {
 const [state, setState] = useState(playback);
 const [available, setAvailable] = useState(false);
 useEffect(() => {
  listeners.add(setState);
  const synth = window.speechSynthesis;
  const check = (): void => setAvailable(!!synth && typeof SpeechSynthesisUtterance !== 'undefined' && synth.getVoices().length > 0 && !!(text ?? spokenResponse(response.current)));
  check(); synth?.addEventListener('voiceschanged',check);
  return () => {listeners.delete(setState); synth?.removeEventListener('voiceschanged',check); if (playback.id === id) stopReading();};
 }, [id, running, response, text]);
 if (!available) return null;
 const own = state.id === id;
 function toggle(): void {
  if (own && state.phase !== 'idle') {stopReading(); return;}
  const content = text ?? spokenResponse(response.current); if (!content) return;
  stopReading(); const utterance = new SpeechSynthesisUtterance(content); active = utterance;
  utterance.onstart = () => {if (active === utterance) publish({id,phase:'speaking'});};
  utterance.onpause = () => {if (active === utterance) publish({id,phase:'paused'});};
  utterance.onresume = () => {if (active === utterance) publish({id,phase:'speaking'});};
  utterance.onend = () => {if (active === utterance) {active=undefined; publish({phase:'idle'});}};
  utterance.onerror = () => {if (active === utterance) {active=undefined; publish({id,phase:'idle',error:'Could not read aloud. Check your system voice settings and try again.'});}};
  publish({id,phase:'starting'});
  try {window.speechSynthesis.speak(utterance);} catch {active=undefined; publish({id,phase:'idle',error:'Could not start the system voice. Check your speech settings and try again.'});}
 }
 return <><MessageActionButton label={own && state.phase === 'starting' ? 'Cancel starting speech' : own && state.phase !== 'idle' ? 'Stop reading' : label} icon={own && state.phase !== 'idle' ? 'stop' : 'read-aloud'} onClick={toggle} disabledReason={running ? 'Read aloud is available when this response finishes.' : undefined} pressed={own && state.phase !== 'idle'}/>{own && (state.phase==='speaking'||state.phase==='paused') && typeof window.speechSynthesis.pause==='function' && typeof window.speechSynthesis.resume==='function' ? <MessageActionButton label={state.phase==='paused'?'Resume reading':'Pause reading'} icon={state.phase==='paused'?'read-aloud':'paused'} onClick={()=>{try{if(state.phase==='paused')window.speechSynthesis.resume();else window.speechSynthesis.pause();}catch{publish({id,phase:state.phase,error:'The system voice could not pause or resume. Use Stop reading to stop playback.'});}}}/> : null}{own && state.error ? <span className="message-action-error" role="status">{state.error}</span> : null}</>;
}
