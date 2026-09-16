#!/usr/bin/env node
'use strict';

// Runs every *.test.js file under tests/ via Node's built-in test runner.
// Individual files can still be run directly, e.g.:
//   node tests/helpers.test.js

const { spawnSync } = require('child_process');

const result = spawnSync(
  process.execPath,
  ['--test'],
  { stdio: 'inherit', cwd: __dirname + '/..' }
);

process.exit(result.status === null ? 1 : result.status);
