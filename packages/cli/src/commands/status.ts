import { loadConfig, getConfigPath } from '../config.js';

export async function getStatus() {
  console.log('\n🔐 Claude Code Approval - Status\n');

  const config = await loadConfig();

  if (!config) {
    console.log('❌ Not paired');
    console.log('\n   Run "claude-approve init" to set up pairing.\n');
    return;
  }

  console.log('✅ Paired');
  console.log(`\n   Pairing ID: ${config.pairingId.slice(0, 8)}...`);
  console.log(`   Server:     ${config.serverUrl}`);
  console.log(`   Paired on:  ${new Date(config.createdAt).toLocaleString()}`);
  console.log(`   Config:     ${getConfigPath()}\n`);
}
