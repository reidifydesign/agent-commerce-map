import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));

export const loadCrosswalk = () => read('data', 'crosswalk.json');
export const loadVerdict = () => read('data', 'verdict.json');
export const loadSnapshots = () => ({
  acp: read('data', 'snapshots', 'acp.json'),
  ucp: read('data', 'snapshots', 'ucp.json'),
  schemaorg: read('data', 'snapshots', 'schemaorg.json')
});
