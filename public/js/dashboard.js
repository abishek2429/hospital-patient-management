/**
 * Hospital Management System - Dashboard Module
 * Computes live metrics from database records without hardcoding.
 */

import { api } from './api.js';
import { showPatientFormModal } from './patients.js';
import { showAppointmentModal } from './appointments.js';

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
 * Loads dashboard statistics and preview tables from DynamoDB
 */
export async function loadDashboard() {
  const statPatientsEl = document.getElementById('stat-total-patients');
  const statAppointmentsEl = document.getElementById('stat-total-appointments');
  const statTodayEl = document.getElementById('stat-today-appointments');
  const statUpcomingEl = document.getElementById('stat-upcoming-appointments');

  const todayScheduleBody = document.getElementById('dashboard-today-schedule');
  const recentPatientsBody = document.getElementById('dashboard-recent-patients');

  try {
    // Parallel fetch from API
    const [patientsRes, appointmentsRes] = await Promise.all([
      api.patients.list(),
      api.appointments.list()
    ]);

    const patients = patientsRes.data || [];
    const appointments = appointmentsRes.data || [];

    // Calculate real metrics from database data
    const todayStr = new Date().toISOString().split('T')[0];

    const totalPatients = patients.length;
    const totalAppointments = appointments.length;

    const todayAppointments = appointments.filter(
      a => a.appointmentDate === todayStr && a.status !== 'Cancelled'
    );

    const upcomingAppointments = appointments.filter(
      a => a.appointmentDate >= todayStr && a.status === 'Scheduled'
    );

    // Update KPI counters
    if (statPatientsEl) statPatientsEl.textContent = totalPatients;
    if (statAppointmentsEl) statAppointmentsEl.textContent = totalAppointments;
    if (statTodayEl) statTodayEl.textContent = todayAppointments.length;
    if (statUpcomingEl) statUpcomingEl.textContent = upcomingAppointments.length;

    // Render Today's Schedule Preview
    if (todayScheduleBody) {
      if (todayAppointments.length === 0) {
        todayScheduleBody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center empty-state-compact">
              No appointments scheduled for today (${todayStr}).
            </td>
          </tr>
        `;
      } else {
        todayScheduleBody.innerHTML = todayAppointments.slice(0, 5).map(a => `
          <tr>
            <td><strong>${escapeHtml(a.appointmentTime)}</strong></td>
            <td>
              <div><strong>${escapeHtml(a.patientName)}</strong></div>
              <small class="text-muted">${escapeHtml(a.patientId)}</small>
            </td>
            <td>${escapeHtml(a.doctorName)}</td>
            <td>
              <span class="badge ${a.status === 'Completed' ? 'badge-completed' : 'badge-scheduled'}">
                ${escapeHtml(a.status)}
              </span>
            </td>
          </tr>
        `).join('');
      }
    }

    // Render Recent Patients Preview
    if (recentPatientsBody) {
      if (patients.length === 0) {
        recentPatientsBody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center empty-state-compact">
              No patients registered yet.
            </td>
          </tr>
        `;
      } else {
        recentPatientsBody.innerHTML = patients.slice(0, 5).map(p => `
          <tr>
            <td><span class="patient-id-pill">${escapeHtml(p.patientId)}</span></td>
            <td><strong>${escapeHtml(p.fullName)}</strong></td>
            <td>${escapeHtml(p.phone)}</td>
            <td><small class="text-muted">${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'N/A'}</small></td>
          </tr>
        `).join('');
      }
    }

  } catch (error) {
    console.error('Failed to load dashboard data:', error);
    if (statPatientsEl) statPatientsEl.textContent = '0';
    if (statAppointmentsEl) statAppointmentsEl.textContent = '0';
    if (statTodayEl) statTodayEl.textContent = '0';
    if (statUpcomingEl) statUpcomingEl.textContent = '0';
    if (todayScheduleBody) {
      todayScheduleBody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center empty-state-compact" style="color:var(--danger);">
            Connection timeout / error. Check your API Gateway URL and Region in Cloud Settings.
          </td>
        </tr>
      `;
    }
    if (recentPatientsBody) {
      recentPatientsBody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center empty-state-compact" style="color:var(--danger);">
            Connection timeout / error. Check your API Gateway URL and Region in Cloud Settings.
          </td>
        </tr>
      `;
    }
  }
}

/**
 * Initializes Dashboard Action Buttons
 */
export function initDashboardModule() {
  const quickAddPatient = document.getElementById('dash-btn-add-patient');
  if (quickAddPatient) {
    quickAddPatient.addEventListener('click', () => showPatientFormModal());
  }

  const quickScheduleAppt = document.getElementById('dash-btn-schedule-appt');
  if (quickScheduleAppt) {
    quickScheduleAppt.addEventListener('click', () => showAppointmentModal());
  }
}

