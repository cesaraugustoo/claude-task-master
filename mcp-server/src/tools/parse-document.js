/**
 * tools/parsePRD.js
 * Tool to parse PRD document and generate tasks
 */

import { z } from 'zod';
import {
	handleApiResult,
	withNormalizedProjectRoot,
	createErrorResponse
} from './utils.js';
import { parseDocumentDirect } from '../core/task-master-core.js';
import {
	TASKMASTER_DOCS_DIR, // No longer used for default input, but might be in descriptions
	TASKMASTER_TASKS_FILE
} from '../../../src/constants/paths.js';

/**
 * Register the parse_document tool
 * @param {Object} server - FastMCP server instance
 */
export function registerParseDocumentTool(server) {
	server.addTool({
		name: 'parse_document',
		description: `Parses a pre-configured document source using its ID to generate tasks. Uses details from the 'documentSources' array in the .taskmaster/config.json file.`,
		parameters: z.object({
			documentId: z
				.string()
				.describe(
					'The ID of the document source (from documentSources in .taskmaster/config.json) to parse.'
				),
			projectRoot: z
				.string()
				.describe('The directory of the project. Must be an absolute path.'),
			output: z
				.string()
				.optional()
				.describe(
					`Output path for tasks.json file (default: ${TASKMASTER_TASKS_FILE})`
				),
			numTasks: z
				.string()
				.optional()
				.describe(
					'Approximate number of top-level tasks to generate (default: 10). As the agent, if you have enough information, ensure to enter a number of tasks that would logically scale with project complexity. Avoid entering numbers above 50 due to context window limitations.'
				),
			force: z
				.boolean()
				.optional()
				.default(false)
				.describe('Overwrite existing output file without prompting.'),
			research: z
				.boolean()
				.optional()
				.describe(
					'Enable Taskmaster to use the research role for potentially more informed task generation. Requires appropriate API key.'
				),
			append: z
				.boolean()
				.optional()
				.describe('Append generated tasks to existing file.')
		}),
		execute: withNormalizedProjectRoot(async (args, { log, session }) => {
			try {
				// Args already contains documentId, projectRoot, etc. as defined in parameters
				const result = await parseDocumentDirect(args, log, { session });
				return handleApiResult(
					result,
					log,
					'Error parsing document', // Updated error message prefix
					undefined,
					args.projectRoot
				);
			} catch (error) {
				log.error(`Error in parse_document: ${error.message}`); // Updated tool name in log
				return createErrorResponse(
					`Failed to parse document: ${error.message}`
				); // Updated error message
			}
		})
	});
}
