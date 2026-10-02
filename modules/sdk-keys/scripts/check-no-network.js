#!/usr/bin/env node
/**
 * Enforces that @bitgo/sdk-keys stays network-free.
 *
 * Fails if:
 *  - package.json `dependencies` or `peerDependencies` lists a network or BitGo API-layer package
 *  - a file under src/ imports a forbidden package or Node networking built-in
 *  - a file under src/ imports a bare package that is not a declared dependency (so a network
 *    client can't sneak in through a hoisted transitive dependency)
 *
 * Runs as part of `yarn lint`, which CI runs for every package.
 */
const fs = require('fs');
const path = require('path');

const FORBIDDEN_PACKAGES = [
  // BitGo layers above this package
  '@bitgo/sdk-api',
  '@bitgo/sdk-core',
  '@bitgo/blockapis',
  '@bitgo/statics',
  '@bitgo/utxo-lib',
  // HTTP / socket clients
  'axios',
  'cross-fetch',
  'got',
  'isomorphic-fetch',
  'node-fetch',
  'proxy-agent',
  'request',
  'superagent',
  'undici',
  'ws',
];

const FORBIDDEN_BUILTINS = ['child_process', 'dgram', 'dns', 'http', 'http2', 'https', 'net', 'tls'];

const ALLOWED_BUILTINS = ['assert', 'buffer', 'crypto', 'util'];

/** Package name of a bare specifier: `@scope/name/sub` -> `@scope/name`, `name/sub` -> `name`. */
function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function isRelative(specifier) {
  return specifier.startsWith('.') || specifier.startsWith('/');
}

/** Returns every module specifier used by `import`, `export ... from`, `require()` and `import()`. */
function findSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[^'";]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

/**
 * @param {string} specifier
 * @param {Set<string>} declaredDeps
 * @returns {string | undefined} reason the import is not allowed
 */
function checkSpecifier(specifier, declaredDeps) {
  if (isRelative(specifier)) {
    return undefined;
  }
  const name = packageName(specifier.replace(/^node:/, ''));
  if (FORBIDDEN_BUILTINS.includes(name)) {
    return `Node networking module '${specifier}' is not allowed`;
  }
  if (FORBIDDEN_PACKAGES.includes(name)) {
    return `'${name}' is a network or API-layer package and is not allowed`;
  }
  if (ALLOWED_BUILTINS.includes(name)) {
    return undefined;
  }
  if (!declaredDeps.has(name)) {
    return `'${name}' is not a declared dependency of this package`;
  }
  return undefined;
}

function listSourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(full);
    }
    return /\.(ts|js|mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
}

/**
 * @param {string} packageDir
 * @returns {string[]} violations, empty when the package is clean
 */
function checkPackage(packageDir) {
  const violations = [];
  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  const runtimeDeps = { ...pkg.dependencies, ...pkg.peerDependencies };

  for (const dep of Object.keys(runtimeDeps)) {
    if (FORBIDDEN_PACKAGES.includes(dep)) {
      violations.push(`package.json: '${dep}' is a network or API-layer package and must not be a dependency`);
    }
  }

  const declaredDeps = new Set(Object.keys(runtimeDeps));
  for (const file of listSourceFiles(path.join(packageDir, 'src'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const specifier of findSpecifiers(source)) {
      const reason = checkSpecifier(specifier, declaredDeps);
      if (reason) {
        violations.push(`${path.relative(packageDir, file)}: ${reason}`);
      }
    }
  }
  return violations;
}

module.exports = { checkPackage, checkSpecifier, findSpecifiers };

if (require.main === module) {
  const packageDir = path.resolve(__dirname, '..');
  const violations = checkPackage(packageDir);
  if (violations.length > 0) {
    console.error('@bitgo/sdk-keys must stay network-free. Found:');
    for (const v of violations) {
      console.error(`  - ${v}`);
    }
    process.exit(1);
  }
  console.log('@bitgo/sdk-keys: no network imports found');
}
