// Single source of truth for the CODEOWNERS path matcher.
//
// Used by BOTH the CI `codeowner-gate` job (dynamic import in github-script) and the `/feature`
// command (CLI, piped a list of changed files). Keeping one implementation prevents the two from
// drifting — a desync there would silently let a high-risk PR auto-merge.
//
// Supports the subset of CODEOWNERS syntax this repo uses: root-anchored directory prefixes
// ("/foo/") and exact files ("/foo/bar.ts"). Last matching pattern wins is not modeled here because
// every entry maps to the same owner; callers only care whether a file is owned at all.

import fs from 'node:fs';

/** Parse CODEOWNERS text into {pattern, owners[]} entries (skip blank/comment lines). */
export function parseCodeowners(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const p = l.split(/\s+/);
      return { pattern: p[0], owners: p.slice(1) };
    });
}

/** True if `file` (repo-root-relative) is owned by `pattern`. */
export function matches(file, pattern) {
  let p = pattern.startsWith('/') ? pattern.slice(1) : pattern;
  if (p.endsWith('/')) return file === p.slice(0, -1) || file.startsWith(p);
  return file === p || file.startsWith(p + '/');
}

/**
 * Match a list of files against parsed CODEOWNERS entries.
 * @returns {{hits: string[], owners: string[]}} unique owned files + unique owners (lowercased, no @).
 */
export function matchFiles(files, entries) {
  const owners = new Set();
  const hits = new Set();
  for (const f of files) {
    for (const e of entries) {
      if (matches(f, e.pattern)) {
        hits.add(f);
        e.owners.forEach((o) => owners.add(o.replace(/^@/, '').toLowerCase()));
      }
    }
  }
  return { hits: [...hits], owners: [...owners] };
}

// CLI classifier (not a gate — always exits 0). Reads .github/CODEOWNERS, takes changed files from
// argv or, if none, newline-separated from stdin; prints one HIGH-RISK line per owned file.
if (import.meta.url === `file://${process.argv[1]}`) {
  const run = (files) => {
    const entries = parseCodeowners(fs.readFileSync('.github/CODEOWNERS', 'utf8'));
    const owned = files.map((f) => f.trim()).filter(Boolean);
    let any = false;
    for (const f of owned) {
      for (const e of entries) {
        if (matches(f, e.pattern)) {
          const owner = e.owners.join(', ') || '(no owner)';
          console.log(`HIGH-RISK: ${f} (owner: ${owner})`);
          any = true;
          break;
        }
      }
    }
    if (!any) console.log('No high-risk paths touched.');
  };

  const argvFiles = process.argv.slice(2);
  if (argvFiles.length > 0) {
    run(argvFiles);
  } else {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (input += chunk));
    process.stdin.on('end', () => run(input.split('\n')));
  }
}
