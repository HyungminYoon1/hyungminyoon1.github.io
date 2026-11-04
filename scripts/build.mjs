import { copyFile, lstat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicFiles } from './public-files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
await mkdir(output, { recursive: true });
for (const file of publicFiles) {
  const input = path.join(root, file);
  if (!(await lstat(input)).isFile()) throw new Error(`Not a regular public file: ${file}`);
  const destination = path.join(output, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(input, destination);
}
console.log(`Built ${publicFiles.length} explicitly selected public files into dist/.`);
