#!/usr/bin/env node
// Extract the agent's final report from Claude Code's JSON output and validate it
// against the report schema. Usage: node parse-result.mjs <claude.json> <schema.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [claudeFile, schemaFile, outFile] = process.argv.slice(2);
const run = JSON.parse(readFileSync(claudeFile, 'utf8'));
const schema = JSON.parse(readFileSync(schemaFile, 'utf8'));

function extract() {
  if (run.structured_output) return run.structured_output;
  const text = String(run.result ?? '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}

// Minimal JSON-Schema subset validator (type, enum, required, properties,
// additionalProperties:false, items, maxItems, maxLength, minimum) — no dependencies.
function validate(value, node, at, errors) {
  const types = [node.type].flat().filter(Boolean);
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array'
    : Number.isInteger(value) ? 'integer' : typeof value;
  if (types.length && !types.some((t) => t === actual || (t === 'number' && actual === 'integer'))) {
    errors.push(`${at}: expected ${types.join('|')}, got ${actual}`);
    return;
  }
  if (node.enum && !node.enum.includes(value)) errors.push(`${at}: ${JSON.stringify(value)} not in ${node.enum.join(', ')}`);
  if (typeof value === 'string' && node.maxLength && value.length > node.maxLength) errors.push(`${at}: longer than ${node.maxLength}`);
  if (typeof value === 'number' && node.minimum !== undefined && value < node.minimum) errors.push(`${at}: below ${node.minimum}`);
  if (actual === 'array') {
    if (node.maxItems && value.length > node.maxItems) errors.push(`${at}: more than ${node.maxItems} items`);
    value.forEach((item, i) => node.items && validate(item, node.items, `${at}[${i}]`, errors));
  }
  if (actual === 'object') {
    for (const key of node.required ?? []) if (!(key in value)) errors.push(`${at}.${key}: required`);
    for (const [key, child] of Object.entries(value)) {
      if (node.properties?.[key]) validate(child, node.properties[key], `${at}.${key}`, errors);
      else if (node.additionalProperties === false) errors.push(`${at}.${key}: unexpected property`);
    }
  }
}

let report;
try {
  report = extract();
} catch (error) {
  console.error(`Agent output is not valid JSON: ${error.message}`);
  process.exit(1);
}
const errors = [];
validate(report, schema, '$', errors);
if (errors.length) {
  console.error(`Agent report does not match the schema:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
report.meta = {
  turns: run.num_turns,
  costUsd: run.total_cost_usd,
  durationMs: run.duration_ms,
  permissionDenials: (run.permission_denials ?? []).length,
};
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
console.error(`agent report: decision=${report.decision} turns=${run.num_turns} cost_usd=${run.total_cost_usd} denials=${report.meta.permissionDenials}`);
