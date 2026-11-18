import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// A single reviewed, pixel-only portrait is the only approved binary asset.
export function verifyPublicImage(bytes) {
  assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Invalid portrait PNG');
  let offset = 8;
  const chunks = [];
  while (offset < bytes.length) {
    assert(offset + 12 <= bytes.length, 'Truncated PNG chunk');
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    assert(['IHDR', 'IDAT', 'IEND'].includes(type), 'Unexpected portrait metadata');
    assert(offset + length + 12 <= bytes.length, 'Invalid PNG chunk length');
    chunks.push(type);
    offset += length + 12;
    if (type === 'IEND') break;
  }
  assert.equal(offset, bytes.length, 'Unexpected data after portrait');
  assert.equal(chunks[0], 'IHDR');
  assert.equal(chunks.at(-1), 'IEND');
  assert(chunks.includes('IDAT'));
  assert.equal(bytes.readUInt32BE(16), 540);
  assert.equal(bytes.readUInt32BE(20), 720);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    '76bd8ac93e2f95356e683121187478f1ac57878e0edec45e1c14dbf23122efa0',
    'Portrait bytes differ from the reviewed metadata-free asset');
}
