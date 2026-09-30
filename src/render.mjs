import { SOURCES } from './sources.mjs';

const LABEL = { 'do-now': 'DO NOW', wait: 'WAIT', 'ignore-checkout': 'IGNORE CHECKOUT', ignore: 'IGNORE' };

export function wrap(s, width = 92, indent = '  ') {
  const words = String(s).split(/\s+/);
  const lines = [];
  let cur = indent;
  for (const w of words) {
    if (cur.trim() && (cur + ' ' + w).length > width) {
      lines.push(cur);
      cur = indent + w;
    } else cur = cur.trim() ? cur + ' ' + w : indent + w;
  }
  if (cur.trim()) lines.push(cur);
  return lines.join('\n');
}

export function renderVerdict(v, { full = false } = {}) {
  const L = [`Which agent-commerce protocol can a small shop ignore?   (a dated opinion: read ${v.meta.verified}, review by ${v.meta.next_review})`, ''];
  const w = Math.max(...v.items.map((i) => i.protocol.split(' (')[0].length));
  for (const i of v.items) L.push(`${(LABEL[i.verdict] || i.verdict).padEnd(18)}${i.protocol.split(' (')[0].padEnd(w + 2)}${i.headline}`);
  if (full) {
    L.push('');
    for (const i of v.items) {
      L.push(`${i.protocol}`, wrap(i.plain));
      for (const e of i.evidence) L.push(wrap(`${e.claim} (${e.publisher}, ${e.published}, read ${e.read}) ${e.url}`, 92, '    - '));
      L.push('');
    }
    L.push(wrap(v.meta.caveat), '', wrap(v.meta.how_to_read), '');
    for (const u of v.unverified) L.push(wrap(u));
  } else {
    L.push('', 'Run "verdict --full" for the reasons and every source, with dates.');
  }
  return L.join('\n');
}

export function renderVerdictMarkdown(v) {
  const L = [];
  L.push(`| Protocol | Verdict for a small shop | In one line |`, `| --- | --- | --- |`);
  for (const i of v.items) L.push(`| ${i.protocol} | **${LABEL[i.verdict] || i.verdict}** | ${i.headline} |`);
  L.push('');
  for (const i of v.items) {
    L.push(`### ${i.protocol}`, '', `**${i.headline}**`, '', i.plain, '');
    for (const e of i.evidence) L.push(`- ${e.claim} ([${e.publisher}](${e.url}), ${e.published}, read ${e.read})`);
    L.push('');
  }
  return L.join('\n');
}

const ICON = { ready: 'READY', not: 'NOT READY' };

export function renderCheck(target, results) {
  const L = [`agent-commerce-map check  ${target}`, `  checked against ACP ${SOURCES.acp.pinned.label}, UCP ${SOURCES.ucp.pinned.label}, schema.org ${SOURCES.schemaorg.pinned.label}`, ''];
  for (const r of results) {
    L.push(`${r.model.kind}  ${r.model.name || '(no name)'}   ${r.model.variants.length} variant${r.model.variants.length === 1 ? '' : 's'}`);
    for (const x of [r.acp, r.ucp]) {
      const label = x.protocol === 'ACP' ? 'ACP feed   ' : 'UCP catalog';
      const problems = x.errors.length + x.issues.filter((i) => i.level === 'missing').length;
      L.push(`  ${label}  ${x.ready ? 'OK  ' : 'FAIL'}  ${x.ready ? ICON.ready : ICON.not}${x.ready ? '' : `  (${problems} problem${problems === 1 ? '' : 's'})`}`);
      for (const e of x.errors) L.push(`                  - ${e}`);
      for (const i of x.issues.filter((i) => i.level === 'missing' || i.level === 'warn')) L.push(`                  ${i.level === 'warn' ? 'WARN' : 'hint'} ${i.where}: ${i.msg}`);
    }
    const uncarried = r.coverage.filter((c) => !c.acp || !c.ucp);
    if (uncarried.length) {
      L.push('  In your markup, but one or both protocols have no field for it:');
      for (const c of uncarried) L.push(`    ${c.concept.padEnd(34)} ACP ${c.acp ? 'yes' : 'no '}   UCP ${c.ucp ? 'yes' : 'no '}`);
    }
    L.push('');
  }
  return L.join('\n').replace(/\n+$/, '\n');
}
