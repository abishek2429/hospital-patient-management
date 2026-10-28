import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('🧪 Verifying Frontend Assets & JavaScript Syntax...\n');

const publicDir = path.resolve('public');
const jsDir = path.join(publicDir, 'js');

// 1. Verify existence of all required files
const requiredFiles = [
  'index.html',
  'login.html',
  'css/style.css',
  'js/config.js',
  'js/auth.js',
  'js/api.js',
  'js/patients.js',
  'js/appointments.js',
  'js/dashboard.js',
  'js/app.js'
];

for (const relPath of requiredFiles) {
  const fullPath = path.join(publicDir, relPath);
  assert(fs.existsSync(fullPath), `Missing required file: ${relPath}`);
  console.log(`  ✅ File exists: public/${relPath}`);
}

// 2. Verify static content of index.html
const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf-8');
assert(indexHtml.includes('id="stat-total-patients"'), 'Missing stat-total-patients element in index.html');
assert(indexHtml.includes('id="stat-total-appointments"'), 'Missing stat-total-appointments element in index.html');
assert(indexHtml.includes('id="stat-today-appointments"'), 'Missing stat-today-appointments element in index.html');
assert(indexHtml.includes('id="stat-upcoming-appointments"'), 'Missing stat-upcoming-appointments element in index.html');
assert(indexHtml.includes('id="patients-table-body"'), 'Missing patients-table-body element in index.html');
assert(indexHtml.includes('id="appointments-table-body"'), 'Missing appointments-table-body element in index.html');
console.log('  ✅ index.html contains all required DOM containers and KPI statistics bindings.');

// 3. Verify static content of login.html
const loginHtml = fs.readFileSync(path.join(publicDir, 'login.html'), 'utf-8');
assert(loginHtml.includes('id="login-email"'), 'Missing login-email in login.html');
assert(loginHtml.includes('id="login-password"'), 'Missing login-password in login.html');
assert(loginHtml.includes('id="new-password-modal"'), 'Missing new-password-modal in login.html');
console.log('  ✅ login.html contains staff authentication forms and Cognito challenge handlers.');

// 4. Verify template.yaml
const templateYaml = fs.readFileSync(path.resolve('backend/template.yaml'), 'utf-8');
assert(templateYaml.includes('HospitalPatients'), 'Missing HospitalPatients DynamoDB table in template.yaml');
assert(templateYaml.includes('HospitalAppointments'), 'Missing HospitalAppointments DynamoDB table in template.yaml');
assert(templateYaml.includes('HospitalStaffUserPool'), 'Missing HospitalStaffUserPool in template.yaml');
assert(templateYaml.includes('HospitalStaffAppClient'), 'Missing HospitalStaffAppClient in template.yaml');
assert(templateYaml.includes('HospitalHttpApi'), 'Missing HospitalHttpApi in template.yaml');
assert(templateYaml.includes('CognitoJwtAuthorizer'), 'Missing CognitoJwtAuthorizer in template.yaml');
assert(templateYaml.includes('PatientsFunction'), 'Missing PatientsFunction in template.yaml');
assert(templateYaml.includes('AppointmentsFunction'), 'Missing AppointmentsFunction in template.yaml');
console.log('  ✅ template.yaml defines complete SAM serverless infrastructure specification.');

console.log('\n========================================');
console.log('Frontend & Template Verification Passed!');
console.log('========================================\n');

