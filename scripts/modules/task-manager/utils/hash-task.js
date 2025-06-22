import crypto from 'crypto';

/**
 * Generate a stable SHA256 hash from task content for duplicate detection
 * @param {Object} task - Task object
 * @returns {string} - SHA256 hash
 */
export function generateTaskHash(task) {
  if (!task || typeof task !== 'object') {
    throw new Error('Task must be a valid object');
  }

  // Extract key fields for hashing
  const hashFields = {
    title: (task.title || '').trim().toLowerCase(),
    description: (task.description || '').trim().toLowerCase(),
    screen: (task.screen || '').trim().toLowerCase(),
    component: (task.component || '').trim().toLowerCase(),
    sourceDocumentType: (task.sourceDocumentType || '').trim().toLowerCase()
  };

  // Create a consistent string representation
  const hashString = Object.keys(hashFields)
    .sort()
    .map(key => `${key}:${hashFields[key]}`)
    .join('|');

  // Generate SHA256 hash
  return crypto.createHash('sha256').update(hashString, 'utf8').digest('hex');
}

/**
 * Generate normalized title for grouping similar tasks
 * @param {string} title - Task title
 * @returns {string} - Normalized title
 */
export function normalizeTitle(title) {
  if (!title || typeof title !== 'string') {
    return '';
  }

  return title
    .toLowerCase()
    .trim()
    // Remove common prefixes/suffixes
    .replace(/^(implement|create|add|build|setup|configure)\s+/i, '')
    .replace(/\s+(implementation|setup|configuration)$/i, '')
    // Remove special characters and extra spaces
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Create a grouping key for candidate identification
 * @param {Object} task - Task object
 * @returns {string} - Grouping key
 */
export function createGroupingKey(task) {
  const normalizedTitle = normalizeTitle(task.title || '');
  const screen = (task.screen || '').toLowerCase().trim();
  const component = (task.component || '').toLowerCase().trim();
  const epicId = (task.epicId || '').toLowerCase().trim();
  
  return `${normalizedTitle}|${screen}|${component}|${epicId}`;
} 