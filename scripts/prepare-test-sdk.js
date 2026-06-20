#!/usr/bin/env node

const { existsSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const repoRoot = join(__dirname, '..');
const sdkDir = join(repoRoot, 'sdk', 'typescript');
function run(args) {
  const npmCli = process.env.npm_execpath;
  const useWindowsFallback = !npmCli && process.platform === 'win32';
  const command = npmCli
    ? process.execPath
    : useWindowsFallback
      ? process.env.ComSpec || 'cmd.exe'
      : 'npm';
  const commandArgs = npmCli
    ? [npmCli, ...args]
    : useWindowsFallback
      ? ['/d', '/s', '/c', 'npm.cmd', ...args]
      : args;
  const result = spawnSync(command, commandArgs, {
    cwd: sdkDir,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

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
