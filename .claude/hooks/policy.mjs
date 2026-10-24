// Single source of truth for what the unit-test agent may touch.
// Used by the PreToolUse guard (at agent run time) and by validate-patch.mjs
// (in the secret-free verify job), so a bypass of one layer is caught by the other.
import path from 'node:path';

/** Repository-relative paths the agent may create or modify and that may be committed. */
export const TEST_PATH_PATTERNS = [
  /^backend\/tests\/[\w./-]+\.ts$/,
  /^frontend\/src\/[\w./-]+\.test\.tsx?$/,
  /^frontend\/src\/test\/[\w./-]+\.tsx?$/,
];

/** Scratch files for the agent's own bookkeeping; never committed. */
export const SCRATCH_PATH_PATTERNS = [/^\.agent-output\/[\w.-]+\.(json|md)$/];

/** Files the agent must never read, even inside the repository. */
export const SECRET_PATH_PATTERNS = [/(^|\/)\.env(\.|$)/, /(^|\/)\.git\//, /(^|\/)\.npmrc$/, /\.pem$/, /id_[rd]sa/];

const SAFE_ARG = String.raw`[\w./@=:,+^~%-]+`;
/** Commands the agent may run. No shell metacharacters can match these. */
export const COMMAND_PATTERNS = [
  new RegExp(String.raw`^node \.claude/skills/[a-z-]+/scripts/[a-z-]+\.mjs( ${SAFE_ARG})*$`),
  new RegExp(String.raw`^git (diff|log|show|status)( ${SAFE_ARG})*$`),
];
const FORBIDDEN_GIT_FLAGS = /(^|\s)--(output|ext-diff|textconv|exec)/;

export function toRepoPath(root, filePath) {
  const absolute = path.resolve(root, filePath);
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative;
}

export const isTestPath = (p) => TEST_PATH_PATTERNS.some((re) => re.test(p));
export const isWritablePath = (p) => isTestPath(p) || SCRATCH_PATH_PATTERNS.some((re) => re.test(p));
export const isSecretPath = (p) => SECRET_PATH_PATTERNS.some((re) => re.test(p));
export const isAllowedCommand = (command) => {
  const normalized = command.trim();
  return COMMAND_PATTERNS.some((re) => re.test(normalized)) && !FORBIDDEN_GIT_FLAGS.test(normalized);
};
