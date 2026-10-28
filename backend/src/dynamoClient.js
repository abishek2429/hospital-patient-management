import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || 'us-east-1';

const client = new DynamoDBClient({ region });

export const ddbDocClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false
  },
  unmarshallOptions: {
    wrapNumbers: false
  }
});

export const PATIENTS_TABLE = process.env.PATIENTS_TABLE || 'HospitalPatients';
export const APPOINTMENTS_TABLE = process.env.APPOINTMENTS_TABLE || 'HospitalAppointments';

/**
 * Standard HTTP response helper for API Gateway HTTP API
 */
export function createResponse(statusCode, body, additionalHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...additionalHeaders
    },
    body: JSON.stringify(body)
  };
}

