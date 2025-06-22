/**
 * tools/process-docs.js
 * MCP Tool to process all configured document sources hierarchically.
 */

import { z } from 'zod';
import {
	handleApiResult,
	withNormalizedProjectRoot,
	createErrorResponse
} from './utils.js'; // Assuming utils.js is in the same directory
import { processDocsDirect } from '../core/task-master-core.js'; // This function will need to be created in task-master-core.js

/**
 * Register the process_docs tool
 * @param {Object} server - FastMCP server instance
 */
export function registerProcessDocsTool(server) {
	server.addTool({
		name: 'process_docs',
		description: `Processes all document sources configured in '.taskmaster/config.json' hierarchically to generate or update tasks. This is useful for a full project task generation based on PRDs, SDDs, etc.`,
		parameters: z.object({
			projectRoot: z
				.string()
				.describe('The directory of the project. Must be an absolute path.'),
			tag: z
				.string()
				.optional()
				.describe('Specify tag context for task operations. If not provided, the current active tag or "master" will be used.'),
			force: z
				.boolean()
				.optional()
				.default(false)
				.describe('If true, overwrites existing tasks in the target tag for the entire hierarchy processing. Use with caution.'),
			append: z
				.boolean()
				.optional()
				.default(false)
				.describe('If true, appends new tasks to existing tasks in the target tag. Cannot be used with --force.'),
			research: z
				.boolean()
				.optional()
				.default(false)
				.describe('If true, enables the research model for potentially more informed task generation across all documents.')
		}),
		execute: withNormalizedProjectRoot(async (args, { log, session }) => {
			try {
				if (args.force && args.append) {
					return createErrorResponse('Cannot use --force and --append simultaneously.');
				}

				// processDocsDirect will call processDocumentHierarchy
				const result = await processDocsDirect(args, log, { session });

				return handleApiResult(
					result,
					log,
					'Error processing document hierarchy',
					undefined, // No specific file path to return like in single parse
					args.projectRoot
				);
			} catch (error) {
				log.error(`Error in process_docs tool: ${error.message}`);
				return createErrorResponse(
					`Failed to process document hierarchy: ${error.message}`
				);
			}
		})
	});
}
