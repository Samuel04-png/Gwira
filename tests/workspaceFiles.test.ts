import {describe,it,expect} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {authorizedFilePath,listWorkspaceDirectory,previewWorkspaceFile,searchWorkspaceDirectory} from '../src/main/workspaceFiles.js';
import {clampFilesPreviewRatio,DEFAULT_FILES_PREVIEW_RATIO,isMarkdownFile,parseFilesPreviewRatio,workspaceFileIcon} from '../src/renderer/workspaceTools/workspaceFilesModel.js';

describe('Files workspace presentation model',()=>{
 it('restores a valid preview ratio and uses the default for invalid values',()=>{
  expect(parseFilesPreviewRatio('64')).toBe(64);
  expect(parseFilesPreviewRatio('100')).toBe(DEFAULT_FILES_PREVIEW_RATIO);
  expect(parseFilesPreviewRatio('not-a-number')).toBe(DEFAULT_FILES_PREVIEW_RATIO);
  expect(parseFilesPreviewRatio(null)).toBe(DEFAULT_FILES_PREVIEW_RATIO);
 });
 it('clamps the preview ratio to both pane minimums as the workspace resizes',()=>{
  expect(clampFilesPreviewRatio(30,650,220,160)).toBeCloseTo(220/650*100);
  expect(clampFilesPreviewRatio(80,650,220,160)).toBeCloseTo(100-160/650*100);
  expect(clampFilesPreviewRatio(60,440,220,160)).toBe(60);
 });
 it('recognizes Markdown and maps common file types to distinct icons',()=>{
  expect(isMarkdownFile('README.MD')).toBe(true);
  expect(isMarkdownFile('readme.txt')).toBe(false);
  expect(workspaceFileIcon('diagram.png')).toBe('image');
  expect(workspaceFileIcon('guide.md')).toBe('markdown');
  expect(workspaceFileIcon('settings.json')).toBe('json');
  expect(workspaceFileIcon('records.csv')).toBe('table');
  expect(workspaceFileIcon('main.ts')).toBe('code-review');
  expect(workspaceFileIcon('notes.txt')).toBe('file');
 });
});

describe('read-only workspace file boundary',()=>{
 it('rejects traversal, absolute paths and symlink escapes while previewing real files',async()=>{const base=await fs.mkdtemp(path.join(os.tmpdir(),'gwira-files-'));const root=path.join(base,'root');await fs.mkdir(root);try{await fs.writeFile(path.join(base,'outside.txt'),'outside');await fs.writeFile(path.join(root,'inside.csv'),'a,b\n1,2');await fs.symlink(path.join(base,'outside.txt'),path.join(root,'escape'));expect((await previewWorkspaceFile(root,'inside.csv')).kind).toBe('csv');expect((await listWorkspaceDirectory(root,'')).map(e=>e.name)).toEqual(['inside.csv']);await expect(authorizedFilePath(root,'../outside.txt')).rejects.toThrow('outside');await expect(authorizedFilePath(root,path.join(root,'inside.csv'))).rejects.toThrow('inside');await expect(authorizedFilePath(root,'escape')).rejects.toThrow('outside');}finally{await fs.rm(base,{recursive:true,force:true});}});
 it('bounds previews and refuses binary or unsupported document formats',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'gwira-files-'));try{await fs.writeFile(path.join(root,'doc.docx'),'not executable');await fs.writeFile(path.join(root,'binary.bin'),Buffer.from([0,1,2]));await fs.writeFile(path.join(root,'large.txt'),Buffer.alloc(8*1024*1024+1));await expect(previewWorkspaceFile(root,'doc.docx')).rejects.toThrow('Office archive');for(const name of ['binary.bin','large.txt'])expect((await previewWorkspaceFile(root,name)).kind).toBe('unsupported');}finally{await fs.rm(root,{recursive:true,force:true});}});
 it('searches nested names without returning unrelated paths or following symlinks',async()=>{const base=await fs.mkdtemp(path.join(os.tmpdir(),'gwira-files-search-'));const root=path.join(base,'root');await fs.mkdir(path.join(root,'reports','2026'),{recursive:true});try{await fs.writeFile(path.join(root,'reports','2026','launch-brief.md'),'brief');await fs.writeFile(path.join(root,'reports','other.txt'),'other');await fs.writeFile(path.join(base,'outside-launch-brief.md'),'outside');await fs.symlink(path.join(base,'outside-launch-brief.md'),path.join(root,'escape'));const result=await searchWorkspaceDirectory(root,'LAUNCH');expect(result.truncated).toBe(false);expect(result.entries.map(entry=>[entry.name,entry.directory])).toEqual([['reports',true],['2026',true],['launch-brief.md',false]]);await expect(searchWorkspaceDirectory(root,'')).resolves.toEqual({entries:[],truncated:false});}finally{await fs.rm(base,{recursive:true,force:true});}});
});
