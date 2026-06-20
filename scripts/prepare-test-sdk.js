#!/usr/bin/env node

const { existsSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const repoRoot = join(__dirname, '..');
const sdkDir = join(repoRoot, 'sdk', 'typescript');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args) {
  const result = spawnSync(npmCmd, args, {
    cwd: sdkDir,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (!existsSync(join(sdkDir, 'node_modules'))) {
  console.log('TypeScript SDK dependencies missing; installing with npm ci...');
  run(['ci']);
}

console.log('Building TypeScript SDK for root integration tests...');
run(['run', 'build']);
