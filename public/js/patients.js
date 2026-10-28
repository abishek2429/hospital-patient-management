/**
 * Patient Management View Module
 * Full CRUD operations, search, modals, and DynamoDB synchronization
 */

import { api } from './api.js';

let cachedPatients = [];
let onPatientDataChangedCallback = null;

export function registerPatientChangeCallback(callback) {
  onPatientDataChangedCallback = callback;
}

function notifyDataChanged() {
  if (typeof onPatientDataChangedCallback === 'function') {
    onPatientDataChangedCallback();
  }
}

/**
 * Toast notification utility
 */
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">
      ${type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ'}
    </div>
    <div class="toast-content">
      <p class="toast-message">${escapeHtml(message)}</p>
    </div>
    <button class="toast-close" aria-label="Close">&times;</button>
  `;

  container.appendChild(toast);

  // Auto remove after 4 seconds
  const timer = setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 4000);

  toast.querySelector('.toast-close').addEventListener('click', () => {
    clearTimeout(timer);
    toast.remove();
  });
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
 * Loads patients from API and renders table
 */
export async function loadPatients(searchTerm = '') {
  const tableBody = document.getElementById('patients-table-body');
  const countBadge = document.getElementById('patients-count-badge');
  const loadingIndicator = document.getElementById('patients-loading');

  if (loadingIndicator) loadingIndicator.style.display = 'flex';
  if (tableBody) tableBody.innerHTML = '';

  try {
    const response = await api.patients.list(searchTerm);
    cachedPatients = response.data || [];

    if (countBadge) {
      countBadge.textContent = `${cachedPatients.length} patient${cachedPatients.length === 1 ? '' : 's'}`;
    }

    renderPatientsTable(cachedPatients);
  } catch (error) {
    console.error('Failed to load patients:', error);
    showToast(error.message || 'Could not load patient records.', 'error');
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center empty-state text-danger">
            Error loading patient records from database: ${escapeHtml(error.message)}
          </td>
        </tr>
      `;
    }
  } finally {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
  }
}

/**
 * Returns cached patient records
 */
export function getCachedPatients() {
  return cachedPatients;
}

/**
 * Renders patient rows in HTML table
 */
function renderPatientsTable(patients) {
  const tableBody = document.getElementById('patients-table-body');
  if (!tableBody) return;

  if (patients.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center empty-state">
          <div class="empty-icon">📁</div>
          <p>No patient records found.</p>
          <small>Click "+ Register Patient" to add a new record to DynamoDB.</small>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = patients
    .map(patient => {
      const formattedDate = patient.dateOfBirth || 'N/A';
      const bloodGroupBadge = patient.bloodGroup && patient.bloodGroup !== 'Unknown'
        ? `<span class="badge badge-blood">${escapeHtml(patient.bloodGroup)}</span>`
        : `<span class="text-muted">—</span>`;

      return `
        <tr data-patient-id="${escapeHtml(patient.patientId)}">
          <td>
            <span class="patient-id-pill">${escapeHtml(patient.patientId)}</span>
          </td>
          <td>
            <div class="patient-name-cell">
              <strong>${escapeHtml(patient.fullName)}</strong>
              ${patient.email ? `<small class="text-muted d-block">${escapeHtml(patient.email)}</small>` : ''}
            </div>
          </td>
          <td>
            <span>${escapeHtml(patient.gender || '—')}</span>
            <small class="text-muted d-block">${escapeHtml(formattedDate)}</small>
          </td>
          <td>
            <span>${escapeHtml(patient.phone)}</span>
          </td>
          <td>
            ${bloodGroupBadge}
          </td>
          <td class="table-actions">
            <button class="btn-icon btn-view" title="View Patient Details" data-action="view" data-id="${escapeHtml(patient.patientId)}">
              👁️
            </button>
            <button class="btn-icon btn-edit" title="Edit Patient" data-action="edit" data-id="${escapeHtml(patient.patientId)}">
              ✏️
            </button>
            <button class="btn-icon btn-delete" title="Delete Patient" data-action="delete" data-id="${escapeHtml(patient.patientId)}">
              🗑️
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  attachTableEventListeners();
}

/**
 * Table Action Buttons
 */
function attachTableEventListeners() {
  const tableBody = document.getElementById('patients-table-body');
  if (!tableBody) return;

  tableBody.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      const action = btn.dataset.action;
      const patientId = btn.dataset.id;
      const patient = cachedPatients.find(p => p.patientId === patientId);

      if (action === 'view' && patient) {
        showPatientDetailsModal(patient);
      } else if (action === 'edit' && patient) {
        showPatientFormModal(patient);
      } else if (action === 'delete' && patient) {
        showDeleteConfirmationModal(patient);
      }
    });
  });
}

/**
 * Displays Form Modal for Add or Edit Patient
 */
export function showPatientFormModal(patient = null) {
  const modal = document.getElementById('patient-modal');
  const title = document.getElementById('patient-modal-title');
  const form = document.getElementById('patient-form');

  if (!modal || !form) return;

  form.reset();
  document.getElementById('patient-modal-id').value = patient ? patient.patientId : '';

  if (patient) {
    title.textContent = `Edit Patient (${patient.patientId})`;
    document.getElementById('patient-fullName').value = patient.fullName || '';
    document.getElementById('patient-dateOfBirth').value = patient.dateOfBirth || '';
    document.getElementById('patient-gender').value = patient.gender || 'Male';
    document.getElementById('patient-phone').value = patient.phone || '';
    document.getElementById('patient-email').value = patient.email || '';
    document.getElementById('patient-bloodGroup').value = patient.bloodGroup || 'Unknown';
    document.getElementById('patient-address').value = patient.address || '';
  } else {
    title.textContent = 'Register New Patient';
    document.getElementById('patient-gender').value = 'Male';
    document.getElementById('patient-bloodGroup').value = 'Unknown';
  }

  modal.classList.add('active');
}

/**
 * Displays Details Modal with Patient Profile & Medical History
 */
async function showPatientDetailsModal(patient) {
  const modal = document.getElementById('patient-details-modal');
  if (!modal) return;

  document.getElementById('details-patient-id').textContent = patient.patientId;
  document.getElementById('details-full-name').textContent = patient.fullName;
  document.getElementById('details-gender').textContent = patient.gender || 'Not specified';
  document.getElementById('details-dob').textContent = patient.dateOfBirth || 'Not provided';
  document.getElementById('details-phone').textContent = patient.phone;
  document.getElementById('details-email').textContent = patient.email || 'None';
  document.getElementById('details-blood').textContent = patient.bloodGroup || 'Unknown';
  document.getElementById('details-address').textContent = patient.address || 'None provided';
  document.getElementById('details-registered').textContent = patient.createdAt ? new Date(patient.createdAt).toLocaleString() : 'N/A';
  document.getElementById('details-updated').textContent = patient.updatedAt ? new Date(patient.updatedAt).toLocaleString() : 'N/A';

  // Direct button to schedule appointment for this patient
  const scheduleBtn = document.getElementById('details-schedule-btn');
  if (scheduleBtn) {
    scheduleBtn.onclick = () => {
      modal.classList.remove('active');
      window.dispatchEvent(new CustomEvent('open-schedule-modal', { detail: { patientId: patient.patientId } }));
    };
  }

  modal.classList.add('active');
}

/**
 * Displays Delete Confirmation Modal
 */
function showDeleteConfirmationModal(patient) {
  const modal = document.getElementById('delete-confirmation-modal');
  if (!modal) return;

  const msg = document.getElementById('delete-confirmation-message');
  msg.innerHTML = `Are you sure you want to permanently delete patient <strong>${escapeHtml(patient.fullName)}</strong> (<code>${escapeHtml(patient.patientId)}</code>) from DynamoDB?`;

  const confirmBtn = document.getElementById('delete-confirm-btn');
  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';
    try {
      await api.patients.delete(patient.patientId);
      showToast(`Patient ${patient.fullName} deleted successfully.`, 'success');
      modal.classList.remove('active');
      await loadPatients();
      notifyDataChanged();
    } catch (err) {
      showToast(err.message || 'Failed to delete patient.', 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete Record';
    }
  };

  modal.classList.add('active');
}

/**
 * Initializes Patient Event Handlers
 */
export function initPatientsModule() {
  // Search input with debounce
  const searchInput = document.getElementById('patients-search-input');
  let searchTimer;
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        loadPatients(e.target.value);
      }, 300);
    });
  }

  // Add Patient button
  const addBtn = document.getElementById('btn-add-patient');
  if (addBtn) {
    addBtn.addEventListener('click', () => showPatientFormModal());
  }

  // Patient form submission (Create / Update)
  const form = document.getElementById('patient-form');
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving to DynamoDB...';

      const patientId = document.getElementById('patient-modal-id').value;
      const payload = {
        fullName: document.getElementById('patient-fullName').value.trim(),
        dateOfBirth: document.getElementById('patient-dateOfBirth').value,
        gender: document.getElementById('patient-gender').value,
        phone: document.getElementById('patient-phone').value.trim(),
        email: document.getElementById('patient-email').value.trim(),
        bloodGroup: document.getElementById('patient-bloodGroup').value,
        address: document.getElementById('patient-address').value.trim()
      };

      try {
        if (patientId) {
          // Update
          await api.patients.update(patientId, payload);
          showToast(`Patient updated successfully.`, 'success');
        } else {
          // Create
          const result = await api.patients.create(payload);
          showToast(`Patient registered with ID ${result.data.patientId}.`, 'success');
        }

        document.getElementById('patient-modal').classList.remove('active');
        await loadPatients();
        notifyDataChanged();
      } catch (err) {
        showToast(err.message || 'Operation failed.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }
}

