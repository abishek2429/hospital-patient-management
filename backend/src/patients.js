import { 
  PutCommand, 
  GetCommand, 
  ScanCommand, 
  UpdateCommand, 
  DeleteCommand 
} from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';
import { ddbDocClient, PATIENTS_TABLE, createResponse } from './dynamoClient.js';

/**
 * Generates a unique patient identifier, e.g. PAT-A1B2C3D4
 */
function generatePatientId() {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `PAT-${rand}`;
}

/**
 * Validates patient payload
 */
function validatePatientData(data, isUpdate = false) {
  const errors = [];
  if (!isUpdate || data.fullName !== undefined) {
    if (!data.fullName || typeof data.fullName !== 'string' || data.fullName.trim().length === 0) {
      errors.push('Full name is required and cannot be empty.');
    }
  }
  if (!isUpdate || data.phone !== undefined) {
    if (!data.phone || typeof data.phone !== 'string' || data.phone.trim().length === 0) {
      errors.push('Phone number is required.');
    }
  }
  if (data.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      errors.push('Invalid email address format.');
    }
  }
  return errors;
}

/**
 * AWS Lambda Handler for Patient Management CRUD
 */
export async function handler(event) {
  console.log('Received patient event:', JSON.stringify(event));

  // Handle CORS preflight if reached
  const method = (event.requestContext?.http?.method || event.httpMethod || '').toUpperCase();
  if (method === 'OPTIONS') {
    return createResponse(200, { message: 'CORS OK' });
  }

  const pathParams = event.pathParameters || {};
  const queryParams = event.queryStringParameters || {};
  const patientId = pathParams.id || pathParams.patientId;

  try {
    switch (method) {
      case 'POST': {
        // Create Patient
        let body;
        try {
          body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
        } catch {
          return createResponse(400, { success: false, error: 'Malformed JSON payload.' });
        }

        const validationErrors = validatePatientData(body);
        if (validationErrors.length > 0) {
          return createResponse(400, { success: false, errors: validationErrors });
        }

        const now = new Date().toISOString();
        const newPatientId = body.patientId || generatePatientId();

        const newPatient = {
          patientId: newPatientId,
          fullName: body.fullName.trim(),
          dateOfBirth: body.dateOfBirth || '',
          gender: body.gender || 'Not Specified',
          phone: body.phone.trim(),
          email: body.email ? body.email.trim().toLowerCase() : '',
          address: body.address ? body.address.trim() : '',
          bloodGroup: body.bloodGroup || 'Unknown',
          createdAt: now,
          updatedAt: now
        };

        await ddbDocClient.send(
          new PutCommand({
            TableName: PATIENTS_TABLE,
            Item: newPatient,
            ConditionExpression: 'attribute_not_exists(patientId)'
          })
        );

        return createResponse(201, {
          success: true,
          message: 'Patient registered successfully.',
          data: newPatient
        });
      }

      case 'GET': {
        if (patientId) {
          // Read single patient by ID
          const result = await ddbDocClient.send(
            new GetCommand({
              TableName: PATIENTS_TABLE,
              Key: { patientId }
            })
          );

          if (!result.Item) {
            return createResponse(404, {
              success: false,
              error: `Patient with ID '${patientId}' not found.`
            });
          }

          return createResponse(200, {
            success: true,
            data: result.Item
          });
        }

        // List all patients (with optional search query)
        const searchTerm = (queryParams.search || '').trim().toLowerCase();

        const result = await ddbDocClient.send(
          new ScanCommand({
            TableName: PATIENTS_TABLE
          })
        );

        let items = result.Items || [];

        if (searchTerm) {
          items = items.filter(patient => 
            (patient.fullName && patient.fullName.toLowerCase().includes(searchTerm)) ||
            (patient.patientId && patient.patientId.toLowerCase().includes(searchTerm)) ||
            (patient.phone && patient.phone.toLowerCase().includes(searchTerm)) ||
            (patient.email && patient.email.toLowerCase().includes(searchTerm))
          );
        }

        // Sort descending by creation timestamp
        items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return createResponse(200, {
          success: true,
          count: items.length,
          data: items
        });
      }

      case 'PUT': {
        // Update existing patient
        if (!patientId) {
          return createResponse(400, { success: false, error: 'Patient ID is required in URL path.' });
        }

        let body;
        try {
          body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
        } catch {
          return createResponse(400, { success: false, error: 'Malformed JSON payload.' });
        }

        const validationErrors = validatePatientData(body, true);
        if (validationErrors.length > 0) {
          return createResponse(400, { success: false, errors: validationErrors });
        }

        // Check if patient exists first
        const existing = await ddbDocClient.send(
          new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
          })
        );

        if (!existing.Item) {
          return createResponse(404, {
            success: false,
            error: `Patient with ID '${patientId}' not found.`
          });
        }

        const now = new Date().toISOString();
        const updatedPatient = {
          ...existing.Item,
          ...(body.fullName !== undefined && { fullName: body.fullName.trim() }),
          ...(body.dateOfBirth !== undefined && { dateOfBirth: body.dateOfBirth }),
          ...(body.gender !== undefined && { gender: body.gender }),
          ...(body.phone !== undefined && { phone: body.phone.trim() }),
          ...(body.email !== undefined && { email: body.email.trim().toLowerCase() }),
          ...(body.address !== undefined && { address: body.address.trim() }),
          ...(body.bloodGroup !== undefined && { bloodGroup: body.bloodGroup }),
          updatedAt: now
        };

        await ddbDocClient.send(
          new PutCommand({
            TableName: PATIENTS_TABLE,
            Item: updatedPatient,
            ConditionExpression: 'attribute_exists(patientId)'
          })
        );

        return createResponse(200, {
          success: true,
          message: 'Patient record updated successfully.',
          data: updatedPatient
        });
      }

      case 'DELETE': {
        // Delete Patient
        if (!patientId) {
          return createResponse(400, { success: false, error: 'Patient ID is required in URL path.' });
        }

        // Verify patient exists before deleting
        const existing = await ddbDocClient.send(
          new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId }
          })
        );

        if (!existing.Item) {
          return createResponse(404, {
            success: false,
            error: `Patient with ID '${patientId}' not found.`
          });
        }

        await ddbDocClient.send(
          new DeleteCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId },
            ConditionExpression: 'attribute_exists(patientId)'
          })
        );

        return createResponse(200, {
          success: true,
          message: `Patient '${patientId}' deleted successfully.`
        });
      }

      default:
        return createResponse(405, { success: false, error: `Method ${method} not allowed.` });
    }
  } catch (error) {
    console.error('Error handling patient request:', error);
    if (error.name === 'ConditionalCheckFailedException') {
      return createResponse(409, {
        success: false,
        error: 'Record conflict or item does not exist.'
      });
    }
    return createResponse(500, {
      success: false,
      error: 'Internal server error processing patient request.',
      details: error.message
    });
  }
}

