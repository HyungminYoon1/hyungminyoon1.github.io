import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Each entry identifies one visually reviewed, metadata-free derivative.
const reviewed = new Map([
  ['assets/title-about.png', [1184, 224, 'ebd8232aa925726f392c25713c6599d14e848c46eb10f1a814d67e2048c68e15']],
  ['assets/title-about-mobile.png', [454, 228, '4bf47990375ed28bf4f8da90b5615fb965304f05b77f3d655cb54d291ecd943e']],
  ['assets/title-projects.png', [1184, 224, '04c3f82c96072264e92240b1f3710d5f43c2b6fba89ee265a785b65d26abd2fe']],
  ['assets/title-projects-mobile.png', [454, 228, '83c5dad1323199510cd7f85a0d7b95f0511a443cfacf60bb540b04572a2b8640']],
  ['assets/title-learning.png', [1184, 224, 'd3d278232d3f371f0997921162c0759b2bc8c977f71cc3ded575faae99d17259']],
  ['assets/title-learning-mobile.png', [454, 228, 'e0e6b0867c7900e1ca65dfaf212bd535bb467a5751683a84fc09d56e78e1ee1a']],
  ['assets/fiber-wide.png', [1024, 624, '355e81565f57880c2a2cedbd57f803ec7049f359f3ca18233a576a3e554fc341']],
  ['assets/fiber-tall.png', [1024, 448, '7a9bbebb1f14f96ed39fb9e564a179a4110ca3d09435435635676580838a7d6f']],
  ['assets/flow-sculpture.webp', [1672, 941, 'cba5984d257ddb6474008cf3bd59e1bfa79692c7dff38de6c24e36aed112d832']],
  ['assets/flow-sculpture-portrait.webp', [941, 1672, '994468ba2955804b80471010e45072d5f9e47d1aa964b98de91c02f2389124a1']],
  ['assets/portrait.png', [540, 720, '76bd8ac93e2f95356e683121187478f1ac57878e0edec45e1c14dbf23122efa0']],
  ['assets/nodease-workflow.png', [1680, 953, '2d9a03fd32de39657d347768c97d492adce04d2a0beda63b4ab2f3e142abea36']],
  ['assets/nodease-workflow-thumb.webp', [480, 273, 'b9835b34c8989871c55cdc4c51491b9724e24370f2337c1847e3b6aad485fcad']],
  ['assets/storeops-approval.png', [1280, 780, 'e058f39a6a5a9e675bb1ffd2b4a234bdf5a6b83e44ee15b3907dbf5353f68571']],
  ['assets/storeops-approval-thumb.webp', [480, 293, 'a225bab27dc4fb8e213433678b93dca3228c93517299a9a6bd2310f8222c4ce9']],
  ['assets/hmmwv-vehicle.png', [818, 499, '6f826b7777d8678ba851cf147a4158a0695044b863f79a1531369e3656cfe22e']],
  ['assets/hmmwv-vehicle-thumb.webp', [480, 293, '4ea83734441530cd104b3699aed9c82498c89891a19c30b0c550f2a2d0b8e611']],
  ['assets/hmmwv-manual-cover.png', [918, 1188, '90b603ebaedecd7145e56e8c57e379f400f1fefd82ba6cc2b4a296172c169e1f']],
]);
export const publicImagePaths = Object.freeze([...reviewed.keys()]);

// These files occur only in earlier releases and retain their original digests.
const retiredImages = new Map([
  ['assets/workbench.webp', [1672, 941, '0264b636df67ca483dbe1049277c44217c1ede0b12883075b5303c8007376ec7']],
  ['assets/workbench-mobile.webp', [600, 941, '788012050e45fd5882c48dfe2451f891cdc272219abbadc5eeae5e009984b9a1']],
]);
export const retiredImagePaths = Object.freeze([...retiredImages.keys()]);

function checkPng(bytes) {
  assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Invalid PNG');
  let offset = 8;
  const chunks = [];
  while (offset < bytes.length) {
    assert(offset + 12 <= bytes.length, 'Truncated PNG chunk');
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    assert(['IHDR', 'IDAT', 'IEND'].includes(type), 'Unexpected PNG metadata');
    assert(offset + length + 12 <= bytes.length, 'Invalid PNG chunk length');
    chunks.push(type);
    offset += length + 12;
    if (type === 'IEND') break;
  }
  assert.equal(offset, bytes.length, 'Unexpected data after PNG');
  assert.equal(chunks[0], 'IHDR');
  assert.equal(chunks.at(-1), 'IEND');
  assert(chunks.includes('IDAT'));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

function checkWebp(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'Unexpected WebP container size');
  assert.equal(bytes.toString('ascii', 8, 16), 'WEBPVP8 ', 'Expected a single opaque WebP frame');
  const size = bytes.readUInt32LE(16);
  assert.equal(20 + size + size % 2, bytes.length, 'Unexpected WebP metadata or frame');
  assert(bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a])), 'Invalid WebP frame');
  return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
}

export function verifyPublicImage(file, bytes, historical = false) {
  const approved = reviewed.get(file) ?? (historical && retiredImages.get(file));
  assert(approved, 'Unreviewed image path');
  const [width, height, digest] = approved;
  const size = file.endsWith('.webp') ? checkWebp(bytes) : checkPng(bytes);
  assert.deepEqual(size, [width, height], 'Unexpected pixel dimensions');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), digest, 'Image differs from the reviewed asset');
}
