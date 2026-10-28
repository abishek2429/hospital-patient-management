/**
 * Main Application Entry Point (Vanilla ES Modules)
 * Handles View Routing, Navigation, Auth Guards, and Cloud Settings
 */

import { CONFIG, isAwsConfigured, saveConfigOverrides } from './config.js';
import { requireAuth, getUserEmail, logout } from './auth.js';
import { 
  initPatientsModule, 
  loadPatients, 
  registerPatientChangeCallback, 
  showToast 
} from './patients.js';
import { 
  initAppointmentsModule, 
  loadAppointments, 
  registerAppointmentChangeCallback 
} from './appointments.js';
import { 
  initDashboardModule, 
  loadDashboard 
} from './dashboard.js';

let currentView = 'dashboard';

/**
 * Switches the active page view
 */
export function switchView(viewName) {
  const views = ['dashboard', 'patients', 'appointments'];
  if (!views.includes(viewName)) viewName = 'dashboard';

  currentView = viewName;

  // Update URL hash
  window.location.hash = viewName;

  // Update navigation items
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.dataset.view === viewName) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Toggle view containers
  document.querySelectorAll('.view-section').forEach(section => {
    if (section.id === `view-${viewName}`) {
      section.classList.add('active');
    } else {
      section.classList.remove('active');
    }
  });

  // Update page title
  const pageTitle = document.getElementById('current-page-title');
  if (pageTitle) {
    if (viewName === 'dashboard') pageTitle.textContent = 'Hospital Overview';
    if (viewName === 'patients') pageTitle.textContent = 'Patient Directory';
    if (viewName === 'appointments') pageTitle.textContent = 'Appointment Schedules';
  }

  // Load data for active view
  if (viewName === 'dashboard') {
    loadDashboard();
  } else if (viewName === 'patients') {
    loadPatients();
  } else if (viewName === 'appointments') {
    loadAppointments();
  }

  // Close mobile sidebar if open
  document.querySelector('.app-sidebar')?.classList.remove('open');
}

/**
 * Initializes Cloud Settings Modal
 */
function initSettingsModal() {
  const settingsModal = document.getElementById('settings-modal');
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const formSettings = document.getElementById('settings-form');

  if (!settingsModal || !formSettings) return;

  if (btnOpenSettings) {
    btnOpenSettings.addEventListener('click', () => {
      document.getElementById('setting-mock-mode').checked = CONFIG.USE_MOCK;
      document.getElementById('setting-api-url').value = CONFIG.API_BASE_URL || '';
      document.getElementById('setting-user-pool-id').value = CONFIG.COGNITO.USER_POOL_ID || '';
      document.getElementById('setting-client-id').value = CONFIG.COGNITO.APP_CLIENT_ID || '';
      document.getElementById('setting-region').value = CONFIG.COGNITO.REGION || 'us-east-1';
      settingsModal.classList.add('active');
    });
  }

  formSettings.addEventListener('submit', e => {
    e.preventDefault();
    const useMock = document.getElementById('setting-mock-mode').checked;
    const apiUrl = document.getElementById('setting-api-url').value.trim();
    const userPoolId = document.getElementById('setting-user-pool-id').value.trim();
    const clientId = document.getElementById('setting-client-id').value.trim();
    const region = document.getElementById('setting-region').value.trim();

    saveConfigOverrides({
      USE_MOCK: useMock,
      API_BASE_URL: apiUrl,
      COGNITO: {
        REGION: region,
        USER_POOL_ID: userPoolId,
        APP_CLIENT_ID: clientId
      }
    });

    showToast('Configuration updated successfully!', 'success');
    settingsModal.classList.remove('active');
    // Reload active view data
    switchView(currentView);
  });
}

/**
 * Sets up global modal close handlers
 */
function setupModalDismissals() {
  document.querySelectorAll('.modal').forEach(modal => {
    // Backdrop click
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });

    // Close button click
    modal.querySelectorAll('.modal-close, .btn-modal-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
    });
  });

  // ESC key dismisses modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
    }
  });
}

/**
 * Main Application Startup
 */
document.addEventListener('DOMContentLoaded', () => {
  // 1. Guard check: redirect to login if unauthenticated
  if (!requireAuth()) return;

  // 2. Display signed in staff email
  const staffEmail = getUserEmail();
  const staffEmailEl = document.getElementById('staff-email-display');
  if (staffEmailEl) staffEmailEl.textContent = staffEmail || 'staff@hospital.com';

  // 3. Connect Logout button
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to sign out from the Hospital Management System?')) {
      logout();
    }
  });

  // 4. Mobile sidebar toggle
  const mobileToggle = document.getElementById('mobile-sidebar-toggle');
  const sidebar = document.querySelector('.app-sidebar');
  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  // 5. Setup navigation links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const view = link.dataset.view;
      switchView(view);
    });
  });

  // Quick switch buttons in dashboard
  document.getElementById('dash-link-patients')?.addEventListener('click', e => {
    e.preventDefault();
    switchView('patients');
  });
  document.getElementById('dash-link-appointments')?.addEventListener('click', e => {
    e.preventDefault();
    switchView('appointments');
  });

  // 6. Initialize sub-modules
  initPatientsModule();
  initAppointmentsModule();
  initDashboardModule();
  initSettingsModal();
  setupModalDismissals();

  // Register cross-module change handlers to update dashboard stats
  registerPatientChangeCallback(() => {
    loadDashboard();
  });
  registerAppointmentChangeCallback(() => {
    loadDashboard();
  });

  // 7. Route based on URL hash or default to dashboard
  const initialHash = window.location.hash.replace('#', '') || 'dashboard';
  switchView(initialHash);

  // Set today's date in header
  const headerDateEl = document.getElementById('header-date-display');
  if (headerDateEl) {
    const now = new Date();
    headerDateEl.textContent = now.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
});

