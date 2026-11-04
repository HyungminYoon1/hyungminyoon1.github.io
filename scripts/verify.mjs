import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicFiles } from './public-files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const allowed = new Set(publicFiles);
const htmlFiles = publicFiles.filter(file => file.endsWith('.html'));
const content = new Map();
const ids = new Map();
const decoder = new TextDecoder('utf-8', { fatal: true });
let localLinks = 0;
let externalLinks = 0;
for (const file of publicFiles) {
  const bytes = await readFile(path.join(root, file));
  assert(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), `UTF-8 BOM: ${file}`);
  const text = decoder.decode(bytes);
  assert(!text.includes('\uFFFD'), `Replacement character: ${file}`);
  content.set(file, text);
  assert(!/file:\/\/|\b[A-Z]:[\\/]|\\Users\\/i.test(text), `Local path: ${file}`);
  assert(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text), `Email address: ${file}`);
  assert(!/(?<![A-Za-z0-9])01[016789][- ]?\d{3,4}[- ]?\d{4}(?![A-Za-z0-9])/.test(text), `Phone number: ${file}`);
  assert(!/AKIA[A-Z0-9]{16}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(text), `Credential pattern: ${file}`);
  if (!file.endsWith('.html')) continue;
  assert(text.includes('<html lang="ko">'), `Missing language: ${file}`);
  assert(text.includes('<meta charset="UTF-8">'), `Missing encoding: ${file}`);
  assert(text.includes('http-equiv="Content-Security-Policy"'), `Missing static-host CSP: ${file}`);
  assert(text.includes('name="referrer" content="no-referrer"'), `Missing referrer policy: ${file}`);
  assert(!text.includes('content="noindex'), `Draft indexing policy: ${file}`);
  assert(!text.includes('개발 기록실'), `Outdated site name: ${file}`);
  assert(!text.includes('백엔드와 AI 응용 개발'), `Outdated field heading: ${file}`);
  assert(!text.includes('프로젝트의 전체 테스트를 다시 실행한 것은 아닙니다'), `Authoring note in public project copy: ${file}`);
  assert(/<title>[^<]+ \| 개발 포트폴리오<\/title>/.test(text), `Unexpected site title: ${file}`);
  const navigation = text.match(/<nav\b[\s\S]*?<\/nav>/)?.[0] || '';
  for (const label of ['프로젝트', '문제 해결 사례', '학습과 실험']) {
    assert(navigation.includes(`>${label}</a>`), `Missing navigation label ${label}: ${file}`);
  }
  assert.equal((text.match(/<h1\b/g) || []).length, 1, `Expected one main heading: ${file}`);
  assert.equal((text.match(/<main\b/g) || []).length, 1, `Expected main landmark: ${file}`);
  const entries = [...text.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(entries).size, entries.length, `Duplicate IDs: ${file}`);
  ids.set(file, new Set(entries));
  assert(!/<(?:iframe|form)\b/i.test(text), `Unexpected embedded app or data collection: ${file}`);
  assert(!/\son[a-z]+\s*=/i.test(text), `Inline event handler: ${file}`);
  for (const figure of text.matchAll(/<figure\b([^>]*)>([\s\S]*?)<\/figure>/g)) {
    const captionId = figure[1].match(/aria-labelledby="([^"]+)"/)?.[1];
    assert(captionId && entries.includes(captionId), `Missing diagram caption reference: ${file}`);
    assert(figure[2].includes(`<figcaption id="${captionId}">`), `Missing readable diagram caption: ${file}`);
  }
}
for (const file of htmlFiles) {
  for (const match of content.get(file).matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const raw = match[1];
    assert(!raw.startsWith('javascript:'), `Unsafe link: ${file}`);
    const resolved = new URL(raw, `https://portfolio.invalid/${file}`);
    if (resolved.origin !== 'https://portfolio.invalid') {
      assert.equal(resolved.protocol, 'https:', `Non-HTTPS external reference: ${file}`);
      assert.equal(resolved.hostname, 'github.com', `Unexpected external host: ${file}`);
      externalLinks += 1;
      continue;
    }
    let destination = decodeURIComponent(resolved.pathname).replace(/^\//, '');
    if (!destination || destination.endsWith('/')) destination += 'index.html';
    assert(allowed.has(destination), `Missing public link: ${file} -> ${raw}`);
    if (resolved.hash) assert(ids.get(destination)?.has(decodeURIComponent(resolved.hash.slice(1))), `Missing anchor: ${file} -> ${raw}`);
    localLinks += 1;
  }
}

const home = content.get('index.html');
assert(home.includes('<h1>백엔드 및 AI 응용 개발</h1>'));
assert.equal((home.match(/class="project-row"/g) || []).length, 3);
for (const project of ['nodease', 'storeops', 'hmmwv']) assert(home.includes(`data-project="${project}"`));
assert(!home.includes('data-project-filters'), 'The three-project overview must not hide content behind filters.');
assert(!home.includes('class="hero"'), 'The home page should start with a compact factual introduction.');
assert(home.includes('203.3') && home.includes('42.4') && home.includes('합성 지연'));
assert(home.includes('AI 코딩 도구'));
const nodease = content.get('projects/nodease/index.html');
assert.equal((nodease.match(/<figure class="process-diagram"/g) || []).length, 3);
for (const caption of ['nodease-structure-title', 'nodease-version-title', 'nodease-search-title']) assert(nodease.includes(`id="${caption}"`));
for (const value of ['203.3ms', '42.4ms', '20회', '합성 지연', '31문항']) assert(nodease.includes(value));
const storeops = content.get('projects/storeops/index.html');
assert.equal((storeops.match(/<figure class="process-diagram"/g) || []).length, 2);
for (const value of ['storeops-approval-title', 'storeops-outcome-title', 'OUTCOME_UNKNOWN', '자동 재실행 차단', '검사 통과 후 실행']) assert(storeops.includes(value));
for (const value of ['단일 프로세스', '32개', '자동 재시도 0회', '현재는 운영 중지']) assert(storeops.includes(value));
const hmmwv = content.get('projects/hmmwv/index.html');
assert.equal((hmmwv.match(/<figure class="process-diagram"/g) || []).length, 3);
for (const caption of ['hmmwv-comparison-title', 'hmmwv-pipeline-title', 'hmmwv-evaluation-title']) assert(hmmwv.includes(`id="${caption}"`));
for (const value of ['60문항 × 2조건 × 3회차 = 360개 요청', '첫 회차 120개 답변', '모범답안', '외부 정비 전문가의 독립 검증', '833쪽', '8,344개 청크', '최대 500토큰']) assert(hmmwv.includes(value));
for (const value of ['47문항', '24.5%', '86.3%', '26.6%', '80.0%', '답변을 확인한 뒤', 'AI로 검토']) assert(hmmwv.includes(value));
assert.equal((hmmwv.match(/<dl class="metric-definitions">/g) || []).length, 1, 'Explain evaluation metrics once.');
assert(hmmwv.indexOf('<dl class="metric-definitions">') < hmmwv.indexOf('<div class="comparison-panel">'), 'Explain metrics before showing their results.');
const summary = JSON.parse(content.get('evidence/storeops-summary.json'));
assert.equal(summary.original_verification_date, '2026-08-20');
assert.equal(summary.source.sha256.length, 64);

async function listFiles(directory, prefix = '') {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) found.push(...await listFiles(path.join(directory, entry.name), relative + '/'));
    else { assert(entry.isFile(), `Unexpected non-regular build entry: ${relative}`); found.push(relative); }
  }
  return found;
}
const builtFiles = await listFiles(path.join(root, 'dist'));
assert.deepEqual(builtFiles.sort(), [...publicFiles].sort(), 'Build must contain exactly the selected public files.');
for (const file of publicFiles) {
  assert.equal(await readFile(path.join(root, 'dist', file), 'utf8'), content.get(file), `Stale build: ${file}`);
}

const urlFlag = process.argv.find(arg => arg.startsWith('--url='));
let httpChecks = 0;
if (urlFlag) {
  const base = new URL(urlFlag.slice('--url='.length));
  assert.equal(base.hostname, '127.0.0.1', 'Verification only accepts the loopback preview.');
  for (const file of publicFiles.filter(file => file !== '.nojekyll')) {
    const response = await fetch(new URL(file, base));
    assert.equal(response.status, 200, `HTTP response: ${file}`);
    assert.equal(await response.text(), content.get(file), `HTTP content: ${file}`);
    httpChecks += 1;
  }
  for (const privatePath of ['.git/config', '.env', 'README.md', 'package.json', 'docs/evidence.md', '.local/', 'output/']) {
    const response = await fetch(new URL(privatePath, base));
    assert.equal(response.status, 404, `Non-public file available: ${privatePath}`);
    httpChecks += 1;
  }
  const rejected = await fetch(base, { method: 'POST' });
  assert.equal(rejected.status, 405);
  httpChecks += 1;
}
console.log(JSON.stringify({ status: 'PASS', htmlPages: htmlFiles.length, publicFiles: publicFiles.length,
  localLinks, externalReferences: externalLinks, httpChecks, privacyPatternScan: 'PASS',
  actualProjectTestsRerun: false, verificationScope: 'Portfolio content and selected files' }, null, 2));
