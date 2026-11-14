import {createContext,useContext} from 'react';
import type {AccountCommand,AccountSnapshot} from '../../shared/accountAuth.js';

/** Supplied by the account gate while a new workspace owner is in first-run Home. */
export interface FirstRunHost {
 snapshot:AccountSnapshot;
 /** Runs an account command and resolves with the resulting snapshot (undefined if the connection failed). */
 command(command:AccountCommand):Promise<AccountSnapshot|undefined>;
 signOut():void;
}
export const FirstRunContext=createContext<FirstRunHost|undefined>(undefined);
export const useFirstRun=():FirstRunHost|undefined=>useContext(FirstRunContext);
