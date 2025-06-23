import { mergeTasksInTag } from '../../../../../scripts/modules/task-manager/merge-tasks.js';
import { readJSON, writeJSON, getCurrentTag } from '../../../../../scripts/modules/utils.js';
import { createLogWrapper } from '../../tools/utils.js';
import path from 'path';
import fs from 'fs';

/**
 * Direct function for merging duplicate tasks in a tag context
 * @param {Object} args - Arguments
 * @param {Function} log - Logging function
 * @param {Object} context - Context object with session info
 * @returns {Object} Result object
 */
export async function mergeTasksDirect(args, log, context = {}) {
  const { session } = context;
  const mcpLog = createLogWrapper(log);

  try {
    const {
      projectRoot,
      tag,
      similarityThreshold = 0.85,
      useLLM = false,
      escalate = false,
      dryRun = false,
      outputFile,
      file = '.taskmaster/tasks/tasks.json'
    } = args;

    // Validate required arguments
    if (!projectRoot) {
      throw new Error('projectRoot is required');
    }

    const tasksPath = path.resolve(projectRoot, file);

    // Check if tasks file exists
    if (!fs.existsSync(tasksPath)) {
      throw new Error(`Tasks file not found at path: ${tasksPath}`);
    }

    mcpLog.info(`Loading tasks from: ${tasksPath}`);

    // Load tasks data
    const tasksData = await readJSON(tasksPath);
    
    // Get target tag
    const targetTag = tag || getCurrentTag(tasksData);
    
    if (!tasksData[targetTag]) {
      throw new Error(`Tag '${targetTag}' not found in tasks file`);
    }

    const tasks = tasksData[targetTag].tasks || [];
    
    if (tasks.length === 0) {
      return {
        success: true,
        data: {
          message: `No tasks found in tag '${targetTag}' to merge`,
          mergeReport: {
            originalCount: 0,
            finalCount: 0,
            mergedGroups: [],
            strategy: {
              hashMatches: 0,
              semanticMatches: 0,
              llmDecisions: 0
            }
          },
          telemetryData: null
        }
      };
    }

    mcpLog.info(`Analyzing ${tasks.length} tasks in tag '${targetTag}' for duplicates`);

    // Set up merge options
    const mergeOptions = {
      similarityThreshold: parseFloat(similarityThreshold),
      useLLM: Boolean(useLLM),
      escalate: Boolean(escalate),
      preserveOriginalIds: true,
      context: {
        session,
        mcpLog,
        projectRoot,
        commandName: 'mcp_merge_tasks',
        outputType: 'mcp',
        tagName: targetTag
      },
      outputFormat: 'json'
    };

    // Perform the merge analysis
    const result = await mergeTasksInTag(tasks, mergeOptions);
    const { mergedTasks, mergeReport, telemetryData } = result;

    // If dry run, just return the analysis
    if (dryRun) {
      return {
        success: true,
        data: {
          dryRun: true,
          originalTasks: tasks,
          mergedTasks,
          mergeReport,
          telemetryData
        }
      };
    }

    // Apply changes if not dry run
    const outputPath = outputFile 
      ? path.resolve(projectRoot, outputFile) 
      : tasksPath;
    
    // Update the tasks data
    tasksData[targetTag].tasks = mergedTasks;
    
    // Save to file
    await writeJSON(outputPath, tasksData);
    
    mcpLog.success(`Tasks merged successfully in tag '${targetTag}'`);

    return {
      success: true,
      data: {
        originalCount: mergeReport.originalCount,
        finalCount: mergeReport.finalCount,
        mergedCount: mergeReport.originalCount - mergeReport.finalCount,
        targetTag,
        outputPath,
        preservedOriginal: Boolean(outputFile),
        mergeReport,
        telemetryData
      }
    };

  } catch (error) {
    mcpLog.error(`Error merging tasks: ${error.message}`);
    return {
      success: false,
      error: {
        message: error.message,
        code: 'MERGE_TASKS_ERROR',
        details: error.stack
      }
    };
  }
} 