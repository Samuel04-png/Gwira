import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProjectFileInfo } from '../shared/types.js';

const ignoredDirectories = new Set([
  '.cache',
  '.git',
  '.next',
  '.turbo',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release'
]);

const ignoredFiles = new Set(['.DS_Store']);
const sourceExtensions = new Set([
  '.c',
  '.cpp',
  '.cs',
  '.css',
  '.go',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.py',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.svelte',
  '.swift',
  '.ts',
  '.tsx',
  '.vue',
  '.yaml',
  '.yml'
]);

export interface ProjectFileScanOptions {
  limit?: number;
  maxEntries?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_FILE_LIMIT = 2_000;
const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_TIMEOUT_MS = 2_000;

export async function listProjectFiles(cwd: string, options: ProjectFileScanOptions = {}): Promise<ProjectFileInfo[]> {
  const root = path.resolve(cwd);
  const limit = options.limit ?? DEFAULT_FILE_LIMIT;
  const scan = {
    entries: 0,
    maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    deadline: Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    signal: options.signal
  };
  const files = await findProjectFiles(root, root, limit, scan);
  return scanAborted(scan) ? [] : rankProjectFiles(files).slice(0, limit);
}

interface ScanState {
  entries: number;
  maxEntries: number;
  deadline: number;
  signal?: AbortSignal;
}

async function findProjectFiles(root: string, current: string, limit: number, scan: ScanState): Promise<ProjectFileInfo[]> {
  if (scanStopped(scan)) return [];
  const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
  const files: ProjectFileInfo[] = [];

  for (const entry of entries) {
    if (files.length >= limit || scanStopped(scan)) break;
    scan.entries += 1;
    if (scan.entries > scan.maxEntries) break;
    if (shouldIgnoreEntry(entry.name, entry.isDirectory())) continue;

    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findProjectFiles(root, fullPath, limit - files.length, scan));
      continue;
    }

    if (!entry.isFile()) continue;
    files.push({ path: fullPath, relativePath: path.relative(root, fullPath) });
  }

  return files;
}

function scanAborted(scan: ScanState): boolean {
  return Boolean(scan.signal?.aborted) || Date.now() > scan.deadline;
}

function scanStopped(scan: ScanState): boolean {
  return scanAborted(scan) || scan.entries >= scan.maxEntries;
}

function rankProjectFiles(files: ProjectFileInfo[]): ProjectFileInfo[] {
  return [...files].sort((a, b) => fileRank(a) - fileRank(b) || a.relativePath.localeCompare(b.relativePath));
}

function fileRank(file: ProjectFileInfo): number {
  if (hasHiddenPathSegment(file.relativePath)) return 7;
  if (hasGeneratedPathSegment(file.relativePath)) return 6;
  if (/^(src|app|lib|components|pages)[\\/]/i.test(file.relativePath)) return 0;
  const name = path.basename(file.relativePath);
  const extension = path.extname(name).toLowerCase();
  if (name.startsWith('.')) return 5;
  if (sourceExtensions.has(extension)) return 1;
  if (!extension) return 3;
  return 2;
}

function shouldIgnoreEntry(name: string, isDirectory: boolean): boolean {
  if (isDirectory) return ignoredDirectories.has(name) || name.startsWith('.');
  return ignoredFiles.has(name);
}

function hasHiddenPathSegment(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some((segment) => segment.startsWith('.'));
}

function hasGeneratedPathSegment(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some((segment) => ignoredDirectories.has(segment));
}
