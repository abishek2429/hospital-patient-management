import assert from 'node:assert';
import { handler as patientsHandler } from '../src/patients.js';
import { handler as appointmentsHandler } from '../src/appointments.js';
import { ddbDocClient } from '../src/dynamoClient.js';
import { PutCommand, GetCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

console.log('🧪 Starting Hospital Backend Test Suite...\n');

// In-memory mock database to simulate DynamoDB without live AWS credentials
const mockDatabase = {
  HospitalPatients: new Map(),
  HospitalAppointments: new Map()
};

// Store original send method
const originalSend = ddbDocClient.send;

// Intercept ddbDocClient.send to use mockDatabase
ddbDocClient.send = async function (command) {
  const tableName = command.input.TableName;
  const table = mockDatabase[tableName];

  if (!table) {
    throw new Error(`Table ${tableName} not found in mock database`);
  }

  const getKey = (itemOrKey) => {
    if (tableName === 'HospitalAppointments') {
      return itemOrKey.appointmentId;
    }
    return itemOrKey.patientId;
  };

  if (command instanceof PutCommand) {
    const item = command.input.Item;
    const cond = command.input.ConditionExpression;
    const id = getKey(item);

    if (cond === 'attribute_not_exists(patientId)' && table.has(id)) {
      const err = new Error('ConditionalCheckFailed');
      err.name = 'ConditionalCheckFailedException';
      throw err;
    }
    if (cond === 'attribute_exists(patientId)' && !table.has(id)) {
      const err = new Error('ConditionalCheckFailed');
      err.name = 'ConditionalCheckFailedException';
      throw err;
    }
    if (cond === 'attribute_not_exists(appointmentId)' && table.has(id)) {
      const err = new Error('ConditionalCheckFailed');
      err.name = 'ConditionalCheckFailedException';
      throw err;
    }
    if (cond === 'attribute_exists(appointmentId)' && !table.has(id)) {
      const err = new Error('ConditionalCheckFailed');
      err.name = 'ConditionalCheckFailedException';
      throw err;
    }

    table.set(id, { ...item });
    return {};
  }

  if (command instanceof GetCommand) {
    const id = getKey(command.input.Key);
    const item = table.get(id);
    return { Item: item ? { ...item } : undefined };
  }

  if (command instanceof ScanCommand) {
    const items = Array.from(table.values());
    return { Items: items };
  }

  if (command instanceof DeleteCommand) {
    const id = getKey(command.input.Key);
    const cond = command.input.ConditionExpression;

    if ((cond === 'attribute_exists(patientId)' || cond === 'attribute_exists(appointmentId)') && !table.has(id)) {
      const err = new Error('ConditionalCheckFailed');
      err.name = 'ConditionalCheckFailedException';
      throw err;
    }

    table.delete(id);
    return {};
  }

  return originalSend.call(ddbDocClient, command);
};

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

async function runTests() {
  let createdPatientId = null;
  let createdAppointmentId = null;

  // 1. OPTIONS CORS Preflight
  await test('CORS Preflight returns 200 with CORS headers', async () => {
    const res = await patientsHandler({
      requestContext: { http: { method: 'OPTIONS' } }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['Access-Control-Allow-Origin'], '*');
  });

  // 2. Reject Patient Creation with missing required fields
  await test('POST /patients rejects missing full name', async () => {
    const res = await patientsHandler({
      requestContext: { http: { method: 'POST' } },
      body: JSON.stringify({ phone: '+1234567890' })
    });
    assert.strictEqual(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, false);
    assert(body.errors.some(e => e.includes('Full name is required')));
  });

  await test('POST /patients rejects missing phone', async () => {
    const res = await patientsHandler({
      requestContext: { http: { method: 'POST' } },
      body: JSON.stringify({ fullName: 'John Doe' })
    });
    assert.strictEqual(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, false);
    assert(body.errors.some(e => e.includes('Phone number is required')));
  });

  // 3. Create Valid Patient
  await test('POST /patients successfully registers new patient', async () => {
    const res = await patientsHandler({
      requestContext: { http: { method: 'POST' } },
      body: JSON.stringify({
        fullName: 'Dr. Jane Smith (Test)',
        dateOfBirth: '1985-04-12',
        gender: 'Female',
        phone: '+1-555-0199',
        email: 'jane.smith@example.com',
        address: '100 Medical Center Blvd, Suite 4',
        bloodGroup: 'O+'
      })
    });
    assert.strictEqual(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert(body.data.patientId.startsWith('PAT-'));
    assert.strictEqual(body.data.fullName, 'Dr. Jane Smith (Test)');
    assert.strictEqual(body.data.bloodGroup, 'O+');
    createdPatientId = body.data.patientId;
  });

  // 4. Read Patient by ID
  await test('GET /patients/{id} retrieves created patient', async () => {
    const res = await patientsHandler({
      requestContext: { http: { method: 'GET' } },
      pathParameters: { id: createdPatientId }
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.patientId, createdPatientId);
  });

  // 5. Patient Not Found
  await test('GET /patients/{id} returns 404 for non-existent patient', async () => {
    const res = await patientsHandler({
      requestContext: { http: { method: 'GET' } },
      pathParameters: { id: 'PAT-NOTFOUND99' }
    });
    assert.strictEqual(res.statusCode, 404);
  });

  // 6. Update Patient Details
  await test('PUT /patients/{id} updates patient contact info', async () => {
    const res = await patientsHandler({
      requestContext: { http: { method: 'PUT' } },
      pathParameters: { id: createdPatientId },
      body: JSON.stringify({
        phone: '+1-555-9999',
        address: '200 Updated Boulevard'
      })
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.phone, '+1-555-9999');
    assert.strictEqual(body.data.address, '200 Updated Boulevard');
  });

  // 7. List Patients with search query
  await test('GET /patients lists and filters patients by query', async () => {
    const res = await patientsHandler({
      requestContext: { http: { method: 'GET' } },
      queryStringParameters: { search: 'Jane' }
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert(body.data.length >= 1);
  });

  // 8. Reject Appointment for Non-existent Patient
  await test('POST /appointments rejects un-registered patientId', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const res = await appointmentsHandler({
      requestContext: { http: { method: 'POST' } },
      body: JSON.stringify({
        patientId: 'PAT-FAKE1234',
        doctorName: 'Dr. Gregory House',
        appointmentDate: dateStr,
        appointmentTime: '10:00',
        reason: 'Routine consultation'
      })
    });
    assert.strictEqual(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, false);
    assert(body.error.includes('does not exist'));
  });

  // 9. Reject Appointment with Past Date
  await test('POST /appointments rejects appointment date in the past', async () => {
    const res = await appointmentsHandler({
      requestContext: { http: { method: 'POST' } },
      body: JSON.stringify({
        patientId: createdPatientId,
        doctorName: 'Dr. Gregory House',
        appointmentDate: '2020-01-01',
        appointmentTime: '09:00',
        reason: 'Checkup'
      })
    });
    assert.strictEqual(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, false);
    assert(body.errors.some(e => e.includes('cannot be in the past')));
  });

  // 10. Create Valid Appointment for existing patient
  await test('POST /appointments schedules valid future appointment', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const dateStr = futureDate.toISOString().split('T')[0];

    const res = await appointmentsHandler({
      requestContext: { http: { method: 'POST' } },
      body: JSON.stringify({
        patientId: createdPatientId,
        doctorName: 'Dr. Gregory House',
        appointmentDate: dateStr,
        appointmentTime: '14:30',
        reason: 'Cardiology Review'
      })
    });
    assert.strictEqual(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert(body.data.appointmentId.startsWith('APT-'));
    assert.strictEqual(body.data.patientId, createdPatientId);
    assert.strictEqual(body.data.status, 'Scheduled');
    createdAppointmentId = body.data.appointmentId;
  });

  // 11. Read and Filter Appointments
  await test('GET /appointments lists appointments with status filter', async () => {
    const res = await appointmentsHandler({
      requestContext: { http: { method: 'GET' } },
      queryStringParameters: { status: 'Scheduled' }
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert(body.data.length >= 1);
  });

  // 12. Update Appointment Status
  await test('PUT /appointments/{id} changes status to Completed', async () => {
    const res = await appointmentsHandler({
      requestContext: { http: { method: 'PUT' } },
      pathParameters: { id: createdAppointmentId },
      body: JSON.stringify({ status: 'Completed' })
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.status, 'Completed');
  });

  // 13. Delete Appointment
  await test('DELETE /appointments/{id} deletes appointment', async () => {
    const res = await appointmentsHandler({
      requestContext: { http: { method: 'DELETE' } },
      pathParameters: { id: createdAppointmentId }
    });
    assert.strictEqual(res.statusCode, 200);
  });

  // 14. Delete Patient
  await test('DELETE /patients/{id} deletes patient record', async () => {
    const res = await patientsHandler({
      requestContext: { http: { method: 'DELETE' } },
      pathParameters: { id: createdPatientId }
    });
    assert.strictEqual(res.statusCode, 200);

    // Verify it is gone
    const getRes = await patientsHandler({
      requestContext: { http: { method: 'GET' } },
      pathParameters: { id: createdPatientId }
    });
    assert.strictEqual(getRes.statusCode, 404);
  });

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
