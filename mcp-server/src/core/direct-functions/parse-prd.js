/**
 * parse-prd.js
 * Direct function implementation for parsing PRD documents
 */

import path from 'path';
import fs from 'fs';
import { parseDocumentAndGenerateTasks } from '../../../../scripts/modules/task-manager.js';
import {
	enableSilentMode,
	disableSilentMode,
	isSilentMode
} from '../../../../scripts/modules/utils.js';
import { createLogWrapper } from '../../tools/utils.js';
import {
	getDefaultNumTasks,
	getDocumentSources,
	getConfig
} from '../../../../scripts/modules/config-manager.js';
import { resolveProjectPath } from '../utils/path-utils.js'; // resolvePrdPath removed
import { TASKMASTER_TASKS_FILE } from '../../../../src/constants/paths.js';

/**
 * Direct function wrapper for parsing documents and generating tasks.
 *
 * @param {Object} args - Command arguments containing projectRoot, documentId, output, numTasks options.
 * @param {Object} log - Logger object.
 * @param {Object} context - Context object containing session data.
 * @returns {Promise<Object>} - Result object with success status and data/error information.
 */
export async function parseDocumentDirect(args, log, context = {}) {
	const { session } = context;
	// Extract projectRoot from args
	const {
		documentId, // Changed from input
		output: outputArg,
		numTasks: numTasksArg,
		force,
		append,
		research,
		projectRoot
	} = args;

	// Create the standard logger wrapper
	const logWrapper = createLogWrapper(log);

	// --- Input Validation and Path Resolution ---
	if (!projectRoot) {
		logWrapper.error('parseDocumentDirect requires a projectRoot argument.');
		return {
			success: false,
			error: {
				code: 'MISSING_ARGUMENT',
				message: 'projectRoot is required.'
			}
		};
	}

	if (!documentId) {
		logWrapper.error('parseDocumentDirect called without documentId');
		return {
			success: false,
			error: { code: 'MISSING_ARGUMENT', message: 'documentId is required.' }
		};
	}

	// Load configuration and document sources
	getConfig(projectRoot); // Ensure config is loaded for getDocumentSources
	const documentSources = getDocumentSources(projectRoot);
	const documentSource = documentSources.find(ds => ds.id === documentId);

	if (!documentSource) {
		logWrapper.error(`Document source with ID '${documentId}' not found in configuration.`);
		return {
			success: false,
			error: {
				code: 'DOCUMENT_NOT_FOUND',
				message: `Document source with ID '${documentId}' not found in configuration.`
			}
		};
	}

	const documentPath = path.isAbsolute(documentSource.path)
		? documentSource.path
		: path.resolve(projectRoot, documentSource.path);
	const documentType = documentSource.type;


	// Resolve output path - use new path utilities for default
	const outputPath = outputArg
		? path.isAbsolute(outputArg)
			? outputArg
			: path.resolve(projectRoot, outputArg)
		: resolveProjectPath(TASKMASTER_TASKS_FILE, args) ||
			path.resolve(projectRoot, TASKMASTER_TASKS_FILE);

	// Check if document file exists
	if (!fs.existsSync(documentPath)) {
		const errorMsg = `Input document file not found at resolved path: ${documentPath}`;
		logWrapper.error(errorMsg);
		return {
			success: false,
			error: { code: 'FILE_NOT_FOUND', message: errorMsg }
		};
	}

	const outputDir = path.dirname(outputPath);
	try {
		if (!fs.existsSync(outputDir)) {
			logWrapper.info(`Creating output directory: ${outputDir}`);
			fs.mkdirSync(outputDir, { recursive: true });
		}
	} catch (error) {
		const errorMsg = `Failed to create output directory ${outputDir}: ${error.message}`;
		logWrapper.error(errorMsg);
		return {
			success: false,
			error: { code: 'DIRECTORY_CREATE_FAILED', message: errorMsg }
		};
	}

	let numTasks = getDefaultNumTasks(projectRoot);
	if (numTasksArg) {
		numTasks =
			typeof numTasksArg === 'string' ? parseInt(numTasksArg, 10) : numTasksArg;
		if (Number.isNaN(numTasks) || numTasks <= 0) {
			// Ensure positive number
			numTasks = getDefaultNumTasks(projectRoot); // Fallback to default if parsing fails or invalid
			logWrapper.warn(
				`Invalid numTasks value: ${numTasksArg}. Using default: ${numTasks}`
			);
		}
	}

	if (append) {
		logWrapper.info('Append mode enabled.');
		if (force) {
			logWrapper.warn(
				'Both --force and --append flags were provided. --force takes precedence; append mode will be ignored.'
			);
		}
	}

	if (research) {
		logWrapper.info(
			'Research mode enabled. Using Perplexity AI for enhanced PRD analysis.'
		);
	}

	logWrapper.info(
		`Parsing document via direct function. Document ID: ${documentId}, Type: ${documentType}, Path: ${documentPath}, Output: ${outputPath}, NumTasks: ${numTasks}, Force: ${force}, Append: ${append}, Research: ${research}, ProjectRoot: ${projectRoot}`
	);

	const wasSilent = isSilentMode();
	if (!wasSilent) {
		enableSilentMode();
	}

	try {
		// Call the core parseDocumentAndGenerateTasks function
		const result = await parseDocumentAndGenerateTasks(
			documentPath,
			documentId,
			documentType,
			outputPath,
			numTasks,
			{
				session,
				mcpLog: logWrapper,
				projectRoot,
				force,
				append,
				research,
				commandName: 'parse-document', // Updated command name
				outputType: 'mcp'
			},
			'json'
		);

		// Adjust check for the new return structure
		if (result && result.success) {
			const successMsg = `Successfully parsed document and generated tasks in ${result.tasksPath}`;
			logWrapper.success(successMsg);
			return {
				success: true,
				data: {
					message: successMsg,
					outputPath: result.tasksPath,
					telemetryData: result.telemetryData,
					tagInfo: result.tagInfo
				}
			};
		} else {
			// Handle case where core function didn't return expected success structure
			logWrapper.error(
				'Core parseDocumentAndGenerateTasks function did not return a successful structure.'
			);
			return {
				success: false,
				error: {
					code: 'CORE_FUNCTION_ERROR',
					message:
						result?.message ||
						'Core function failed to parse document or returned unexpected result.'
				}
			};
		}
	} catch (error) {
		logWrapper.error(`Error executing core parseDocumentAndGenerateTasks: ${error.message}`);
		return {
			success: false,
			error: {
				code: 'PARSE_DOCUMENT_CORE_ERROR',
				message: error.message || 'Unknown error parsing document'
			}
		};
	} finally {
		if (!wasSilent && isSilentMode()) {
			disableSilentMode();
		}
	}
}
