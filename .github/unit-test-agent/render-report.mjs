#!/usr/bin/env node
// Render the sticky pull-request comment from the workflow artifacts.
// Usage: node render-report.mjs <artifacts-dir> > report.md
// Reads (all optional): plan.json, result.json, patch-check.json,
//   verify/<pkg>-before.json, verify/<pkg>-after.json, and env:
//   AGENT_STATUS, VERIFY_STATUS, COMMIT_SHA, PUBLISH_NOTE, RUN_URL, MODEL, HEAD_SHA.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const MARKER = '<!-- unit-test-agent-report -->';
const dir = process.argv[2] ?? '.';
const load = (name) => {
  const file = path.join(dir, name);
  try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; } catch { return null; }
};
const env = process.env;

// Agent text is untrusted: neutralise HTML, @mentions, table breaks and length.
const clean = (text, max = 400) => String(text ?? '')
  .replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'))
  .replace(/@(?=[\w-])/g, '@​')
  .replace(/\|/g, '\\|')
  .replace(/\s*\n\s*/g, ' ')
  .slice(0, max);
const code = (p) => (p ? `\`${String(p).replace(/`/g, '')}\`` : '—');
const pct = (v) => (typeof v === 'number' ? `${v.toFixed(v % 1 ? 1 : 0)}%` : '—');

const plan = load('plan.json');
const result = load('result.json');
const patchCheck = load('patch-check.json');
const packages = plan?.packages ?? [];
const verify = Object.fromEntries(packages.map((p) => [p, { before: load(`verify/${p}-before.json`), after: load(`verify/${p}-after.json`) }]));

const lines = [MARKER, '## 🧪 Unit Test Agent', ''];
const changedFiles = patchCheck?.files ?? [];
const verifiedOk = env.VERIFY_STATUS === 'success';

let headline;
if (!plan?.shouldRun) headline = '⏭️ **Skipped** — no testable source changes in this pull request.';
else if (env.AGENT_STATUS && env.AGENT_STATUS !== 'success') headline = `❌ **Agent run failed** (${clean(env.AGENT_STATUS, 40)}). No tests were changed.`;
else if (patchCheck && !patchCheck.ok) headline = '🛑 **Rejected** — the generated patch touched files outside the test allowlist and was discarded.';
else if (!verifiedOk) headline = '❌ **Verification failed** — the tests did not pass in the clean verification job; nothing was committed.';
else if (!changedFiles.length) headline = '✅ **No test changes needed** — existing tests were re-run and pass.';
else headline = `✅ **${changedFiles.length} test file(s) ${env.COMMIT_SHA ? `committed in ${env.COMMIT_SHA.slice(0, 7)}` : 'generated'}** and verified independently.`;
lines.push(headline);
if (env.PUBLISH_NOTE) lines.push('', `> ${clean(env.PUBLISH_NOTE, 300)}`);
if (result?.summary) lines.push('', `> ${clean(result.summary, 1200)}`);

if (result?.files?.length) {
  lines.push('', '### Decisions', '', '| Source | Decision | Test file | New cases | Rationale |', '| --- | --- | --- | --- | --- |');
  const icon = { create: '🆕 create', update: '✏️ update', none: '➖ none' };
  for (const f of result.files) {
    lines.push(`| ${code(f.source)} | ${icon[f.decision] ?? clean(f.decision, 20)} | ${code(f.testFile)} | ${f.testsAdded ?? 0} | ${clean(f.rationale)} |`);
  }
}

if (packages.length && Object.values(verify).some((v) => v.after || v.before)) {
  lines.push('', '### Verification (independent job, no secrets)', '', '| Package | Typecheck | Tests before → after | Coverage thresholds | Total lines (before → after) |', '| --- | --- | --- | --- | --- |');
  for (const [pkg, { before, after }] of Object.entries(verify)) {
    const r = after ?? before;
    const summary = (t) => (t && t.total !== undefined ? `${t.ok ? '✅' : '❌'} ${t.passed}/${t.total}` : '—');
    const tests = `${summary(before?.tests)} → ${summary(after?.tests)} passed`;
    const tc = r?.typecheck ? (r.typecheck.ok ? '✅' : '❌') : '—';
    const th = r?.coverage ? (r.coverage.thresholdsOk ? '✅' : '❌') : '—';
    lines.push(`| ${pkg} | ${tc} | ${tests} | ${th} | ${pct(before?.coverage?.total?.lines)} → ${pct(after?.coverage?.total?.lines)} |`);
  }
  const rows = plan.candidates.map((c) => {
    const b = verify[c.package]?.before?.coverage?.files?.[c.path];
    const a = verify[c.package]?.after?.coverage?.files?.[c.path];
    return `| ${code(c.path)} | ${pct(b?.lines)} → **${pct(a?.lines)}** | ${pct(b?.branches)} → **${pct(a?.branches)}** |`;
  });
  lines.push('', '**Changed files coverage**', '', '| File | Lines | Branches |', '| --- | --- | --- |', ...rows);
  const failures = Object.values(verify).flatMap((v) => v.after?.tests?.failures ?? []).slice(0, 5);
  if (failures.length) {
    lines.push('', '<details><summary>Failing tests</summary>', '');
    for (const f of failures) lines.push(`- ${code(f.file)} — ${clean(f.test, 200)}`, '', '```text', String(f.message).replace(/```/g, "'''").slice(0, 1500), '```');
    lines.push('</details>');
  }
  // Flag disagreement between what the agent claims and what CI measured.
  for (const run of result?.testRuns ?? []) {
    const measured = verify[run.package]?.after?.tests;
    if (measured && (measured.total !== run.total || measured.failed !== run.failed)) {
      lines.push('', `⚠️ Agent reported ${run.passed}/${run.total} for ${run.package}; verification measured ${measured.passed}/${measured.total}. The verification result is authoritative.`);
    }
  }
}

if (patchCheck?.errors?.length) lines.push('', '### Patch policy violations', '', ...patchCheck.errors.map((e) => `- ${clean(e, 300)}`));

if (result?.findings?.length) {
  const icon = { info: 'ℹ️', warning: '⚠️', bug: '🐞', security: '🔒' };
  lines.push('', '### Findings', '', ...result.findings.map((f) => `- ${icon[f.severity] ?? '•'} ${f.file ? `${code(f.file)}: ` : ''}${clean(f.message, 600)}`));
}

const details = [];
if (result?.skillsUsed?.length) details.push(`- **Skills used:** ${result.skillsUsed.map(code).join(' → ')}`);
if (result?.meta) details.push(`- **Agent:** ${code(env.MODEL || 'unknown model')}, ${result.meta.turns} turns, $${Number(result.meta.costUsd ?? 0).toFixed(2)}, ${Math.round((result.meta.durationMs ?? 0) / 1000)}s, ${result.meta.permissionDenials} blocked tool calls`);
if (plan?.skipped?.length) details.push(`- **Not analysed:** ${plan.skipped.map((s) => `${code(s.path)} (${clean(s.reason, 80)})`).join(', ')}`);
if (plan?.deletedSources?.length) details.push(`- **Deleted sources:** ${plan.deletedSources.map(code).join(', ')}`);
if (env.HEAD_SHA) details.push(`- **Analysed commit:** ${env.HEAD_SHA.slice(0, 7)}`);
if (env.RUN_URL) details.push(`- **Workflow run:** ${env.RUN_URL}`);
if (details.length) lines.push('', '<details><summary>Run details</summary>', '', ...details, '', '</details>');

process.stdout.write(`${lines.join('\n')}\n`);
