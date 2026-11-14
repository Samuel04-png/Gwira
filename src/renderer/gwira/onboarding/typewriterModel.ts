export type HintPhase='typing'|'holding'|'deleting'|'gap';
export interface HintState {index:number;length:number;phase:HintPhase}
export const initialHintState:HintState={index:0,length:0,phase:'typing'};
/** Milliseconds each phase dwells before the next step. */
export const hintTiming={type:65,hold:1800,erase:30,gap:450} as const;

export function hintDelay(state:HintState):number {
 return state.phase==='typing'?hintTiming.type:state.phase==='holding'?hintTiming.hold:state.phase==='deleting'?hintTiming.erase:hintTiming.gap;
}

/** One animation step. Pure so the cycle can be tested without timers. */
export function advanceHint(state:HintState,phrases:readonly string[]):HintState {
 const full=phrases[state.index]?.length??0;
 if(state.phase==='typing'){const length=Math.min(full,state.length+1);return {...state,length,phase:length>=full?'holding':'typing'};}
 if(state.phase==='holding')return {...state,phase:'deleting'};
 if(state.phase==='deleting'){const length=Math.max(0,state.length-1);return length===0?{index:(state.index+1)%phrases.length,length:0,phase:'gap'}:{...state,length};}
 return {...state,phase:'typing'};
}

/** The visible hint. While paused or reduced, a complete phrase is shown rather than a partial one. */
export function visibleHint(state:HintState,phrases:readonly string[],still:boolean):string {
 const phrase=phrases[state.index]??phrases[0]??'';
 return still?phrase:phrase.slice(0,state.length);
}
