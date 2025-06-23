/**
 * direct-functions/process-docs.js
 * Implementation for the process_docs MCP tool.
 */

import processDocumentHierarchy from '../../../scripts/modules/task-manager/process-document-hierarchy.js';
import { getConfig } from '../../../scripts/modules/config-manager.js'; // To potentially get default tag

/**
 * Directly calls the processDocumentHierarchy orchestrator.
 * @param {Object} args - Arguments from the MCP tool.
 * @param {Object} args.projectRoot - Absolute path to the project root.
 * @param {string} [args.tag] - Optional tag to process tasks under.
 * @param {boolean} [args.force=false] - Force overwrite.
 * @param {boolean} [args.append=false] - Append to existing tasks.
 * @param {boolean} [args.research=false] - Use research model.
 * @param {Object} mcpLog - MCP logger instance.
 * @param {Object} context - MCP context, may include session.
 * @param {Object} [context.session] - MCP session object.
 * @returns {Promise<Object>} Result of the processing.
 */
export async function processDocsDirect(args, mcpLog, context = {}) {
	const { projectRoot, tag, force, append, research, escalate } = args;
	const session = context.session;

	try {
		mcpLog.info(`Starting hierarchical document processing for project: ${projectRoot}`);
		if (tag) mcpLog.info(`Target tag: ${tag}`);
		if (force) mcpLog.warn('Force mode enabled: Existing tasks in the target tag may be overwritten.');
		if (append) mcpLog.info('Append mode enabled: New tasks will be added to existing tasks in the target tag.');
		if (research) mcpLog.info('Research mode enabled for all document processing stages.');
		if (escalate) mcpLog.info('Priority escalation enabled: Task priorities will be automatically adjusted.');

		// processDocumentHierarchy expects options object
		const options = {
			projectRoot,
			tag, // Will be resolved to default by orchestrator if undefined
			force: force || false,
			append: append || false,
			research: research || false,
			escalate: escalate || false,
			mcpLog, // Pass the MCP logger
			session   // Pass the MCP session
		};

		const result = await processDocumentHierarchy(options);

		// processDocumentHierarchy already returns { success: boolean, message: string, ... }
		if (result.success) {
			mcpLog.success(`Hierarchical document processing completed successfully. ${result.message || ''}`);
		} else {
			// This path might not be hit if processDocumentHierarchy throws on error,
			// but good for softer failures.
			mcpLog.error(`Hierarchical document processing failed. ${result.message || ''}`);
		}
		return result;

	} catch (error) {
		mcpLog.error(`Core error in processDocsDirect: ${error.message}`);
		// Ensure a structured error is returned for handleApiResult
		return { success: false, error: { message: error.message, stack: error.stack, code: error.code || 'PROCESS_DOCS_FAILED' } };
	}
}
