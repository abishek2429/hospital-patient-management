import { 
  PutCommand, 
  GetCommand, 
  ScanCommand, 
  DeleteCommand 
} from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';
import { 
  ddbDocClient, 
  APPOINTMENTS_TABLE, 
  PATIENTS_TABLE, 
  createResponse 
} from './dynamoClient.js';

const VALID_STATUSES = ['Scheduled', 'Completed', 'Cancelled'];

/**
 * Generates a unique appointment identifier, e.g. APT-7F8E9D1C
 */
function generateAppointmentId() {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `APT-${rand}`;
}

/**
 * Checks whether an appointment date & time is in the past
 */
function isDateInPast(dateStr, timeStr) {
  if (!dateStr) return false;
  
  // Format appointment string: YYYY-MM-DD + optional HH:mm
  const apptDateTimeStr = timeStr ? `${dateStr}T${timeStr}:00` : `${dateStr}T23:59:59`;
  const apptDate = new Date(apptDateTimeStr);
  const now = new Date();

  // If time is not provided, check if date is strictly before today's calendar date
  if (!timeStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(`${dateStr}T00:00:00`);
    return checkDate < today;
  }

  return apptDate.getTime() < (now.getTime() - 60000); // 1-minute buffer for clock drift
}

/**
 * Validates appointment payload
 */
function validateAppointmentData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate || data.patientId !== undefined) {
    if (!data.patientId || typeof data.patientId !== 'string' || data.patientId.trim().length === 0) {
      errors.push('Patient ID is required.');
    }
  }

  if (!isUpdate || data.doctorName !== undefined) {
    if (!data.doctorName || typeof data.doctorName !== 'string' || data.doctorName.trim().length === 0) {
      errors.push('Doctor name is required.');
    }
  }

  if (!isUpdate || data.appointmentDate !== undefined) {
    if (!data.appointmentDate || !/^\d{4}-\d{2}-\d{2}$/.test(data.appointmentDate)) {
      errors.push('Appointment date is required and must follow YYYY-MM-DD format.');
    }
  }

  if (!isUpdate || data.appointmentTime !== undefined) {
    if (!data.appointmentTime || !/^\d{2}:\d{2}/.test(data.appointmentTime)) {
      errors.push('Appointment time is required and must follow HH:mm format.');
    }
  }

  if (!isUpdate || data.reason !== undefined) {
    if (!data.reason || typeof data.reason !== 'string' || data.reason.trim().length === 0) {
      errors.push('Reason for visit is required.');
    }
  }

  if (data.status !== undefined) {
    if (!VALID_STATUSES.includes(data.status)) {
      errors.push(`Status must be one of: ${VALID_STATUSES.join(', ')}.`);
    }
  }

  // Reject appointments scheduled in the past
  if (!isUpdate || (data.status === 'Scheduled' && (data.appointmentDate || data.appointmentTime))) {
    if (data.appointmentDate && isDateInPast(data.appointmentDate, data.appointmentTime)) {
      errors.push('Appointment date and time cannot be in the past.');
    }
  }

  return errors;
}

/**
 * AWS Lambda Handler for Appointment Management CRUD
 */
export async function handler(event) {
  console.log('Received appointment event:', JSON.stringify(event));

  const method = (event.requestContext?.http?.method || event.httpMethod || '').toUpperCase();
  if (method === 'OPTIONS') {
    return createResponse(200, { message: 'CORS OK' });
  }

  const pathParams = event.pathParameters || {};
  const queryParams = event.queryStringParameters || {};
  const appointmentId = pathParams.id || pathParams.appointmentId;

  try {
    switch (method) {
      case 'POST': {
        // Create Appointment
        let body;
        try {
          body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
        } catch {
          return createResponse(400, { success: false, error: 'Malformed JSON payload.' });
        }

        const validationErrors = validateAppointmentData(body, false);
        if (validationErrors.length > 0) {
          return createResponse(400, { success: false, errors: validationErrors });
        }

        // Verify that the referenced patient exists in PatientsTable
        const patientResult = await ddbDocClient.send(
          new GetCommand({
            TableName: PATIENTS_TABLE,
            Key: { patientId: body.patientId.trim() }
          })
        );

        if (!patientResult.Item) {
          return createResponse(400, {
            success: false,
            error: `Patient ID '${body.patientId}' does not exist. Please register the patient first.`
          });
        }

        const patientName = body.patientName || patientResult.Item.fullName;
        const now = new Date().toISOString();
        const newAppointmentId = body.appointmentId || generateAppointmentId();

        const newAppointment = {
          appointmentId: newAppointmentId,
          patientId: body.patientId.trim(),
          patientName: patientName,
          doctorName: body.doctorName.trim(),
          appointmentDate: body.appointmentDate.trim(),
          appointmentTime: body.appointmentTime.trim(),
          reason: body.reason.trim(),
          status: body.status || 'Scheduled',
          createdAt: now,
          updatedAt: now
        };

        await ddbDocClient.send(
          new PutCommand({
            TableName: APPOINTMENTS_TABLE,
            Item: newAppointment,
            ConditionExpression: 'attribute_not_exists(appointmentId)'
          })
        );

        return createResponse(201, {
          success: true,
          message: 'Appointment scheduled successfully.',
          data: newAppointment
        });
      }

      case 'GET': {
        if (appointmentId) {
          // Read single appointment by ID
          const result = await ddbDocClient.send(
            new GetCommand({
              TableName: APPOINTMENTS_TABLE,
              Key: { appointmentId }
            })
          );

          if (!result.Item) {
            return createResponse(404, {
              success: false,
              error: `Appointment with ID '${appointmentId}' not found.`
            });
          }

          return createResponse(200, {
            success: true,
            data: result.Item
          });
        }

        // List appointments with optional filters: date, status, patientId
        const filterDate = queryParams.date ? queryParams.date.trim() : null;
        const filterStatus = queryParams.status ? queryParams.status.trim() : null;
        const filterPatientId = queryParams.patientId ? queryParams.patientId.trim() : null;

        const result = await ddbDocClient.send(
          new ScanCommand({
            TableName: APPOINTMENTS_TABLE
          })
        );

        let items = result.Items || [];

        if (filterDate) {
          items = items.filter(appt => appt.appointmentDate === filterDate);
        }

        if (filterStatus && filterStatus !== 'All') {
          items = items.filter(appt => appt.status.toLowerCase() === filterStatus.toLowerCase());
        }

        if (filterPatientId) {
          items = items.filter(appt => appt.patientId === filterPatientId);
        }

        // Sort chronologically: by date, then time
        items.sort((a, b) => {
          const dtA = `${a.appointmentDate}T${a.appointmentTime || '00:00'}`;
          const dtB = `${b.appointmentDate}T${b.appointmentTime || '00:00'}`;
          return dtA.localeCompare(dtB);
        });

        return createResponse(200, {
          success: true,
          count: items.length,
          data: items
        });
      }

      case 'PUT': {
        // Update appointment details or status
        if (!appointmentId) {
          return createResponse(400, { success: false, error: 'Appointment ID is required in URL path.' });
        }

        let body;
        try {
          body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
        } catch {
          return createResponse(400, { success: false, error: 'Malformed JSON payload.' });
        }

        const validationErrors = validateAppointmentData(body, true);
        if (validationErrors.length > 0) {
          return createResponse(400, { success: false, errors: validationErrors });
        }

        // Check if appointment exists
        const existing = await ddbDocClient.send(
          new GetCommand({
            TableName: APPOINTMENTS_TABLE,
            Key: { appointmentId }
          })
        );

        if (!existing.Item) {
          return createResponse(404, {
            success: false,
            error: `Appointment with ID '${appointmentId}' not found.`
          });
        }

        // If patientId is being changed, verify the new patient exists
        let patientName = existing.Item.patientName;
        if (body.patientId && body.patientId !== existing.Item.patientId) {
          const patientResult = await ddbDocClient.send(
            new GetCommand({
              TableName: PATIENTS_TABLE,
              Key: { patientId: body.patientId.trim() }
            })
          );
          if (!patientResult.Item) {
            return createResponse(400, {
              success: false,
              error: `Patient ID '${body.patientId}' does not exist.`
            });
          }
          patientName = patientResult.Item.fullName;
        }

        const now = new Date().toISOString();
        const updatedAppointment = {
          ...existing.Item,
          ...(body.patientId !== undefined && { patientId: body.patientId.trim() }),
          ...(body.patientName !== undefined ? { patientName: body.patientName } : { patientName }),
          ...(body.doctorName !== undefined && { doctorName: body.doctorName.trim() }),
          ...(body.appointmentDate !== undefined && { appointmentDate: body.appointmentDate.trim() }),
          ...(body.appointmentTime !== undefined && { appointmentTime: body.appointmentTime.trim() }),
          ...(body.reason !== undefined && { reason: body.reason.trim() }),
          ...(body.status !== undefined && { status: body.status }),
          updatedAt: now
        };

        await ddbDocClient.send(
          new PutCommand({
            TableName: APPOINTMENTS_TABLE,
            Item: updatedAppointment,
            ConditionExpression: 'attribute_exists(appointmentId)'
          })
        );

        return createResponse(200, {
          success: true,
          message: 'Appointment updated successfully.',
          data: updatedAppointment
        });
      }

      case 'DELETE': {
        // Delete or cancel appointment
        if (!appointmentId) {
          return createResponse(400, { success: false, error: 'Appointment ID is required in URL path.' });
        }

        const existing = await ddbDocClient.send(
          new GetCommand({
            TableName: APPOINTMENTS_TABLE,
            Key: { appointmentId }
          })
        );

        if (!existing.Item) {
          return createResponse(404, {
            success: false,
            error: `Appointment with ID '${appointmentId}' not found.`
          });
        }

        await ddbDocClient.send(
          new DeleteCommand({
            TableName: APPOINTMENTS_TABLE,
            Key: { appointmentId },
            ConditionExpression: 'attribute_exists(appointmentId)'
          })
        );

        return createResponse(200, {
          success: true,
          message: `Appointment '${appointmentId}' deleted successfully.`
        });
      }

      default:
        return createResponse(405, { success: false, error: `Method ${method} not allowed.` });
    }
  } catch (error) {
    console.error('Error handling appointment request:', error);
    if (error.name === 'ConditionalCheckFailedException') {
      return createResponse(409, {
        success: false,
        error: 'Record conflict or item does not exist.'
      });
    }
    return createResponse(500, {
      success: false,
      error: 'Internal server error processing appointment request.',
      details: error.message
    });
  }
}

