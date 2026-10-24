#!/usr/bin/env node
// Run typecheck / Vitest / coverage for one package and print a compact, model-friendly summary.
// Usage: node run-tests.mjs --package backend|frontend [--typecheck] [--files t1,t2] [--format|--format-check]
//                           [--coverage] [--sources s1,s2] [--coverage-dir dir] [--json out.json]
// Child processes get a minimal environment: API keys and tokens never reach code under test.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isTestPath } from '../../../hooks/policy.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const list = (name) => (option(name) ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const root = process.cwd();
const pkg = option('package');
if (!['backend', 'frontend'].includes(pkg)) {
  console.error('--package must be "backend" or "frontend"');
  process.exit(64);
}
const cwd = path.join(root, pkg);
const bin = (name) => path.join(cwd, 'node_modules', '.bin', name);
if (!existsSync(bin('vitest'))) {
  console.error(`${pkg}/node_modules is missing; dependencies must be installed before the agent runs.`);
  process.exit(65);
}

const SAFE_ENV = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'CI', 'NODE_OPTIONS', 'NODE_ENV', 'SystemRoot'];
const env = Object.fromEntries(SAFE_ENV.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
env.TZ = 'UTC';
env.FORCE_COLOR = '0';
const TIMEOUT_MS = 10 * 60 * 1000;

function run(command, args) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status ?? (result.signal ? 124 : 1), output: `${result.stdout ?? ''}${result.stderr ?? ''}`, ms: Date.now() - started };
}
const clip = (text, lines = 25) => {
  const all = text.replace(/\x1b\[[0-9;]*m/g, '').trim().split('\n');
  return all.length > lines ? [...all.slice(0, lines), `… (${all.length - lines} more lines)`].join('\n') : all.join('\n');
};
const rel = (p) => path.relative(root, p).split(path.sep).join('/');

const report = { package: pkg, ok: true };

if (flag('typecheck')) {
  const tc = run(bin('tsc'), ['--noEmit', '-p', 'tsconfig.json']);
  report.typecheck = { ok: tc.status === 0, ms: tc.ms, errors: tc.status === 0 ? '' : clip(tc.output, 40) };
  report.ok &&= report.typecheck.ok;
}

const files = list('files').map((f) => {
  const repoPath = f.startsWith(`${pkg}/`) ? f : `${pkg}/${f}`;
  if (!isTestPath(repoPath)) throw new Error(`${repoPath} is not a test file`);
  if (!existsSync(path.join(root, repoPath))) throw new Error(`${repoPath} does not exist`);
  return path.relative(pkg, repoPath);
});
if ((flag('format') || flag('format-check')) && pkg === 'frontend' && files.length) {
  const fmt = run(bin('prettier'), [flag('format') ? '--write' : '--check', ...files]);
  report.format = { ok: fmt.status === 0, output: fmt.status === 0 ? '' : clip(fmt.output, 20) };
  report.ok &&= report.format.ok;
}
const coverage = flag('coverage');
// Helpers such as fixtures can be formatted but are not test entry points.
const testFiles = coverage ? [] : files.filter((f) => /\.test\.tsx?$/.test(f));
// Per-file coverage thresholds only make sense for the whole suite.
if (coverage && files.length) console.error('--coverage runs the whole package suite; --files is ignored.');
const runVitest = coverage || testFiles.length > 0 || files.length === 0;

const scratch = path.join(root, '.agent-output', `vitest-${pkg}-${process.pid}.json`);
mkdirSync(path.dirname(scratch), { recursive: true });
const coverageDir = path.resolve(root, option('coverage-dir') ?? path.join(pkg, 'coverage'));
const vitestArgs = ['run', ...testFiles, '--reporter=default', '--reporter=json', `--outputFile.json=${scratch}`];
if (coverage) vitestArgs.push('--coverage', '--coverage.reporter=json-summary', '--coverage.reporter=text', `--coverage.reportsDirectory=${coverageDir}`);
const vt = runVitest ? run(bin('vitest'), vitestArgs) : null;

let results = null;
try { results = JSON.parse(readFileSync(scratch, 'utf8')); } catch { /* reported below */ }
rmSync(scratch, { force: true });
if (!vt) {
  // Only helper files were given: nothing to execute.
} else if (!results) {
  report.tests = { ok: false, error: clip(vt.output, 60) };
  report.ok = false;
} else {
  const failures = results.testResults.flatMap((file) => {
    const failed = file.assertionResults.filter((a) => a.status === 'failed')
      .map((a) => ({ file: rel(file.name), test: a.fullName, message: clip(a.failureMessages.join('\n'), 20) }));
    // A file can fail to load (syntax error, bad import) without any assertion results.
    if (!failed.length && file.status === 'failed') failed.push({ file: rel(file.name), test: '(file failed to run)', message: clip(file.message ?? '', 20) });
    return failed;
  });
  report.tests = {
    ok: results.numFailedTests === 0 && failures.length === 0,
    files: results.testResults.length,
    total: results.numTotalTests,
    passed: results.numPassedTests,
    failed: results.numFailedTests,
    skipped: results.numPendingTests + (results.numTodoTests ?? 0),
    ms: vt.ms,
    failures,
  };
  report.ok &&= report.tests.ok;
}

if (coverage) {
  const summaryFile = path.join(coverageDir, 'coverage-summary.json');
  if (existsSync(summaryFile)) {
    const summary = JSON.parse(readFileSync(summaryFile, 'utf8'));
    const pick = (m) => ({ lines: m.lines.pct, branches: m.branches.pct, functions: m.functions.pct, statements: m.statements.pct });
    const perFile = Object.fromEntries(Object.entries(summary).filter(([k]) => k !== 'total').map(([k, v]) => [rel(k), pick(v)]));
    const sources = list('sources');
    report.coverage = {
      total: pick(summary.total),
      files: sources.length ? Object.fromEntries(sources.map((s) => [s, perFile[s] ?? null])) : perFile,
      // Vitest exits non-zero when configured thresholds fail even if every test passed.
      thresholdsOk: !(report.tests?.ok && vt.status !== 0),
    };
    report.ok &&= report.coverage.thresholdsOk;
    if (!report.coverage.thresholdsOk) report.coverage.thresholdErrors = clip(vt.output.split('\n').filter((l) => /threshold/i.test(l)).join('\n'), 15);
  } else {
    report.coverage = { error: 'coverage-summary.json was not produced' };
    report.ok = false;
  }
}

const out = option('json');
if (out) {
  mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
  writeFileSync(path.resolve(root, out), `${JSON.stringify(report, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.ok ? 0 : 1);
