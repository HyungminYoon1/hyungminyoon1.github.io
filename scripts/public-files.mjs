import { publicImagePaths } from './verify-public-image.mjs';

export const publicFiles = Object.freeze([
  'index.html',
  'about/index.html',
  'projects/index.html',
  'learning/index.html',
  'projects/nodease/index.html',
  'projects/storeops/index.html',
  'projects/hmmwv/index.html',
  'assets/styles.css',
  'assets/site.js',
  'assets/favicon.svg',
  ...publicImagePaths,
  'evidence/storeops-summary.json',
  'robots.txt',
  '.nojekyll',
]);
