import { execSync } from 'node:child_process';
import fs from 'node:fs';

const files = [
  'server.js',
  'backend/src/dynamoClient.js',
  'backend/src/patients.js',
  'backend/src/appointments.js',
  'backend/test/test-handlers.js',
  'backend/test/verify-frontend.js',
  'public/js/config.js',
  'public/js/auth.js',
  'public/js/api.js',
  'public/js/patients.js',
  'public/js/appointments.js',
  'public/js/dashboard.js',
  'public/js/app.js'
];

console.log('🔍 Checking JavaScript Syntax with `node --check`...\n');
let failed = 0;

for (const file of files) {
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
    console.log(`  ✅ Syntax OK: ${file}`);
  } catch (err) {
    console.error(`  ❌ Syntax Error in ${file}:`, err.message);
    failed++;
  }
}

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\nAll JavaScript files passed syntax check!');
}

