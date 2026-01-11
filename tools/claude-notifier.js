#!/usr/bin/env node

const notifier = require('node-notifier');
const NotificationCenter = notifier.NotificationCenter;

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 3) {
    console.error('Usage: claude-notifier.js <tool> <details> <cwd> [timeout]');
    process.exit(1);
}

const tool = args[0];
const details = args[1];
const cwd = args[2];
const timeout = args[3] ? parseInt(args[3]) * 1000 : 120000; // Convert to milliseconds

const nc = new NotificationCenter({
    withFallback: false,
    customPath: undefined
});

nc.notify(
    {
        title: 'Claude Code Approval',
        subtitle: `Tool: ${tool}`,
        message: details,
        sound: true,
        timeout: Math.floor(timeout / 1000),
        closeLabel: 'Deny',
        actions: ['Approve Once', 'Approve Session'],
        wait: true,
        icon: 'caution'
    },
    (error, response, metadata) => {
        if (error) {
            console.error('ERROR:', error.message);
            process.exit(1);
        }

        // metadata.activationValue contains the clicked action
        if (metadata && metadata.activationValue) {
            if (metadata.activationValue === 'Approve Once') {
                console.log('APPROVED:once');
                process.exit(0);
            } else if (metadata.activationValue === 'Approve Session') {
                console.log('APPROVED:session-tool');
                process.exit(0);
            }
        }

        // User dismissed or denied
        console.log('DENIED');
        process.exit(1);
    }
);

// Handle timeout
setTimeout(() => {
    console.log('TIMEOUT');
    process.exit(1);
}, timeout);
