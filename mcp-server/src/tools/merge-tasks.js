import { z } from 'zod';
import { mergeTasksDirect } from '../core/task-master-core.js';
import { handleApiResult, withNormalizedProjectRoot } from './utils.js';

/**
 * Register the merge-tasks tool with the MCP server
 * @param {Object} server - MCP server instance
 */
export function registerMergeTasksTool(server) {
  const argsSchema = z.object({
    projectRoot: z.string().describe('Absolute path to the project root directory'),
    tag: z.string().optional().describe('Specify which tag context to merge tasks in (defaults to current active tag)'),
    similarityThreshold: z.number().min(0).max(1).optional().describe('Set similarity threshold for semantic merging (0-1, default: 0.85)'),
    useLLM: z.boolean().optional().describe('Use LLM for borderline merge decisions (requires appropriate API key)'),
    escalate: z.boolean().optional().describe('Apply priority escalation rules after merging tasks'),
    dryRun: z.boolean().optional().describe('Preview changes without making modifications to the tasks file'),
    outputFile: z.string().optional().describe('Save merged results to a different file (preserves original)'),
    file: z.string().optional().describe('Path to the tasks file (default: .taskmaster/tasks/tasks.json)')
  });

  server.addTool({
    name: 'merge_tasks',
    description: 'Merge duplicate or similar tasks within a tag context. Automatically detects and consolidates duplicate tasks using hash matching, semantic similarity, and optional LLM analysis.',
    parameters: {
      type: 'object',
      properties: {
        projectRoot: {
          type: 'string',
          description: 'Absolute path to the project root directory'
        },
        tag: {
          type: 'string',
          description: 'Specify which tag context to merge tasks in (defaults to current active tag)'
        },
        similarityThreshold: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Set similarity threshold for semantic merging (0-1, default: 0.85)'
        },
        useLLM: {
          type: 'boolean',
          description: 'Use LLM for borderline merge decisions (requires appropriate API key)'
        },
        escalate: {
          type: 'boolean',
          description: 'Apply priority escalation rules after merging tasks'
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview changes without making modifications to the tasks file'
        },
        outputFile: {
          type: 'string',
          description: 'Save merged results to a different file (preserves original)'
        },
        file: {
          type: 'string',
          description: 'Path to the tasks file (default: .taskmaster/tasks/tasks.json)'
        }
      },
      required: ['projectRoot'],
      additionalProperties: false
    },
    execute: withNormalizedProjectRoot(async (args, { log, session }) => {
      try {
        // Validate arguments using Zod schema
        const validatedArgs = argsSchema.parse(args);

        // Call the direct function
        const result = await mergeTasksDirect(validatedArgs, log, { session });

        // Handle the result using the utility function
        return handleApiResult(result, log);
      } catch (error) {
        if (error instanceof z.ZodError) {
          log('error', 'Invalid arguments provided to merge_tasks tool', {
            errors: error.errors,
            receivedArgs: args
          });
          return {
            success: false,
            error: `Invalid arguments: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
          };
        }

        log('error', 'Error in merge_tasks tool execution', {
          error: error.message,
          stack: error.stack
        });

        return {
          success: false,
          error: `Tool execution failed: ${error.message}`
        };
      }
    })
  });
} 