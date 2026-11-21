import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicFiles } from './public-files.mjs';
import { verifyPublicImage } from './verify-public-image.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const allowed = new Set(publicFiles);
const htmlFiles = publicFiles.filter(file => file.endsWith('.html'));
const content = new Map();
const buffers = new Map();
const ids = new Map();
const decoder = new TextDecoder('utf-8', { fatal: true });
let localLinks = 0;
let externalLinks = 0;
for (const file of publicFiles) {
  const bytes = await readFile(path.join(root, file));
  buffers.set(file, bytes);
  if (/\.(?:png|webp)$/.test(file)) {
    verifyPublicImage(file, bytes);
    continue;
  }
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
  for (const label of ['소개', '프로젝트', '학습 기록']) {
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
  for (const match of content.get(file).matchAll(/\b(?:href|src|srcset)="([^"]+)"/g)) {
    const raw = match[1];
    assert(!raw.startsWith('javascript:'), `Unsafe link: ${file}`);
    const resolved = new URL(raw, `https://portfolio.invalid/${file}`);
    if (resolved.origin !== 'https://portfolio.invalid') {
      assert.equal(resolved.protocol, 'https:', `Non-HTTPS external reference: ${file}`);
      assert(resolved.hostname === 'github.com' || ['https://hyungminyoon1.github.io/web-lab/', 'https://www.dvidshub.net/image/6823052/humvee'].includes(resolved.href), `Unexpected external destination: ${file}`);
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
const about = content.get('about/index.html');
const projects = content.get('projects/index.html');
const learning = content.get('learning/index.html');
assert(home.includes('<h1 class="sr-only">윤형민 개발 포트폴리오</h1>'));
assert(home.includes('<span>윤형민</span></a>') && home.includes('class="motion-control"'));
assert(home.includes('src="/assets/flow-sculpture.webp"') && home.includes('srcset="/assets/flow-sculpture-portrait.webp"'));
// A tile represents a short stretch of one fiber. Check the atlas and its
// coordinate map together so that an image or layout edit cannot shift the light.
for (const [shape, background] of [['wide', 'flow-sculpture'], ['tall', 'flow-sculpture-portrait']]) {
  const scene = JSON.parse(content.get('assets/fiber-' + shape + '.json'));
  const atlas = buffers.get('assets/fiber-' + shape + '.png');
  const photo = buffers.get('assets/' + background + '.webp');
  assert.deepEqual([scene.width, scene.height], [photo.readUInt16LE(26) & 0x3fff, photo.readUInt16LE(28) & 0x3fff]);
  assert(scene.tile > scene.step && scene.step > 0 && scene.columns > 0);
  const groups = new Set(scene.tracks.map(track => track.group));
  for (const group of ['inlet', 'upper', 'middle', 'lower']) assert(groups.has(group));
  let tiles = 0;
  for (const { xy } of scene.tracks) {
    assert(xy.length >= 4 && xy.length % 2 === 0);
    assert(xy.every((v, i) => Number.isInteger(v) && v >= 0 && v < (i % 2 ? scene.height : scene.width)));
    tiles += xy.length / 2;
  }
  assert.equal(atlas.readUInt32BE(16), scene.tile * scene.columns);
  assert.equal(atlas.readUInt32BE(20), scene.tile * Math.ceil(tiles / scene.columns));
}
assert(!home.includes('portrait.png') && !home.includes('project-row') && !home.includes('reading-list'));
assert(/<img [^>]*alt="윤형민의 프로필 사진"[^>]*>\s*<figcaption[^>]*>서울사이버대학교 컴퓨터공학과 재학<\/figcaption>/.test(about));
assert(about.includes('<h2 id="profile-title">안녕하세요. <span>백엔드 개발자 윤형민입니다.</span></h2>'));
assert(about.includes('<p>AI로 문서를 찾고 반복 업무를 줄이는 도구를 만듭니다.</p>'));
assert(about.includes('AI 코딩 도구'));
assert(learning.includes('AI Helpdesk') && learning.includes('WEB LAB'));
assert.equal((projects.match(/class="project-row"/g) || []).length, 3);
for (const project of ['nodease', 'storeops', 'hmmwv']) {
  const card = projects.match(new RegExp('<article class="project-row" data-project="' + project + '">([\\s\\S]*?)</article>'))?.[1];
  const link = card?.match(/<a class="project-summary"[^>]*>([\s\S]*?)<\/a>/)?.[0];
  assert(link?.includes(`href="/projects/${project}/"`) && link.includes('<img ') && link.includes('class="project-description"'), `Image and description must open ${project}`);
  assert(project === 'storeops' ? card.includes('GitHub 저장소 비공개') && !card.includes('https://github.com/') : card.includes('https://github.com/'));
}
assert(!['203.3', '42.4', '24.5%', '86.3%', '32개'].some(value => projects.includes(value)), 'Keep test results in the case studies');
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
  assert((await readFile(path.join(root, 'dist', file))).equals(buffers.get(file)), `Stale build: ${file}`);
}

const urlFlag = process.argv.find(arg => arg.startsWith('--url='));
let httpChecks = 0;
if (urlFlag) {
  const base = new URL(urlFlag.slice('--url='.length));
  assert.equal(base.hostname, '127.0.0.1', 'Verification only accepts the loopback preview.');
  for (const file of publicFiles.filter(file => file !== '.nojekyll')) {
    const response = await fetch(new URL(file, base));
    assert.equal(response.status, 200, `HTTP response: ${file}`);
    assert(Buffer.from(await response.arrayBuffer()).equals(buffers.get(file)), `HTTP content: ${file}`);
    if (/\.(?:png|webp)$/.test(file)) assert(response.headers.get('content-type')?.startsWith('image/' + file.split('.').pop()));
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
