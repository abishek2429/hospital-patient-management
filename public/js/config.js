/**
 * Hospital Patient Management System - Configuration
 * St. Jude Cloud Care / Metropolitan Hospital Center
 */

const STORAGE_KEY_CONFIG = 'hospital_aws_config_overrides';

// Default configuration
const defaultConfig = {
  // Toggle between AWS live cloud services and offline mock mode (for local lab presentation without active credentials)
  USE_MOCK: false,

  // Amazon Cognito User Pools Configuration
  COGNITO: {
    REGION: 'us-east-1',
    USER_POOL_ID: 'us-east-1_XXXXXXXXX',
    APP_CLIENT_ID: 'XXXXXXXXXXXXXXXXXXXXXXXXXX'
  },

  // Amazon API Gateway HTTP API Endpoint URL (must not end with a trailing slash)
  API_BASE_URL: 'https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com',

  // Hospital Portal Metadata
  HOSPITAL_NAME: 'Metropolitan Hospital Center',
  PORTAL_NAME: 'Cloud Hospital Staff Portal',
  VERSION: '1.0.0-aws-serverless',

  // Default credentials for lab examination testing
  DEMO_STAFF: {
    email: 'staff@hospital.com',
    password: 'HospitalStaff123!'
  }
};

/**
 * Loads configuration with runtime overrides stored in localStorage (if any)
 */
function loadConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...defaultConfig,
        ...parsed,
        COGNITO: {
          ...defaultConfig.COGNITO,
          ...(parsed.COGNITO || {})
        }
      };
    }
  } catch (err) {
    console.warn('Could not load stored config overrides:', err);
  }
  return defaultConfig;
}

export const CONFIG = loadConfig();

/**
 * Save updated configuration dynamically from UI settings modal
 */
export function saveConfigOverrides(newConfig) {
  try {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(newConfig));
    Object.assign(CONFIG, newConfig);
    return true;
  } catch (err) {
    console.error('Failed to save config overrides:', err);
    return false;
  }
}

/**
 * Checks if real AWS resources have been specified
 */
export function isAwsConfigured() {
  if (CONFIG.USE_MOCK) return false;
  const isApiValid = CONFIG.API_BASE_URL && 
    !CONFIG.API_BASE_URL.includes('XXXXXXXXXX') && 
    CONFIG.API_BASE_URL.startsWith('https://');
  const isCognitoValid = CONFIG.COGNITO.USER_POOL_ID && 
    !CONFIG.COGNITO.USER_POOL_ID.includes('XXXXXXXXX') &&
    CONFIG.COGNITO.APP_CLIENT_ID && 
    !CONFIG.COGNITO.APP_CLIENT_ID.includes('XXXXXXXXXX');
  return Boolean(isApiValid && isCognitoValid);
}

