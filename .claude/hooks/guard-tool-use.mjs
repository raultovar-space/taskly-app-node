#!/usr/bin/env node
// PreToolUse hook: deterministic allowlist for the unit-test agent.
// Exit code 2 blocks the tool call and feeds the reason back to the model.
import { realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import { isAllowedCommand, isSecretPath, isWritablePath, toRepoPath } from './policy.mjs';

const input = JSON.parse(await new Response(process.stdin).text());
const root = realpathSync(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const tool = input.tool_name;
const args = input.tool_input ?? {};

function deny(reason) {
  process.stderr.write(`Blocked by unit-test-agent policy: ${reason}\n`);
  process.exit(2);
}

// Resolve symlinks of the closest existing ancestor so a link cannot escape the repository.
function resolveInRepo(filePath) {
  let probe = path.resolve(root, filePath);
  const suffix = [];
  while (!existsSync(probe) && probe !== path.dirname(probe)) {
    suffix.unshift(path.basename(probe));
    probe = path.dirname(probe);
  }
  return toRepoPath(root, path.join(realpathSync(probe), ...suffix));
}

switch (tool) {
  case 'Edit':
  case 'MultiEdit':
  case 'Write':
  case 'NotebookEdit': {
    const target = resolveInRepo(args.file_path ?? args.notebook_path ?? '');
    if (!target) deny('writes outside the repository are not allowed.');
    if (!isWritablePath(target)) {
      deny(`"${target}" is not a test file. Only backend/tests/**, frontend/src/**/*.test.ts(x), frontend/src/test/** and .agent-output/** may be written. Report source bugs as findings instead.`);
    }
    break;
  }
  case 'Read':
  case 'Glob':
  case 'Grep': {
    const target = resolveInRepo(args.file_path ?? args.path ?? '.');
    if (target === null && (args.file_path || args.path)) deny('reading outside the repository is not allowed.');
    if (target && isSecretPath(target)) deny(`"${target}" may contain secrets.`);
    break;
  }
  case 'Bash': {
    if (!isAllowedCommand(args.command ?? '')) {
      deny('only `node .claude/skills/<skill>/scripts/<script>.mjs <args>` and read-only `git diff|log|show|status` are allowed, without shell operators.');
    }
    break;
  }
  case 'Skill':
    break;
  default:
    deny(`tool "${tool}" is not available to this agent.`);
}
process.exit(0);
