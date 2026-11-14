import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { CodexExecManager } from '../src/main/codexExecManager.js';
import { SessionStore } from '../src/main/sessionStore.js';
import { AUTO_MODEL, classifyRoutingFailure, compatibleFallback, type RoutingPolicy, type RoutingDiagnostic } from '../src/main/modelRouting.js';
import { buildCodexExecSpawnOptions } from '../src/main/codexCommand.js';
import { parseListedModels } from '../src/main/codexModels.js';

const preferred = { model: 'preferred', provider: 'configured', capabilities: ['tools', 'images', 'streaming', 'agents'] as const, contextWindow: 10000, approved: true, privacyClass: 'local-policy', maxCostMicros: 100 };
const backup = { ...preferred, model: 'backup' };
const policy: RoutingPolicy = { preferred, alternatives: [backup], requiredCapabilities: ['tools'], requiredContext: 5000, budgetMicros: 100 };
class Child extends EventEmitter { stdout = new EventEmitter(); stderr = new EventEmitter(); kill() { return true; } }
async function setup(model = AUTO_MODEL, route: RoutingPolicy | undefined = policy) {
  const children: Child[] = [], args: string[][] = [], diagnostics: RoutingDiagnostic[] = [];
  const store = new SessionStore();
  const manager = new CodexExecManager(store, { resolveCommand: async () => 'codex', listModels: async () => [{slug:'live-default', supportedReasoningLevels:[]}],
    routingPolicy: () => route, diagnostic: event => diagnostics.push(event),
    spawnProcess: ((_file: string, argv: string[]) => { args.push(argv); const child = new Child(); children.push(child); return child; }) as unknown as typeof import('node:child_process').spawn });
  const session = manager.start({ cwd: process.cwd(), model });
  const exits: unknown[] = []; manager.on('exit', e => exits.push(e));
  await manager.sendInput({ sessionId: session.id, input: 'One request' });
  const fail = (text: string, index = children.length - 1) => { children[index].stdout.emit('data', Buffer.from(JSON.stringify({type:'error', message:text})+'\n')); children[index].emit('close',1,null); };
  return { manager, children, args, diagnostics, store, session, exits, fail };
}
describe('central model routing', () => {
  it('simulates unavailable preferred model then completes on a compatible approved fallback once', async () => {
    const t = await setup(); t.fail('Model preferred is not available');
    expect(t.args).toHaveLength(2); expect(t.args[1]).toContain('backup'); expect(t.exits).toHaveLength(0);
    t.children[1].stdout.emit('data', Buffer.from('{"type":"item.completed","item":{"type":"agent_message","text":"Done"}}\n'));
    t.children[1].emit('close',0,null); t.children[1].emit('close',0,null);
    expect(t.exits).toHaveLength(1); expect(t.store.get(t.session.id)?.status).toBe('idle');
    expect(t.store.get(t.session.id)?.messages.filter(m => m.role === 'user')).toHaveLength(1);
    expect(t.diagnostics.map(d => d.outcome)).toEqual(['retrying','completed']);
    expect(t.diagnostics[0]).toMatchObject({failureReason:'unavailable', fallbackModel:'backup'});
  });
  it.each(['permission denied', 'unauthorized model not available', 'safety refusal', 'billing quota exceeded'])('never reroutes %s', async text => {
    const t = await setup(); t.fail(text); expect(t.args).toHaveLength(1); expect(t.store.get(t.session.id)?.status).toBe('error');
  });
  it.each(['turn.started', 'item.started', 'item.completed', 'unknown.event'])('never replays after %s', async type => {
    const t = await setup(); t.children[0].stdout.emit('data', Buffer.from(JSON.stringify({type,item:{type:'command_execution',command:'send invoice'}})+'\n'));
    t.fail('Model preferred is not available'); expect(t.args).toHaveLength(1);
  });
  it('never replays ambiguous timeouts', async () => { const t=await setup();t.fail('Connection timed out');expect(t.args).toHaveLength(1);expect(t.store.get(t.session.id)?.status).toBe('error'); });
  it('bounds retries and does not report a JSON error with exit zero as success', async () => {
    const t = await setup(); t.fail('503 temporary service error');
    t.children[1].stdout.emit('data',Buffer.from('{"type":"error","message":"503 unavailable"}\n'));t.children[1].emit('close',0,null);
    expect(t.args).toHaveLength(2);expect(t.store.get(t.session.id)?.status).toBe('error');
  });
  it('keeps explicit selections and retries only transient failures before work starts', async () => {
    const t = await setup('explicit'); t.fail('rate limit 429'); expect(t.args[1]).toContain('explicit'); t.fail('rate limit 429'); expect(t.args).toHaveLength(2);
    const selected = await setup('explicit');selected.fail('Model explicit is not available');expect(selected.args).toHaveLength(1);
  });
  it('selects a live catalog model for Auto with no verified fallback policy', async () => {
    const store = new SessionStore(); let args: string[] = [];
    const manager = new CodexExecManager(store,{resolveCommand:async()=> 'codex',listModels:async()=>[{slug:'available',defaultReasoningLevel:'low',supportedReasoningLevels:['low']}],spawnProcess:((_f:string,a:string[])=>{args=a;return new Child();}) as never});
    const s=manager.start({cwd:process.cwd(),model:AUTO_MODEL});await manager.sendInput({sessionId:s.id,input:'test'});expect(args).toContain('available');expect(args).not.toContain(AUTO_MODEL);expect(args).toContain('model_reasoning_effort="low"');
  });
  it('preserves resume identity, prompt, and permission across fallback', async () => {
    const t = await setup();t.store.setCodexConversationId(t.session.id,'original-thread');t.fail('Model preferred unavailable');
    expect(t.args[1]).toContain('resume');expect(t.args[1]).toContain('original-thread');expect(t.args[1].at(-1)).toBe('One request');expect(t.args[1]).not.toContain('--dangerously-bypass-approvals-and-sandbox');
  });
  it('does not retry a cancelled request', async () => {const t=await setup();t.manager.stop({sessionId:t.session.id});t.fail('503 temporary');expect(t.args).toHaveLength(1);});
  it('finishes safely if the fallback process cannot spawn', async () => {
    const store=new SessionStore();const child=new Child();let count=0;
    const manager=new CodexExecManager(store,{resolveCommand:async()=> 'codex',routingPolicy:()=>policy,diagnostic:()=>{},spawnProcess:(()=>{if(count++)throw Error('spawn failed');return child;}) as never});
    const s=manager.start({cwd:process.cwd(),model:AUTO_MODEL});await manager.sendInput({sessionId:s.id,input:'one request'});
    child.stdout.emit('data',Buffer.from('{"type":"error","message":"Model unavailable"}\n'));
    expect(()=>child.emit('close',1,null)).not.toThrow();expect(store.get(s.id)?.status).toBe('error');
  });
  it('does not start an obsolete request after cancellation during catalog discovery', async () => {
    const store=new SessionStore();let resolveCatalog!: (models: {slug:string;supportedReasoningLevels:[]}[])=>void;let spawns=0;
    const manager=new CodexExecManager(store,{resolveCommand:async()=> 'codex',listModels:()=>new Promise(resolve=>{resolveCatalog=resolve;}),spawnProcess:(()=>{spawns++;return new Child();}) as never});
    const s=manager.start({cwd:process.cwd(),model:AUTO_MODEL});const sending=manager.sendInput({sessionId:s.id,input:'cancel before launch'});
    await new Promise(resolve=>setTimeout(resolve,0));manager.stop({sessionId:s.id});
    resolveCatalog([{slug:'live',supportedReasoningLevels:[]}]);await sending;expect(spawns).toBe(0);expect(store.get(s.id)?.status).toBe('idle');
  });
  it('fails closed for policy, capabilities, privacy, context and cost mismatches', () => {
    for(const change of [{approved:false},{provider:'other'},{privacyClass:'other'},{capabilities:[]},{contextWindow:9000},{maxCostMicros:101},{maxCostMicros:Number.NaN}]) {
      expect(compatibleFallback({...policy,alternatives:[{...backup,...change}]},new Set(['preferred']))).toBeUndefined();
    }
    expect(compatibleFallback(policy,new Set(['preferred','backup']))).toBeUndefined();
  });
  it('passes Auto through to the configured CLI default without a made-up model id', () => {
    expect(buildCodexExecSpawnOptions({cwd:'/tmp',prompt:'test',model:AUTO_MODEL}).args).not.toContain('-m');
    expect(classifyRoutingFailure('model not found; unauthorized')).toBe('restricted');
  });
  it('reads actual CLI reasoning metadata objects', () => {
    expect(parseListedModels('{"models":[{"slug":"live","visibility":"list","supported_reasoning_levels":[{"effort":"medium"}]}]}')[0].supportedReasoningLevels).toEqual(['medium']);
  });
});
