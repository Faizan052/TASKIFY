// ============================================
// TASKIFY - Validation Utilities
// ============================================

/**
 * Email validation regex
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate and normalize email address
 * @param {string} email - Email address to validate
 * @returns {Object} { valid: boolean, email: string|null, error: string|null }
 */
const validateEmail = (email) => {
  if (!email) {
    return { valid: false, email: null, error: 'Email is required' };
  }

  const trimmedEmail = email.trim().toLowerCase();

  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return { valid: false, email: null, error: 'Invalid email format' };
  }

  return { valid: true, email: trimmedEmail, error: null };
};

/**
 * Validate required fields
 * @param {Object} data - Object containing field values
 * @param {Array<string>} requiredFields - Array of required field names
 * @returns {Object} { valid: boolean, missingFields: Array<string>, error: string|null }
 */
const validateRequiredFields = (data, requiredFields) => {
  const missingFields = requiredFields.filter(field => !data[field]);

  if (missingFields.length > 0) {
    return {
      valid: false,
      missingFields,
      error: `Missing required fields: ${missingFields.join(', ')}`
    };
  }

  return { valid: true, missingFields: [], error: null };
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @param {Object} options - Validation options
 * @returns {Object} { valid: boolean, error: string|null }
 */
const validatePassword = (password, options = {}) => {
  const {
    minLength = 8,
    requireUppercase = false,
    requireLowercase = false,
    requireNumber = false,
    requireSpecialChar = false
  } = options;

  if (!password) {
    return { valid: false, error: 'Password is required' };
  }

  if (password.length < minLength) {
    return { valid: false, error: `Password must be at least ${minLength} characters long` };
  }

  if (requireUppercase && !/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }

  if (requireLowercase && !/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }

  if (requireNumber && !/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }

  if (requireSpecialChar && !/[^a-zA-Z0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character' };
  }

  return { valid: true, error: null };
};

/**
 * Sanitize user input (basic XSS prevention)
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;

  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Validate ObjectId format
 * @param {string} id - ID to validate
 * @returns {boolean} True if valid ObjectId format
 */
const isValidObjectId = (id) => {
  if (!id) return false;
  return /^[0-9a-fA-F]{24}$/.test(id.toString());
};

module.exports = {
  EMAIL_REGEX,
  validateEmail,
  validateRequiredFields,
  validatePassword,
  sanitizeInput,
  isValidObjectId
};
