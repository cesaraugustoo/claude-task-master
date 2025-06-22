import prdsAdapter from './prds.js';
import uxSpecAdapter from './ux-spec.js';
import sddsAdapter from './sdds.js';
import fallbackAdapter from './fallback.js';

/**
 * Document Adapter Registry
 * Maps document types to their specific adapters
 */
const DOCUMENT_ADAPTERS = {
	'PRD': prdsAdapter,
	'PRODUCT_REQUIREMENTS': prdsAdapter, // Alias
	'UX_SPEC': uxSpecAdapter,
	'DESIGN_SPEC': uxSpecAdapter, // Alias
	'UI_SPEC': uxSpecAdapter, // Alias
	'SDD': sddsAdapter,
	'SOFTWARE_DESIGN': sddsAdapter, // Alias
	'TECH_SPEC': sddsAdapter, // Alias
	'ARCHITECTURE': sddsAdapter // Alias
};

/**
 * Get the appropriate adapter for a document type
 * @param {string} documentType - The type of document (e.g., 'PRD', 'UX_SPEC', 'SDD')
 * @returns {Object} The adapter object with getPrePrompt, postProcessTasks, and estimateTaskCount methods
 */
export function getAdapter(documentType) {
	if (!documentType) {
		return fallbackAdapter;
	}

	const normalizedType = documentType.toUpperCase().replace(/[-_\s]/g, '_');
	const adapter = DOCUMENT_ADAPTERS[normalizedType];
	
	if (!adapter) {
		console.warn(`No specific adapter found for document type '${documentType}', using fallback adapter`);
		return fallbackAdapter;
	}

	return adapter;
}

/**
 * Get pre-prompt for a specific document type
 * @param {string} documentType - The document type
 * @param {string} documentText - The document content
 * @returns {string} Document-type specific system prompt addition
 */
export function getPrePrompt(documentType, documentText) {
	const adapter = getAdapter(documentType);
	return adapter.getPrePrompt(documentText);
}

/**
 * Post-process tasks with document-type specific fields
 * @param {string} documentType - The document type
 * @param {Array} taskList - Array of generated tasks
 * @param {string} documentId - The document identifier
 * @returns {Array} Tasks with document-specific fields added
 */
export function postProcessTasks(documentType, taskList, documentId) {
	const adapter = getAdapter(documentType);
	return adapter.postProcessTasks(taskList, documentId);
}

/**
 * Estimate task count for a document
 * @param {string} documentType - The document type
 * @param {string} documentText - The document content
 * @returns {number} Estimated number of tasks
 */
export function estimateTaskCount(documentType, documentText) {
	const adapter = getAdapter(documentType);
	return adapter.estimateTaskCount(documentText);
}

/**
 * Get list of supported document types
 * @returns {Array<string>} Array of supported document type keys
 */
export function getSupportedDocumentTypes() {
	return Object.keys(DOCUMENT_ADAPTERS);
}

/**
 * Check if a document type is supported
 * @param {string} documentType - The document type to check
 * @returns {boolean} True if supported, false otherwise
 */
export function isDocumentTypeSupported(documentType) {
	if (!documentType) return false;
	const normalizedType = documentType.toUpperCase().replace(/[-_\s]/g, '_');
	return DOCUMENT_ADAPTERS.hasOwnProperty(normalizedType);
} 