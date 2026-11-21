import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryFiles } from './publication-files.mjs';
import { publicFiles } from './public-files.mjs';
import { verifyPublicImage } from './verify-public-image.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const decoder = new TextDecoder('utf-8', { fatal: true });
const findings = [];
const rules = [
  ['email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
  ['phone', /(?<![A-Za-z0-9])(?:\+82[- ]?)?01[016789][- ]?\d{3,4}[- ]?\d{4}(?![A-Za-z0-9])/],
  ['identity-number', /(?<![A-Za-z0-9])\d{6}[- ]?[1-8]\d{6}(?![A-Za-z0-9])/],
  ['personal-date-field', /(?:date.of.birth|birthdate|생년월일)\s*["']?\s*[:=]\s*["']?\d{4}[.\-/ ]\d{1,2}[.\-/ ]\d{1,2}/i],
  ['local-absolute-path', /file:\/\/|\b[A-Z]:[\\/]|\\Users\\[A-Za-z0-9_-]+/i],
  ['cloud-access-key', /(?:AKIA|ASIA)[A-Z0-9]{16}/],
  ['service-secret', /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['session-token', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['literal-credential', /(?:password|passwd|secret|api[_-]?key|access[_-]?key)\s*["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i],
];

function inspect(file, bytes, location = file) {
  if (/\.(?:png|webp)$/.test(file)) {
    verifyPublicImage(file, bytes);
    return;
  }
  const text = decoder.decode(bytes);
  for (const [rule, pattern] of rules) {
    const match = pattern.exec(text);
    if (match) findings.push({ file: location, rule, line: text.slice(0, match.index).split('\n').length });
  }
  // Findings deliberately contain locations and categories, never matched values.
}

function git(args) {
  return execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
}

async function filesIn(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await filesIn(path.join(directory, entry.name), relative + '/'));
    else { assert(entry.isFile(), 'Non-regular deployment entry'); files.push(relative); }
  }
  return files;
}

assert.equal(new Set(repositoryFiles).size, repositoryFiles.length);
for (const file of repositoryFiles) {
  const fullPath = path.join(root, file);
  const stat = await lstat(fullPath);
  assert(stat.isFile() && stat.size < 1024 * 1024, 'Unexpected publication file type or size');
  inspect(file, await readFile(fullPath));
}

const tracked = git(['ls-files', '-z']).toString('utf8').split('\0').filter(Boolean);
assert(tracked.every(file => repositoryFiles.includes(file)), 'Tracked file outside the approved publication list');
if (process.argv.includes('--staged')) {
  assert.deepEqual([...tracked].sort(), [...repositoryFiles].sort(), 'Staged publication list differs from the reviewed list');
  for (const file of tracked) inspect(file, git(['show', `:${file}`]), `index:${file}`);
}

const deployedFiles = await filesIn(path.join(root, 'dist'));
assert.deepEqual(deployedFiles.sort(), [...publicFiles].sort(), 'Deployment artifact contains unexpected files');
for (const file of publicFiles) inspect(file, await readFile(path.join(root, 'dist', file)), `dist:${file}`);

let historyFiles = 0;
if (process.argv.includes('--history')) {
  for (const commit of git(['rev-list', '--all']).toString('utf8').trim().split('\n').filter(Boolean)) {
    const entries = git(['ls-tree', '-r', '--name-only', '-z', commit]).toString('utf8').split('\0').filter(Boolean);
    for (const file of entries) {
      assert(repositoryFiles.includes(file), 'Historical file outside the publication list');
      inspect(file, git(['show', `${commit}:${file}`]), `history:${commit.slice(0, 7)}:${file}`);
      historyFiles += 1;
    }
  }
}

console.log(JSON.stringify({ status: findings.length ? 'FAIL' : 'PASS',
  sourceFiles: repositoryFiles.length, artifactFiles: deployedFiles.length,
  stagedChecked: process.argv.includes('--staged'), historyFiles,
  findings, scanLimit: 'Pattern checks plus manual review; not an anonymity guarantee.' }, null, 2));
if (findings.length) process.exitCode = 1;
