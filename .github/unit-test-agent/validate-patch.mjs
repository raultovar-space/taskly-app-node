#!/usr/bin/env node
// Second, independent enforcement layer: the agent's patch may only add or modify
// regular, text test files. Usage: node validate-patch.mjs <agent.patch> [--json out.json]
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { isTestPath } from '../../.claude/hooks/policy.mjs';

const [patchFile, , out] = process.argv.slice(2);
const MAX_BYTES = 512 * 1024;
const errors = [];
const files = new Map();

if (statSync(patchFile).size > MAX_BYTES) errors.push(`patch is larger than ${MAX_BYTES} bytes`);
const patch = readFileSync(patchFile, 'utf8');
let current = null;
for (const line of patch.split('\n')) {
  const header = line.match(/^diff --git a\/(\S+) b\/(\S+)$/);
  if (header) {
    current = header[2];
    files.set(current, 'modified');
    if (header[1] !== header[2]) errors.push(`${current}: renames are not allowed`);
    if (!isTestPath(current)) errors.push(`${current}: not an allowed test path`);
    continue;
  }
  if (!current) continue;
  if (/^new file mode /.test(line)) {
    files.set(current, 'added');
    if (!/^new file mode 100644$/.test(line)) errors.push(`${current}: only regular non-executable files are allowed (${line})`);
  } else if (/^deleted file mode /.test(line)) errors.push(`${current}: deleting files is not allowed`);
  else if (/^(old|new) mode /.test(line)) errors.push(`${current}: mode changes are not allowed`);
  else if (/^(GIT binary patch|Binary files )/.test(line)) errors.push(`${current}: binary content is not allowed`);
  else if (/^(rename|copy) (from|to) /.test(line)) errors.push(`${current}: renames/copies are not allowed`);
}
if (patch.trim() && !files.size) errors.push('patch has content but no file headers');

const result = { ok: errors.length === 0, files: [...files].map(([path, change]) => ({ path, change })), errors };
if (out) writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
