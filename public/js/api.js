/**
 * API Gateway Client for Hospital Patient Management System
 * Handles authenticated fetch requests with Cognito JWT Bearer tokens
 */

import { CONFIG, isAwsConfigured } from './config.js';
import { getAuthToken, logout } from './auth.js';

// Local storage keys for mock mode persistence
const MOCK_PATIENTS_KEY = 'hospital_mock_patients_db';
const MOCK_APPOINTMENTS_KEY = 'hospital_mock_appointments_db';

/**
 * Initializes mock seed data for offline lab demonstration
 */
function initializeMockData() {
  if (!localStorage.getItem(MOCK_PATIENTS_KEY)) {
    const seedPatients = [
      {
        patientId: 'PAT-8A1C4F22',
        fullName: 'Eleanor Vance',
        dateOfBirth: '1984-06-15',
        gender: 'Female',
        phone: '+1-555-0143',
        email: 'eleanor.vance@example.com',
        address: '42 Highland Avenue, Boston, MA',
        bloodGroup: 'A+',
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 5).toISOString()
      },
      {
        patientId: 'PAT-3B9D7E11',
        fullName: 'Marcus Sterling',
        dateOfBirth: '1976-11-28',
        gender: 'Male',
        phone: '+1-555-0188',
        email: 'marcus.sterling@example.com',
        address: '108 Harbor View Rd, Boston, MA',
        bloodGroup: 'O-',
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 3).toISOString()
      },
      {
        patientId: 'PAT-5F4E2A90',
        fullName: 'Sophia Rodriguez',
        dateOfBirth: '1995-03-09',
        gender: 'Female',
        phone: '+1-555-0129',
        email: 'sophia.rodriguez@example.com',
        address: '25 Beacon Street, Boston, MA',
        bloodGroup: 'B+',
        createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 1).toISOString()
      }
    ];
    localStorage.setItem(MOCK_PATIENTS_KEY, JSON.stringify(seedPatients));
  }

  if (!localStorage.getItem(MOCK_APPOINTMENTS_KEY)) {
    const today = new Date().toISOString().split('T')[0];
    const tomorrowDate = new Date(Date.now() + 86400000);
    const tomorrow = tomorrowDate.toISOString().split('T')[0];
    const nextWeekDate = new Date(Date.now() + 86400000 * 5);
    const nextWeek = nextWeekDate.toISOString().split('T')[0];

    const seedAppointments = [
      {
        appointmentId: 'APT-1001A8',
        patientId: 'PAT-8A1C4F22',
        patientName: 'Eleanor Vance',
        doctorName: 'Dr. Sarah Jenkins (Cardiology)',
        appointmentDate: today,
        appointmentTime: '10:30',
        reason: 'Post-operative follow-up consultation',
        status: 'Scheduled',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 2).toISOString()
      },
      {
        appointmentId: 'APT-2002B4',
        patientId: 'PAT-3B9D7E11',
        patientName: 'Marcus Sterling',
        doctorName: 'Dr. Gregory House (Diagnostics)',
        appointmentDate: tomorrow,
        appointmentTime: '14:00',
        reason: 'Severe recurring chest discomfort and fatigue',
        status: 'Scheduled',
        createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 1).toISOString()
      },
      {
        appointmentId: 'APT-3003C9',
        patientId: 'PAT-5F4E2A90',
        patientName: 'Sophia Rodriguez',
        doctorName: 'Dr. Arthur Conan (General Medicine)',
        appointmentDate: nextWeek,
        appointmentTime: '11:15',
        reason: 'Annual routine medical checkup',
        status: 'Scheduled',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    localStorage.setItem(MOCK_APPOINTMENTS_KEY, JSON.stringify(seedAppointments));
  }
}

initializeMockData();

// Mock database helper functions
function getMockPatients() {
  return JSON.parse(localStorage.getItem(MOCK_PATIENTS_KEY) || '[]');
}
function saveMockPatients(items) {
  localStorage.setItem(MOCK_PATIENTS_KEY, JSON.stringify(items));
}
function getMockAppointments() {
  return JSON.parse(localStorage.getItem(MOCK_APPOINTMENTS_KEY) || '[]');
}
function saveMockAppointments(items) {
  localStorage.setItem(MOCK_APPOINTMENTS_KEY, JSON.stringify(items));
}

/**
 * Core HTTP Request Dispatcher
 */
async function request(endpoint, options = {}) {
  // Check if mock mode is active
  if (CONFIG.USE_MOCK || !isAwsConfigured()) {
    return handleMockRequest(endpoint, options);
  }

  const token = getAuthToken();
  if (!token) {
    console.error('No JWT auth token available. Redirecting to login.');
    logout();
    throw new Error('Authentication required. Redirecting to login.');
  }

  const url = `${CONFIG.API_BASE_URL.replace(/\/+$/, '')}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {})
  };

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(url, config);

    if (response.status === 401) {
      console.warn('API returned 401 Unauthorized. Access token expired or invalid.');
      alert('Your staff session has expired or is unauthorized. Please sign in again.');
      logout();
      throw new Error('Unauthorized');
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errMsg = data.error || (data.errors ? data.errors.join('; ') : `API error ${response.status}`);
      throw new Error(errMsg);
    }

    return data;
  } catch (error) {
    console.error(`Request to ${endpoint} failed:`, error);
    throw error;
  }
}

/**
 * Simulates API Gateway + Lambda in Mock Mode
 */
async function handleMockRequest(endpoint, options = {}) {
  await new Promise(r => setTimeout(r, 200)); // Simulate realistic network delay
  const method = (options.method || 'GET').toUpperCase();
  const urlParts = endpoint.split('?');
  const path = urlParts[0];
  const queryParams = new URLSearchParams(urlParts[1] || '');

  // 1. PATIENTS ENDPOINTS
  if (path === '/patients' && method === 'GET') {
    let patients = getMockPatients();
    const search = (queryParams.get('search') || '').trim().toLowerCase();
    if (search) {
      patients = patients.filter(p =>
        (p.fullName && p.fullName.toLowerCase().includes(search)) ||
        (p.patientId && p.patientId.toLowerCase().includes(search)) ||
        (p.phone && p.phone.toLowerCase().includes(search))
      );
    }
    patients.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return { success: true, count: patients.length, data: patients };
  }

  if (path === '/patients' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    if (!body.fullName || !body.phone) {
      throw new Error('Full name and phone number are required.');
    }
    const patients = getMockPatients();
    const newId = 'PAT-' + Math.random().toString(16).substring(2, 10).toUpperCase();
    const now = new Date().toISOString();
    const newPatient = {
      patientId: newId,
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
    patients.unshift(newPatient);
    saveMockPatients(patients);
    return { success: true, message: 'Patient registered successfully.', data: newPatient };
  }

  const patientIdMatch = path.match(/^\/patients\/([^/]+)$/);
  if (patientIdMatch) {
    const id = decodeURIComponent(patientIdMatch[1]);
    const patients = getMockPatients();
    const index = patients.findIndex(p => p.patientId === id);

    if (method === 'GET') {
      if (index === -1) throw new Error(`Patient '${id}' not found.`);
      return { success: true, data: patients[index] };
    }
    if (method === 'PUT') {
      if (index === -1) throw new Error(`Patient '${id}' not found.`);
      const body = JSON.parse(options.body || '{}');
      patients[index] = {
        ...patients[index],
        ...body,
        patientId: id,
        updatedAt: new Date().toISOString()
      };
      saveMockPatients(patients);
      return { success: true, message: 'Patient updated.', data: patients[index] };
    }
    if (method === 'DELETE') {
      if (index === -1) throw new Error(`Patient '${id}' not found.`);
      patients.splice(index, 1);
      saveMockPatients(patients);
      return { success: true, message: `Patient '${id}' deleted successfully.` };
    }
  }

  // 2. APPOINTMENTS ENDPOINTS
  if (path === '/appointments' && method === 'GET') {
    let appointments = getMockAppointments();
    const filterDate = queryParams.get('date');
    const filterStatus = queryParams.get('status');
    const filterPatientId = queryParams.get('patientId');

    if (filterDate) {
      appointments = appointments.filter(a => a.appointmentDate === filterDate);
    }
    if (filterStatus && filterStatus !== 'All') {
      appointments = appointments.filter(a => a.status.toLowerCase() === filterStatus.toLowerCase());
    }
    if (filterPatientId) {
      appointments = appointments.filter(a => a.patientId === filterPatientId);
    }

    appointments.sort((a, b) => {
      const dtA = `${a.appointmentDate}T${a.appointmentTime || '00:00'}`;
      const dtB = `${b.appointmentDate}T${b.appointmentTime || '00:00'}`;
      return dtA.localeCompare(dtB);
    });

    return { success: true, count: appointments.length, data: appointments };
  }

  if (path === '/appointments' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    if (!body.patientId || !body.doctorName || !body.appointmentDate || !body.appointmentTime || !body.reason) {
      throw new Error('All required fields must be supplied.');
    }

    // Past date check
    const today = new Date().toISOString().split('T')[0];
    if (body.appointmentDate < today) {
      throw new Error('Appointment date and time cannot be in the past.');
    }

    // Patient check
    const patients = getMockPatients();
    const patient = patients.find(p => p.patientId === body.patientId);
    if (!patient) {
      throw new Error(`Patient ID '${body.patientId}' does not exist.`);
    }

    const appointments = getMockAppointments();
    const newId = 'APT-' + Math.random().toString(16).substring(2, 10).toUpperCase();
    const now = new Date().toISOString();
    const newAppointment = {
      appointmentId: newId,
      patientId: body.patientId,
      patientName: patient.fullName,
      doctorName: body.doctorName.trim(),
      appointmentDate: body.appointmentDate,
      appointmentTime: body.appointmentTime,
      reason: body.reason.trim(),
      status: body.status || 'Scheduled',
      createdAt: now,
      updatedAt: now
    };
    appointments.push(newAppointment);
    saveMockAppointments(appointments);
    return { success: true, message: 'Appointment scheduled successfully.', data: newAppointment };
  }

  const apptIdMatch = path.match(/^\/appointments\/([^/]+)$/);
  if (apptIdMatch) {
    const id = decodeURIComponent(apptIdMatch[1]);
    const appointments = getMockAppointments();
    const index = appointments.findIndex(a => a.appointmentId === id);

    if (method === 'GET') {
      if (index === -1) throw new Error(`Appointment '${id}' not found.`);
      return { success: true, data: appointments[index] };
    }
    if (method === 'PUT') {
      if (index === -1) throw new Error(`Appointment '${id}' not found.`);
      const body = JSON.parse(options.body || '{}');
      appointments[index] = {
        ...appointments[index],
        ...body,
        appointmentId: id,
        updatedAt: new Date().toISOString()
      };
      saveMockAppointments(appointments);
      return { success: true, message: 'Appointment updated.', data: appointments[index] };
    }
    if (method === 'DELETE') {
      if (index === -1) throw new Error(`Appointment '${id}' not found.`);
      appointments.splice(index, 1);
      saveMockAppointments(appointments);
      return { success: true, message: `Appointment '${id}' deleted successfully.` };
    }
  }

  throw new Error(`Endpoint not found in mock router: ${method} ${path}`);
}

/**
 * Exported API service client
 */
export const api = {
  patients: {
    list: (search = '') => request(`/patients${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id) => request(`/patients/${encodeURIComponent(id)}`),
    create: (data) => request('/patients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/patients/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/patients/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  appointments: {
    list: (filters = {}) => {
      const params = new URLSearchParams();
      if (filters.date) params.append('date', filters.date);
      if (filters.status && filters.status !== 'All') params.append('status', filters.status);
      if (filters.patientId) params.append('patientId', filters.patientId);
      const qs = params.toString();
      return request(`/appointments${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/appointments/${encodeURIComponent(id)}`),
    create: (data) => request('/appointments', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/appointments/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/appointments/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }
};

