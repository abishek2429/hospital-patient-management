/**
 * Amazon Cognito Authentication Client (Pure Vanilla ES Modules)
 * Handles USER_PASSWORD_AUTH flow, NEW_PASSWORD_REQUIRED challenge, and session persistence.
 */

import { CONFIG, isAwsConfigured } from './config.js';

const AUTH_STORAGE_KEY = 'hospital_staff_auth_session';

/**
 * Parses JWT payload without external library
 */
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (err) {
    console.error('Failed to parse JWT token:', err);
    return null;
  }
}

/**
 * Retrieves the stored session from sessionStorage (or localStorage)
 */
export function getStoredSession() {
  try {
    const data = sessionStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem(AUTH_STORAGE_KEY);
    if (!data) return null;
    const session = JSON.parse(data);
    
    // Check expiration timestamp
    if (session.expiresAt && Date.now() > session.expiresAt) {
      clearSession();
      return null;
    }
    return session;
  } catch (err) {
    console.error('Error reading stored session:', err);
    return null;
  }
}

/**
 * Stores the authentication session
 */
function saveSession(tokens, userEmail, rememberMe = true) {
  const expiresInMs = (tokens.ExpiresIn || 3600) * 1000;
  const session = {
    idToken: tokens.IdToken,
    accessToken: tokens.AccessToken,
    refreshToken: tokens.RefreshToken,
    email: userEmail,
    expiresAt: Date.now() + expiresInMs,
    savedAt: Date.now()
  };

  const payload = JSON.stringify(session);
  if (rememberMe) {
    localStorage.setItem(AUTH_STORAGE_KEY, payload);
  } else {
    sessionStorage.setItem(AUTH_STORAGE_KEY, payload);
  }
  return session;
}

/**
 * Clears stored credentials
 */
export function clearSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

/**
 * Checks if staff user is currently authenticated
 */
export function isAuthenticated() {
  const session = getStoredSession();
  return Boolean(session && session.idToken);
}

/**
 * Gets the JWT token to be passed in Authorization: Bearer <token>
 */
export function getAuthToken() {
  const session = getStoredSession();
  // Cognito ID Token contains user email, sub and aud matching app client ID
  return session ? (session.idToken || session.accessToken) : null;
}

/**
 * Gets the signed-in staff email
 */
export function getUserEmail() {
  const session = getStoredSession();
  return session ? session.email : null;
}

/**
 * Authenticates user via Amazon Cognito User Pools USER_PASSWORD_AUTH
 */
export async function login(email, password, rememberMe = true) {
  const cleanEmail = email.trim().toLowerCase();

  // If mock mode is forced or AWS endpoints are placeholder, use local authentication
  if (CONFIG.USE_MOCK || !isAwsConfigured()) {
    console.log('[Auth] Authenticating in Mock Mode...');
    await new Promise(res => setTimeout(res, 400)); // simulate network latency

    if (
      cleanEmail === CONFIG.DEMO_STAFF.email.toLowerCase() &&
      password === CONFIG.DEMO_STAFF.password
    ) {
      // Create mock JWT-like tokens
      const mockHeader = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const mockPayload = btoa(
        JSON.stringify({
          sub: 'mock-staff-sub-12345',
          email: cleanEmail,
          'cognito:groups': ['HospitalStaff'],
          exp: Math.floor(Date.now() / 1000) + 3600
        })
      );
      const mockToken = `${mockHeader}.${mockPayload}.mockSignatureString`;

      const session = saveSession(
        {
          IdToken: mockToken,
          AccessToken: mockToken,
          RefreshToken: 'mock-refresh-token',
          ExpiresIn: 3600
        },
        cleanEmail,
        rememberMe
      );

      return {
        success: true,
        session
      };
    } else {
      throw new Error('Invalid email or password. For mock demo use: staff@hospital.com / HospitalStaff123!');
    }
  }

  // Live Amazon Cognito User Pools authentication
  const region = CONFIG.COGNITO.REGION;
  const clientId = CONFIG.COGNITO.APP_CLIENT_ID;
  const endpoint = `https://cognito-idp.${region}.amazonaws.com/`;

  const payload = {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: clientId,
    AuthParameters: {
      USERNAME: cleanEmail,
      PASSWORD: password
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    const errorType = data.__type || 'AuthenticationError';
    const message = data.message || 'Cognito authentication failed.';
    throw new Error(`[${errorType}] ${message}`);
  }

  // Handle temporary password change challenge (Admin-created users)
  if (data.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
    return {
      success: false,
      requiresNewPassword: true,
      session: data.Session,
      email: cleanEmail,
      challengeParameters: data.ChallengeParameters
    };
  }

  if (data.AuthenticationResult) {
    const session = saveSession(data.AuthenticationResult, cleanEmail, rememberMe);
    return {
      success: true,
      session
    };
  }

  throw new Error('Unexpected Cognito response format.');
}

/**
 * Responds to NEW_PASSWORD_REQUIRED challenge (for first-time login)
 */
export async function respondToNewPassword(email, newPassword, sessionString, rememberMe = true) {
  const cleanEmail = email.trim().toLowerCase();

  if (CONFIG.USE_MOCK || !isAwsConfigured()) {
    return login(cleanEmail, newPassword, rememberMe);
  }

  const region = CONFIG.COGNITO.REGION;
  const clientId = CONFIG.COGNITO.APP_CLIENT_ID;
  const endpoint = `https://cognito-idp.${region}.amazonaws.com/`;

  const payload = {
    ChallengeName: 'NEW_PASSWORD_REQUIRED',
    ClientId: clientId,
    ChallengeResponses: {
      USERNAME: cleanEmail,
      NEW_PASSWORD: newPassword
    },
    Session: sessionString
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.RespondToAuthChallenge'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    const errorType = data.__type || 'ChallengeError';
    const message = data.message || 'Failed to update temporary password.';
    throw new Error(`[${errorType}] ${message}`);
  }

  if (data.AuthenticationResult) {
    const session = saveSession(data.AuthenticationResult, cleanEmail, rememberMe);
    return {
      success: true,
      session
    };
  }

  throw new Error('Unexpected Cognito challenge response.');
}

/**
 * Signs out current staff user and navigates to login.html
 */
export function logout() {
  clearSession();
  window.location.href = 'login.html';
}

/**
 * Guard for protected pages: redirects unauthenticated users to login.html
 */
export function requireAuth() {
  if (!isAuthenticated()) {
    console.warn('[AuthGuard] Unauthenticated access detected. Redirecting to login.html');
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

/**
 * Guard for login page: redirects already authenticated users to dashboard index.html
 */
export function redirectIfAuthenticated() {
  if (isAuthenticated()) {
    window.location.href = 'index.html';
    return true;
  }
  return false;
}

