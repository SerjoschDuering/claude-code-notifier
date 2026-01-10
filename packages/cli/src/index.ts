#!/usr/bin/env node
import { Command } from 'commander';
import { initPairing } from './commands/init.js';
import { requestApproval } from './commands/request.js';
import { getStatus } from './commands/status.js';

const program = new Command();

program
  .name('claude-approve')
  .description('CLI tool for Claude Code approval notifications')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize pairing with your mobile device')
  .option('-s, --server <url>', 'API server URL')
  .action(initPairing);

program
  .command('request')
  .description('Send an approval request (used by hook)')
  .requiredOption('-t, --tool <name>', 'Tool name (e.g., Bash, Write)')
  .option('-c, --command <cmd>', 'Command to execute')
  .option('-d, --details <text>', 'Additional details')
  .option('--cwd <path>', 'Working directory')
  .option('--timeout <ms>', 'Timeout in milliseconds', '600000')
  .action(requestApproval);

program
  .command('status')
  .description('Check pairing status')
  .action(getStatus);

program.parse();
