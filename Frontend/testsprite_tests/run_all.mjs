// TestSprite — Run all 5 iterations sequentially
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iterations = [
  'iteration1_foreground_baseline.mjs',
  'iteration2_hidden_visible.mjs',
  'iteration3_page_switch.mjs',
  'iteration4_overlay_impact.mjs',
  'iteration5_hotspot_tokens.mjs',
];

for (const file of iterations) {
  console.log(`\n${'#'.repeat(70)}`);
  console.log(`# Running: ${file}`);
  console.log(`${'#'.repeat(70)}\n`);
  try {
    execSync(`node ${join(__dirname, file)}`, {
      stdio: 'inherit',
      env: { ...process.env, COLLECT_SECONDS: '30', DWELL_SECONDS: '12', HIDDEN_SECONDS: '15', VISIBLE_SECONDS: '10' },
      timeout: 300000,
    });
  } catch (err) {
    console.error(`  ERROR in ${file}: ${err.message}`);
  }
}

console.log('\n' + '#'.repeat(70));
console.log('# All TestSprite iterations complete');
console.log('#'.repeat(70));
