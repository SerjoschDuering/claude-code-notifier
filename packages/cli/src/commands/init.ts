import qrcode from 'qrcode-terminal';
import { saveConfig, loadConfig, getConfigPath } from '../config.js';
import { initializePairing } from '../api.js';

interface InitOptions {
  server: string;
}

export async function initPairing(options: InitOptions) {
  console.log('\n🔐 Claude Code Approval - Device Pairing\n');

  // Check if already paired
  const existingConfig = await loadConfig();
  if (existingConfig) {
    console.log('⚠️  You already have a pairing configured.');
    console.log(`   Config file: ${getConfigPath()}`);
    console.log('\n   To re-pair, delete the config file and run init again.\n');
    return;
  }

  console.log('📡 Connecting to server...');

  try {
    const result = await initializePairing(options.server);

    if (!result.success || !result.data) {
      console.error('❌ Failed to initialize pairing:', result.error);
      process.exit(1);
    }

    const { pairingId, pairingSecret } = result.data;

    // Save config
    await saveConfig({
      pairingId,
      pairingSecret,
      serverUrl: options.server,
      createdAt: Date.now(),
    });

    console.log('✅ Pairing initialized!\n');

    // Generate QR code data
    const qrData = JSON.stringify({ pairingId, pairingSecret });

    console.log('📱 Scan this QR code with the Claude Approver app:\n');
    qrcode.generate(qrData, { small: true }, (qr) => {
      console.log(qr);
    });

    console.log('\n📋 Or enter these values manually:\n');
    console.log(`   Pairing ID:     ${pairingId}`);
    console.log(`   Pairing Secret: ${pairingSecret}`);
    console.log(`\n   Config saved to: ${getConfigPath()}\n`);

    console.log('📝 Next steps:');
    console.log('   1. Open the PWA on your iPhone');
    console.log('   2. Tap "Pair Device"');
    console.log('   3. Scan the QR code or enter the values manually');
    console.log('   4. Enable push notifications when prompted\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}
