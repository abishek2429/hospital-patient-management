/**
 * Appointment Management View Module
 * Scheduling, filtering, status updates, validation, and DynamoDB synchronization
 */

import { api } from './api.js';
import { showToast } from './patients.js';

let cachedAppointments = [];
let onAppointmentDataChangedCallback = null;

export function registerAppointmentChangeCallback(callback) {
  onAppointmentDataChangedCallback = callback;
}

function notifyDataChanged() {
  if (typeof onAppointmentDataChangedCallback === 'function') {
    onAppointmentDataChangedCallback();
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Loads appointments from API with active filters
 */
export async function loadAppointments() {
  const tableBody = document.getElementById('appointments-table-body');
  const countBadge = document.getElementById('appointments-count-badge');
  const loadingIndicator = document.getElementById('appointments-loading');

  const filterDate = document.getElementById('appointments-filter-date')?.value || '';
  const filterStatus = document.getElementById('appointments-filter-status')?.value || 'All';

  if (loadingIndicator) loadingIndicator.style.display = 'flex';
  if (tableBody) tableBody.innerHTML = '';

  try {
    const filters = {};
    if (filterDate) filters.date = filterDate;
    if (filterStatus && filterStatus !== 'All') filters.status = filterStatus;

    const response = await api.appointments.list(filters);
    cachedAppointments = response.data || [];

    if (countBadge) {
      countBadge.textContent = `${cachedAppointments.length} appointment${cachedAppointments.length === 1 ? '' : 's'}`;
    }

    renderAppointmentsTable(cachedAppointments);
  } catch (error) {
    console.error('Failed to load appointments:', error);
    showToast(error.message || 'Could not load appointment records.', 'error');
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center empty-state text-danger">
            Error loading appointments from database: ${escapeHtml(error.message)}
          </td>
        </tr>
      `;
    }
  } finally {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
  }
}

export function getCachedAppointments() {
  return cachedAppointments;
}

/**
 * Renders appointments in HTML table
 */
function renderAppointmentsTable(appointments) {
  const tableBody = document.getElementById('appointments-table-body');
  if (!tableBody) return;

  if (appointments.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center empty-state">
          <div class="empty-icon">📅</div>
          <p>No appointments match current filters.</p>
          <small>Click "+ Schedule Appointment" to book a patient consultation.</small>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = appointments
    .map(appt => {
      const statusClass = 
        appt.status === 'Completed' ? 'badge-completed' :
        appt.status === 'Cancelled' ? 'badge-cancelled' : 'badge-scheduled';

      return `
        <tr data-appointment-id="${escapeHtml(appt.appointmentId)}">
          <td>
            <span class="appointment-id-pill">${escapeHtml(appt.appointmentId)}</span>
          </td>
          <td>
            <div class="patient-name-cell">
              <strong>${escapeHtml(appt.patientName || 'Unknown Patient')}</strong>
              <small class="text-muted d-block">${escapeHtml(appt.patientId)}</small>
            </div>
          </td>
          <td>
            <span>${escapeHtml(appt.doctorName)}</span>
          </td>
          <td>
            <strong>${escapeHtml(appt.appointmentDate)}</strong>
            <small class="text-muted d-block">${escapeHtml(appt.appointmentTime)}</small>
          </td>
          <td>
            <span class="truncate-text" title="${escapeHtml(appt.reason)}">${escapeHtml(appt.reason)}</span>
          </td>
          <td>
            <span class="badge ${statusClass}">${escapeHtml(appt.status)}</span>
          </td>
          <td class="table-actions">
            <button class="btn-icon btn-edit" title="Edit Appointment" data-action="edit" data-id="${escapeHtml(appt.appointmentId)}">
              ✏️
            </button>
            ${appt.status === 'Scheduled' ? `
              <button class="btn-icon btn-complete" title="Mark as Completed" data-action="complete" data-id="${escapeHtml(appt.appointmentId)}">
                ✅
              </button>
              <button class="btn-icon btn-cancel" title="Cancel Appointment" data-action="cancel" data-id="${escapeHtml(appt.appointmentId)}">
                🚫
              </button>
            ` : ''}
            <button class="btn-icon btn-delete" title="Delete Appointment" data-action="delete" data-id="${escapeHtml(appt.appointmentId)}">
              🗑️
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  attachAppointmentTableEventListeners();
}

/**
 * Table Action Handlers
 */
function attachAppointmentTableEventListeners() {
  const tableBody = document.getElementById('appointments-table-body');
  if (!tableBody) return;

  tableBody.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async e => {
      const action = btn.dataset.action;
      const appointmentId = btn.dataset.id;
      const appt = cachedAppointments.find(a => a.appointmentId === appointmentId);
      if (!appt) return;

      if (action === 'edit') {
        showAppointmentModal(appt);
      } else if (action === 'complete') {
        await updateAppointmentStatus(appointmentId, 'Completed');
      } else if (action === 'cancel') {
        await updateAppointmentStatus(appointmentId, 'Cancelled');
      } else if (action === 'delete') {
        showDeleteAppointmentModal(appt);
      }
    });
  });
}

/**
 * Changes appointment status
 */
async function updateAppointmentStatus(appointmentId, newStatus) {
  try {
    await api.appointments.update(appointmentId, { status: newStatus });
    showToast(`Appointment status changed to '${newStatus}'.`, 'success');
    await loadAppointments();
    notifyDataChanged();
  } catch (err) {
    showToast(err.message || 'Failed to update appointment status.', 'error');
  }
}

/**
 * Displays Form Modal for Scheduling or Editing Appointment
 */
export async function showAppointmentModal(appt = null, defaultPatientId = null) {
  const modal = document.getElementById('appointment-modal');
  const title = document.getElementById('appointment-modal-title');
  const form = document.getElementById('appointment-form');
  const patientSelect = document.getElementById('appointment-patientId');
  const dateInput = document.getElementById('appointment-date');

  if (!modal || !form || !patientSelect) return;

  form.reset();
  document.getElementById('appointment-modal-id').value = appt ? appt.appointmentId : '';

  // Restrict date input min value to today
  const today = new Date().toISOString().split('T')[0];
  dateInput.min = today;

  // Load existing patients from API to populate choices dropdown
  patientSelect.innerHTML = '<option value="">Loading patients...</option>';
  try {
    const res = await api.patients.list();
    const patients = res.data || [];

    if (patients.length === 0) {
      patientSelect.innerHTML = '<option value="">No registered patients found. Please add a patient first.</option>';
    } else {
      patientSelect.innerHTML = '<option value="">-- Select Patient --</option>' +
        patients.map(p => `
          <option value="${escapeHtml(p.patientId)}">
            ${escapeHtml(p.fullName)} (${escapeHtml(p.patientId)})
          </option>
        `).join('');
    }

    if (appt) {
      patientSelect.value = appt.patientId;
    } else if (defaultPatientId) {
      patientSelect.value = defaultPatientId;
    }
  } catch (err) {
    console.error('Error fetching patients for appointment dropdown:', err);
    patientSelect.innerHTML = '<option value="">Error loading patients</option>';
  }

  const statusGroup = document.getElementById('appointment-status-group');

  if (appt) {
    title.textContent = `Edit Appointment (${appt.appointmentId})`;
    document.getElementById('appointment-doctorName').value = appt.doctorName || '';
    document.getElementById('appointment-date').value = appt.appointmentDate || '';
    document.getElementById('appointment-time').value = appt.appointmentTime || '';
    document.getElementById('appointment-reason').value = appt.reason || '';
    document.getElementById('appointment-status').value = appt.status || 'Scheduled';
    if (statusGroup) statusGroup.style.display = 'block';
  } else {
    title.textContent = 'Schedule New Appointment';
    document.getElementById('appointment-date').value = today;
    document.getElementById('appointment-time').value = '10:00';
    document.getElementById('appointment-status').value = 'Scheduled';
    if (statusGroup) statusGroup.style.display = 'none';
  }

  modal.classList.add('active');
}

/**
 * Displays Delete Confirmation Modal for Appointment
 */
function showDeleteAppointmentModal(appt) {
  const modal = document.getElementById('delete-confirmation-modal');
  if (!modal) return;

  const msg = document.getElementById('delete-confirmation-message');
  msg.innerHTML = `Are you sure you want to permanently delete appointment <code>${escapeHtml(appt.appointmentId)}</code> for <strong>${escapeHtml(appt.patientName || appt.patientId)}</strong>?`;

  const confirmBtn = document.getElementById('delete-confirm-btn');
  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';
    try {
      await api.appointments.delete(appt.appointmentId);
      showToast('Appointment deleted successfully from DynamoDB.', 'success');
      modal.classList.remove('active');
      await loadAppointments();
      notifyDataChanged();
    } catch (err) {
      showToast(err.message || 'Failed to delete appointment.', 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete Record';
    }
  };

  modal.classList.add('active');
}

/**
 * Initializes Appointment Event Handlers
 */
export function initAppointmentsModule() {
  const scheduleBtn = document.getElementById('btn-schedule-appointment');
  if (scheduleBtn) {
    scheduleBtn.addEventListener('click', () => showAppointmentModal());
  }

  const filterDateInput = document.getElementById('appointments-filter-date');
  if (filterDateInput) {
    filterDateInput.addEventListener('change', () => loadAppointments());
  }

  const filterStatusSelect = document.getElementById('appointments-filter-status');
  if (filterStatusSelect) {
    filterStatusSelect.addEventListener('change', () => loadAppointments());
  }

  const btnFilterToday = document.getElementById('btn-filter-today');
  if (btnFilterToday) {
    btnFilterToday.addEventListener('click', () => {
      const today = new Date().toISOString().split('T')[0];
      if (filterDateInput) filterDateInput.value = today;
      loadAppointments();
    });
  }

  const btnFilterClear = document.getElementById('btn-filter-clear');
  if (btnFilterClear) {
    btnFilterClear.addEventListener('click', () => {
      if (filterDateInput) filterDateInput.value = '';
      if (filterStatusSelect) filterStatusSelect.value = 'All';
      loadAppointments();
    });
  }

  // Handle appointment form submission
  const form = document.getElementById('appointment-form');
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving to DynamoDB...';

      const appointmentId = document.getElementById('appointment-modal-id').value;
      const patientId = document.getElementById('appointment-patientId').value;
      const doctorName = document.getElementById('appointment-doctorName').value.trim();
      const appointmentDate = document.getElementById('appointment-date').value;
      const appointmentTime = document.getElementById('appointment-time').value;
      const reason = document.getElementById('appointment-reason').value.trim();
      const status = document.getElementById('appointment-status').value;

      // Reject appointment scheduled in the past
      const today = new Date().toISOString().split('T')[0];
      if (appointmentDate < today && status === 'Scheduled') {
        showToast('Appointment date cannot be in the past.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        return;
      }

      const payload = {
        patientId,
        doctorName,
        appointmentDate,
        appointmentTime,
        reason,
        status
      };

      try {
        if (appointmentId) {
          await api.appointments.update(appointmentId, payload);
          showToast('Appointment updated successfully.', 'success');
        } else {
          const result = await api.appointments.create(payload);
          showToast(`Appointment scheduled with ID ${result.data.appointmentId}.`, 'success');
        }

        document.getElementById('appointment-modal').classList.remove('active');
        await loadAppointments();
        notifyDataChanged();
      } catch (err) {
        showToast(err.message || 'Failed to save appointment.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }

  // Listen to custom event to open schedule modal with pre-selected patient
  window.addEventListener('open-schedule-modal', e => {
    showAppointmentModal(null, e.detail?.patientId);
  });
}

