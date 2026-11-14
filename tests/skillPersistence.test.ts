import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('installed skill enabled persistence',()=>{
 it('returns the confirmed saved state after disabling, reloading and enabling',async()=>{
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'gwira-skills-test-'));
  vi.doMock('node:os',()=>({default:{homedir:()=>home}}));
  try {
   const folder=path.join(home,'.codex','skills','qa-skill');await fs.mkdir(folder,{recursive:true});
   await fs.writeFile(path.join(folder,'SKILL.md'),'---\nname: qa-skill\ndescription: Local persistence test\n---\nTest');
   const store=await import('../src/main/skillStore.js');
   expect((await store.listLocalSkills())[0]?.enabled).toBe(true);
   await store.disableSkill('qa-skill');
   expect((await store.listLocalSkills())[0]?.enabled).toBe(false);
   expect((await store.getSkillDetail('qa-skill'))?.enabled).toBe(false);
   vi.resetModules();const reloaded=await import('../src/main/skillStore.js');
   expect((await reloaded.listLocalSkills())[0]?.enabled).toBe(false);
   await reloaded.enableSkill('qa-skill');
   expect((await reloaded.listLocalSkills())[0]?.enabled).toBe(true);
  }finally{vi.doUnmock('node:os');await fs.rm(home,{recursive:true,force:true});}
 });
});
