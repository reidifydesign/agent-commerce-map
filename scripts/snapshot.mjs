// Rewrites data/snapshots from the pinned sources in src/sources.mjs. Run once per re-verification.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotAll, httpText } from '../src/snapshot.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'snapshots');
fs.mkdirSync(dir, { recursive: true });
let last = 0;
const slow = async (url) => { // be gentle with the hosts
  const wait = Math.max(0, last + 1000 - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  return httpText(url);
};
const snaps = await snapshotAll(slow, 'pinned');
for (const [k, v] of Object.entries(snaps)) {
  fs.writeFileSync(path.join(dir, `${k}.json`), JSON.stringify(v, null, 1) + '\n');
  console.log('wrote', k + '.json', `${(JSON.stringify(v).length / 1024).toFixed(0)} KB`);
}
if (snaps.ucp.missing.length) console.log('UCP refs not found at the pinned ref:', snaps.ucp.missing.join(', '));
