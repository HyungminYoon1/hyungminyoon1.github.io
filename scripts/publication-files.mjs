import { publicFiles } from './public-files.mjs';

export const repositoryFiles = Object.freeze([
  ...publicFiles,
  '.gitignore',
  'README.md',
  'package.json',
  'scripts/public-files.mjs',
  'scripts/publication-files.mjs',
  'scripts/build.mjs',
  'scripts/preview.mjs',
  'scripts/verify.mjs',
  'scripts/audit-publication.mjs',
  '.github/workflows/pages.yml',
]);
