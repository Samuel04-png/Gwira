import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CodexHistoryIndex, deleteCodexHistoryFile, loadCodexHistoryMessages, pathsReferToSameDirectory, projectCandidatesFromHistories, parseSessionHistoryLines, parseSessionMessagesLines, relativeTimeLabel } from '../src/main/codexHistory.js';

const lines = [
  JSON.stringify({ timestamp: '2026-06-21T05:25:00.066Z', type: 'session_meta', payload: { id: 'thread-1', cwd: '/tmp/project', timestamp: '2026-06-21T05:24:57.616Z' } }),
  JSON.stringify({ timestamp: '2026-06-21T05:25:00.099Z', type: 'event_msg', payload: { type: 'user_message', message: '今天几号？' } }),
  JSON.stringify({ timestamp: '2026-06-21T05:26:00.099Z', type: 'event_msg', payload: { type: 'agent_message', message: '回答' } })
];

describe('parseSessionHistoryLines', () => {
  it('extracts project path, thread id, title, and updated time', () => {
    const history = parseSessionHistoryLines('/tmp/session.jsonl', lines);

    expect(history).toMatchObject({
      id: 'thread-1',
      cwd: '/tmp/project',
      title: '今天几号？',
      filePath: '/tmp/session.jsonl'
    });
    expect(history?.updatedAt).toBe('2026-06-21T05:26:00.099Z');
  });

  it('reads a recorded turn model without changing the history file', () => {
    const history = parseSessionHistoryLines('/tmp/session.jsonl', [
      JSON.stringify({ timestamp: '2026-06-21T05:25:00.000Z', type: 'session_meta', payload: { id: 'thread-1', cwd: '/tmp/project' } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:01.000Z', type: 'turn_context', payload: { model: 'gpt-5.5' } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:02.000Z', type: 'event_msg', payload: { type: 'user_message', message: 'Continue' } })
    ]);
    expect(history?.model).toBe('gpt-5.5');
  });

  it('ignores environment and AGENTS context when choosing a title', () => {
    const history = parseSessionHistoryLines('/tmp/session.jsonl', [
      JSON.stringify({ timestamp: '2026-06-21T05:25:00.000Z', type: 'session_meta', payload: { id: 'thread-1', cwd: '/tmp/project' } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:01.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>noise</environment_context>' }] } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:02.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '# AGENTS.md instructions for /tmp/project' }] } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:03.000Z', type: 'event_msg', payload: { type: 'user_message', message: '真实问题是什么？' } })
    ]);

    expect(history?.title).toBe('真实问题是什么？');
  });

  it('returns undefined when metadata is missing', () => {
    expect(parseSessionHistoryLines('/tmp/session.jsonl', ['{}'])).toBeUndefined();
  });
});

describe('CodexHistoryIndex', () => {
  it('bounds initial metadata work and reuses cached unchanged histories', async () => {
    const sessionsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-history-index-'));
    const sessionDir = path.join(sessionsRoot, '2026', '10', '14');
    await fs.mkdir(sessionDir, { recursive: true });
    for (let index = 0; index < 12; index += 1) {
      await fs.writeFile(path.join(sessionDir, `thread-${String(index).padStart(2, '0')}.jsonl`), lines.join('\n'));
    }

    let reads = 0;
    const index = new CodexHistoryIndex({
      sessionsRoot,
      maxFiles: 5,
      readMetadata: async (filePath, updatedAt) => {
        reads += 1;
        return { id: path.basename(filePath), cwd: '/tmp/project', title: 'Thread', createdAt: updatedAt, updatedAt, filePath };
      }
    });

    expect(await index.list()).toHaveLength(5);
    expect(reads).toBe(5);
    expect(await index.list()).toHaveLength(5);
    expect(reads).toBe(5);
  });

  it('refreshes only a changed file metadata entry', async () => {
    const sessionsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-history-index-'));
    const sessionDir = path.join(sessionsRoot, '2026', '10', '14');
    await fs.mkdir(sessionDir, { recursive: true });
    const first = path.join(sessionDir, 'first.jsonl');
    const second = path.join(sessionDir, 'second.jsonl');
    await fs.writeFile(first, lines.join('\n'));
    await fs.writeFile(second, lines.join('\n'));

    let reads = 0;
    const index = new CodexHistoryIndex({
      sessionsRoot,
      readMetadata: async (filePath, updatedAt) => {
        reads += 1;
        return { id: path.basename(filePath), cwd: '/tmp/project', title: 'Thread', createdAt: updatedAt, updatedAt, filePath };
      }
    });
    await index.list();
    await fs.appendFile(first, '\nchanged');
    await index.list();
    expect(reads).toBe(3);
  });

  it('coalesces concurrent list requests into one bounded refresh', async () => {
    const sessionsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-history-index-'));
    const sessionDir = path.join(sessionsRoot, '2026', '10', '14');
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(path.join(sessionDir, 'thread.jsonl'), lines.join('\n'));

    let reads = 0;
    const index = new CodexHistoryIndex({
      sessionsRoot,
      readMetadata: async (filePath, updatedAt) => {
        reads += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { id: path.basename(filePath), cwd: '/tmp/project', title: 'Thread', createdAt: updatedAt, updatedAt, filePath };
      }
    });

    await Promise.all([index.list(), index.list(), index.list()]);
    expect(reads).toBe(1);
  });
});


describe('projectCandidatesFromHistories', () => {
  it('deduplicates history cwd values and sorts by most recent use', () => {
    expect(projectCandidatesFromHistories([
      { id: 'old-a', cwd: '/tmp/app', title: 'Old', createdAt: '2026-06-21T01:00:00.000Z', updatedAt: '2026-06-21T01:00:00.000Z', filePath: '/tmp/old.jsonl' },
      { id: 'new-b', cwd: '/tmp/tooling', title: 'New', createdAt: '2026-06-21T03:00:00.000Z', updatedAt: '2026-06-21T03:00:00.000Z', filePath: '/tmp/new.jsonl' },
      { id: 'new-a', cwd: '/tmp/app', title: 'Newer', createdAt: '2026-06-21T02:00:00.000Z', updatedAt: '2026-06-21T02:00:00.000Z', filePath: '/tmp/newer.jsonl' },
      { id: 'win', cwd: 'C:\\Users\\alice\\Desktop\\mywebsite', title: 'Win', createdAt: '2026-06-21T01:30:00.000Z', updatedAt: '2026-06-21T01:30:00.000Z', filePath: '/tmp/win.jsonl' }
    ])).toEqual([
      { id: '/tmp/tooling', name: 'tooling', path: '/tmp/tooling', lastUsedAt: '2026-06-21T03:00:00.000Z', threadCount: 1 },
      { id: '/tmp/app', name: 'app', path: '/tmp/app', lastUsedAt: '2026-06-21T02:00:00.000Z', threadCount: 2 },
      { id: 'C:\\Users\\alice\\Desktop\\mywebsite', name: 'mywebsite', path: 'C:\\Users\\alice\\Desktop\\mywebsite', lastUsedAt: '2026-06-21T01:30:00.000Z', threadCount: 1 }
    ]);
  });
});

describe('parseSessionMessagesLines', () => {
  it('restores visible user and assistant messages from Codex history lines', () => {
    const messages = parseSessionMessagesLines(lines);

    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ['user', '今天几号？'],
      ['codex', '回答']
    ]);
  });

  it('restores response_item messages and skips environment context noise', () => {
    const messages = parseSessionMessagesLines([
      JSON.stringify({ timestamp: '2026-06-21T05:25:00.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>noise</environment_context>' }] } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:01.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '继续优化 UI' }] } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:02.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '已优化。' }] } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:03.000Z', type: 'response_item', payload: { type: 'function_call', name: 'exec_command', arguments: '{"cmd":"npm test"}' } })
    ]);

    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ['user', '继续优化 UI'],
      ['codex', '已优化。'],
      ['system', 'Ran npm test']
    ]);
  });

  it('restores Codex error events as system messages', () => {
    const messages = parseSessionMessagesLines([
      JSON.stringify({ timestamp: '2026-06-21T05:25:00.000Z', type: 'response_item', payload: { type: 'error', message: 'stream error: request timed out' } })
    ]);

    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ['system', 'Error\nstream error: request timed out']
    ]);
  });

  it('deduplicates matching event_msg and response_item assistant text', () => {
    const messages = parseSessionMessagesLines([
      JSON.stringify({ timestamp: '2026-06-21T05:25:00.000Z', type: 'event_msg', payload: { type: 'agent_message', message: '同一段回答' } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:00.001Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '同一段回答' }] } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:01.000Z', type: 'event_msg', payload: { type: 'agent_message', message: '下一段回答' } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:01.001Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '下一段回答' }] } })
    ]);

    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ['codex', '同一段回答\n\n下一段回答']
    ]);
  });

  it('deduplicates user response_item text already contained in an image user_message', () => {
    const messages = parseSessionMessagesLines([
      JSON.stringify({ timestamp: '2026-06-21T05:25:00.000Z', type: 'event_msg', payload: { type: 'user_message', message: '<image name=[Image #1] path="/tmp/a.png">\n</image>\n[Image #1] 如图用户发送的消息' } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:00.001Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '[Image #1] 如图用户发送的消息' }] } })
    ]);

    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ['user', '<image name=[Image #1] path="/tmp/a.png">\n</image>\n[Image #1] 如图用户发送的消息']
    ]);
  });
});

describe('loadCodexHistoryMessages', () => {
  it('streams a session file and preserves the visible transcript', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-history-messages-'));
    const filePath = path.join(directory, 'thread.jsonl');
    await fs.writeFile(filePath, lines.join('\n'));

    await expect(loadCodexHistoryMessages(filePath)).resolves.toMatchObject([
      { role: 'user', text: '今天几号？' },
      { role: 'codex', text: '回答' }
    ]);
  });
});

describe('relativeTimeLabel', () => {
  it('formats recent sessions compactly', () => {
    expect(relativeTimeLabel('2026-06-21T05:20:00.000Z', new Date('2026-06-21T05:25:00.000Z'))).toBe('5m');
    expect(relativeTimeLabel('2026-06-20T05:25:00.000Z', new Date('2026-06-21T05:25:00.000Z'))).toBe('1d');
  });
});

describe('pathsReferToSameDirectory', () => {
  it('matches a symlinked project path with its canonical directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-history-path-'));
    const project = path.join(root, 'project');
    const alias = path.join(root, 'project-alias');
    await fs.mkdir(project);
    await fs.symlink(project, alias);

    await expect(pathsReferToSameDirectory(project, alias)).resolves.toBe(true);
  });
});

describe('deleteCodexHistoryFile', () => {
  it('deletes a jsonl session file inside the Codex sessions directory', async () => {
    const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-history-delete-'));
    const sessionDir = path.join(codexHome, 'sessions', '2026', '06', '21');
    const filePath = path.join(sessionDir, 'thread.jsonl');
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(filePath, '{}\n');

    await deleteCodexHistoryFile(filePath, codexHome);

    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects paths outside the Codex sessions directory', async () => {
    const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-history-delete-'));
    const outside = path.join(codexHome, 'config.toml');
    await fs.writeFile(outside, '');

    await expect(deleteCodexHistoryFile(outside, codexHome)).rejects.toThrow('outside Codex sessions');
  });
});
