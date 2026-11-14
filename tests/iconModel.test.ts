import {describe,it,expect} from 'vitest';
import {navigationIconWeight,primaryNavigationSelection,normalizeIndicatorStatus} from '../src/renderer/components/iconModel.js';
import type {WorkspaceView} from '../src/renderer/navigationState.js';
describe('intentional icon states',()=>{
 it('fills only reviewed navigation silhouettes',()=>{for(const name of ['home','dashboard','clock','review']){expect(navigationIconWeight(name,true)).toBe('fill');expect(navigationIconWeight(name,false)).toBe('regular');}for(const name of ['library','views','more','threads','settings','work'])expect(navigationIconWeight(name,true)).toBe('regular');});
 it.each(['home','business']as const)('Schedule selects only Schedule even in %s context',context=>expect(primaryNavigationSelection('schedule',context)).toBe('schedule'));
 it('assigns Library to Home regardless of the previous context',()=>{expect(primaryNavigationSelection('library','home')).toBe('home');expect(primaryNavigationSelection('library','business')).toBe('home');});
 it.each(['home','chat','dashboard','inbox','my-work','organization','teams','agents','doats','integrations','settings','skills','work-sessions','schedule','library']as WorkspaceView[])('assigns exactly one rail destination to %s',view=>expect(['home','dashboard','schedule','more']).toContain(primaryNavigationSelection(view,'business')));
 it.each([['running','working'],['in_progress','working'],['awaiting_review','waiting'],['waiting_approval','waiting'],['error','failed'],['stopped','cancelled'],['unavailable','warning'],['todo','pending'],['planning','pending'],['done','completed'],['default','idle'],['unsupported','warning']])('normalizes %s without changing execution state',(status,result)=>expect(normalizeIndicatorStatus(status)).toBe(result));
});
