import { makeResolvers } from './pathcheck.mjs';

// Which of the two protocols can carry the field at all.
export function rowStatus(row) {
  const a = !!row.acp, u = !!row.ucp;
  if (a && u) return 'both protocols';
  if (a) return 'ACP only';
  if (u) return 'UCP only';
  return 'neither protocol';
}

// Every path in every row must resolve in its snapshot. Returns the list of broken paths.
export function verifyCrosswalk(crosswalk, snaps) {
  const res = makeResolvers(snaps);
  const broken = [];
  for (const row of crosswalk.rows) {
    for (const proto of ['acp', 'ucp', 'schemaorg']) {
      for (const p of row[proto] || []) {
        const r = res[proto](p.path);
        if (!r.found) broken.push({ row: row.id, protocol: proto, path: p.path, reason: r.note });
      }
    }
  }
  return broken;
}

export function summarise(crosswalk) {
  const counts = {};
  for (const r of crosswalk.rows) counts[rowStatus(r)] = (counts[rowStatus(r)] || 0) + 1;
  return counts;
}

const cell = (list) => (list && list.length ? list.map((x) => x.path).join(', ') : '(none)');

export function renderTable(crosswalk, { group } = {}) {
  const rows = crosswalk.rows.filter((r) => !group || r.group === group);
  const lines = [];
  let cur = null;
  for (const r of rows) {
    if (r.group !== cur) {
      cur = r.group;
      lines.push('', crosswalk.meta.groups[cur].toUpperCase());
    }
    lines.push(`  ${r.concept}`);
    lines.push(`    ACP         ${cell(r.acp)}`);
    lines.push(`    UCP         ${cell(r.ucp)}`);
    lines.push(`    schema.org  ${cell(r.schemaorg)}`);
    if (r.gap) lines.push(`    gap         ${r.gap}`);
  }
  return lines.join('\n').replace(/^\n/, '');
}

export function renderMarkdown(crosswalk) {
  const out = [];
  const esc = (s) => String(s).replace(/\|/g, '\|');
  const fmt = (list) => (list && list.length ? list.map((x) => '`' + x.path + '`' + (x.note ? ' (' + esc(x.note) + ')' : '')).join('<br>') : '**none**');
  let cur = null;
  for (const r of crosswalk.rows) {
    if (r.group !== cur) {
      if (cur) out.push('');
      cur = r.group;
      out.push(`### ${crosswalk.meta.groups[cur]}`, '', '| Concept | ACP | UCP | schema.org | Gap or conversion |', '| --- | --- | --- | --- | --- |');
    }
    const note = [r.transform, r.gap].filter(Boolean).map(esc).join(' ');
    out.push(`| ${esc(r.concept)} | ${fmt(r.acp)} | ${fmt(r.ucp)} | ${fmt(r.schemaorg)} | ${note} |`);
  }
  return out.join('\n');
}
