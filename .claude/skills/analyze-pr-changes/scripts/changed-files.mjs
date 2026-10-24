#!/usr/bin/env node
// Deterministic change analysis: which changed source files are candidates for unit tests.
// Usage: node changed-files.mjs --base <ref> [--head <ref>] [--out <file>] [--max <n>]
//        node changed-files.mjs --files a.ts,b.tsx   (coverage mode: explicit file list)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1] ?? 'true']);
    return pairs;
  }, []),
);
const root = process.cwd();
const maxCandidates = Number(args.max ?? 15);
const git = (...gitArgs) => execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

// Mirrors the coverage `exclude` lists in backend/vitest.config.ts and frontend/vite.config.ts,
// plus files that contain no unit-testable logic.
const EXCLUDED = [
  [/^backend\/src\/generated\//, 'generated Prisma client'],
  [/\/types\.ts$|\.types\.ts$|\.d\.ts$/, 'type declarations only'],
  [/^frontend\/src\/design-system\//, 'design system (excluded from coverage, covered by Storybook)'],
  [/\/index\.ts$/, 'barrel re-export'],
  [/^frontend\/src\/main\.tsx$/, 'application bootstrap'],
  [/^frontend\/src\/lib\/queryClient\.ts$|\/queryKeys\.ts$|constants\.tsx?$/, 'static configuration'],
  [/\.(stories|styles|variants)\.tsx?$/, 'stories / styles'],
];
const SOURCE = [
  [/^backend\/src\/.+\.ts$/, 'backend'],
  [/^frontend\/src\/.+\.tsx?$/, 'frontend'],
];
const isTest = (p) => /^backend\/tests\//.test(p) || /\.test\.tsx?$/.test(p) || /^frontend\/src\/test\//.test(p);

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === 'generated') return [];
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}
const allTests = [...listFiles(path.join(root, 'backend/tests')), ...listFiles(path.join(root, 'frontend/src'))]
  .map((f) => path.relative(root, f).split(path.sep).join('/'))
  .filter(isTest);

/** Tests that import the module (resolved by path, not basename), plus the conventional new location. */
function testsFor(file, pkg) {
  const target = file.replace(/\.tsx?$/, '');
  const resolves = (test, specifier) => specifier.startsWith('.') &&
    path.posix.join(path.posix.dirname(test), specifier).replace(/\.(tsx?|js)$/, '').replace(/\/index$/, '') ===
      target.replace(/\/index$/, '');
  const existing = [];
  const mockedBy = [];
  for (const t of allTests) {
    const content = readFileSync(path.join(root, t), 'utf8');
    const mocked = [...content.matchAll(/vi\.mock\(\s*['"]([^'"]+)['"]/g)].some(([, s]) => resolves(t, s));
    const imported = [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)].some(([, s]) => resolves(t, s));
    // A test that replaces the module with a mock does not exercise it.
    if (mocked) mockedBy.push(t);
    else if (imported) existing.push(t);
  }
  const base = path.basename(target);
  const suggested = pkg === 'backend' ? `backend/tests/${base}.test.ts` : file.replace(/\.(tsx?)$/, '.test.$1');
  // Prefer the conventional location when it already exists among the importers.
  existing.sort((a, b) => (b === suggested) - (a === suggested));
  return { existing, mockedBy, suggested };
}

/** Changed line ranges on the head side, from a zero-context diff. */
function changedLines(file, base, head) {
  const diff = git('diff', '--unified=0', '--no-color', `${base}...${head}`, '--', file);
  return [...diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)]
    .map(([, start, count = '1']) => [Number(start), Number(start) + Number(count) - 1])
    .filter(([start, end]) => end >= start);
}

let entries;
if (args.files) {
  entries = args.files.split(',').filter(Boolean).map((p) => ({ status: 'M', path: p }));
} else {
  if (!args.base) throw new Error('--base <ref> or --files is required');
  const head = args.head ?? 'HEAD';
  entries = git('diff', '--name-status', '-M', '--no-color', `${args.base}...${head}`)
    .trim().split('\n').filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split('\t');
      return { status: status[0], path: paths.at(-1), previousPath: paths.length > 1 ? paths[0] : undefined };
    });
}

const plan = {
  mode: args.files ? 'coverage' : 'pull_request',
  base: args.base ?? null,
  head: args.head ?? 'HEAD',
  candidates: [],
  changedTests: [],
  deletedSources: [],
  skipped: [],
};
for (const entry of entries) {
  const pkg = SOURCE.find(([re]) => re.test(entry.path))?.[1];
  if (isTest(entry.path)) { plan.changedTests.push(entry.path); continue; }
  if (!pkg) { plan.skipped.push({ path: entry.path, reason: 'not application source' }); continue; }
  const excluded = EXCLUDED.find(([re]) => re.test(entry.path));
  if (excluded) { plan.skipped.push({ path: entry.path, reason: excluded[1] }); continue; }
  if (entry.status === 'D') { plan.deletedSources.push(entry.path); continue; }
  if (plan.candidates.length >= maxCandidates) { plan.skipped.push({ path: entry.path, reason: `candidate limit (${maxCandidates}) reached` }); continue; }
  const { existing, mockedBy, suggested } = testsFor(entry.path, pkg);
  plan.candidates.push({
    path: entry.path,
    package: pkg,
    status: { A: 'added', M: 'modified', R: 'renamed', C: 'copied' }[entry.status] ?? entry.status,
    previousPath: entry.previousPath,
    changedLines: plan.mode === 'coverage' ? 'all' : changedLines(entry.path, args.base, plan.head),
    existingTests: existing,
    mockedBy,
    suggestedTest: existing.length ? existing[0] : suggested,
  });
}
plan.packages = [...new Set([...plan.candidates.map((c) => c.package),
  ...plan.changedTests.map((t) => t.split('/')[0])])].sort();
plan.shouldRun = plan.candidates.length > 0;

const json = JSON.stringify(plan, null, 2);
if (args.out) {
  mkdirSync(path.dirname(path.resolve(root, args.out)), { recursive: true });
  writeFileSync(path.resolve(root, args.out), `${json}\n`);
}
process.stdout.write(`${json}\n`);
