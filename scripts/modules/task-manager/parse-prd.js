import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import boxen from 'boxen';
import { z } from 'zod';

import {
	log,
	writeJSON,
	enableSilentMode,
	disableSilentMode,
	isSilentMode,
	readJSON,
	findTaskById,
	ensureTagMetadata,
	getCurrentTag
} from '../utils.js';

import { generateObjectService } from '../ai-services-unified.js';
import { getDebugFlag } from '../config-manager.js';
import generateTaskFiles from './generate-task-files.js';
import { displayAiUsageSummary } from '../ui.js';

// Define the Zod schema for a SINGLE task object
const prdSingleTaskSchema = z.object({
	id: z.number().int().positive(),
	title: z.string().min(1),
	description: z.string().min(1),
	sourceDocumentId: z.string().min(1),
	sourceDocumentType: z.string().min(1),
	details: z.string().optional().default(''),
	testStrategy: z.string().optional().default(''),
	priority: z.enum(['high', 'medium', 'low']).default('medium'),
	dependencies: z.array(z.number().int().positive()).optional().default([]),
	status: z.string().optional().default('pending')
});

// Define the Zod schema for the ENTIRE expected AI response object
const prdResponseSchema = z.object({
	tasks: z.array(prdSingleTaskSchema),
	metadata: z.object({
		projectName: z.string(),
		totalTasks: z.number(),
		sourceFile: z.string(),
		generatedAt: z.string()
	})
});

/**
 * Parse a document file and generate tasks
 * @param {string} documentPath - Path to the document file
 * @param {string} documentId - Unique ID of the source document
 * @param {string} documentType - Type of the source document (e.g., "PRD", "DESIGN_DOC")
 * @param {string} tasksPath - Path to the tasks.json file
 * @param {number} numTasks - Number of tasks to generate
 * @param {Object} options - Additional options
 * @param {boolean} [options.force=false] - Whether to overwrite existing tasks.json.
 * @param {boolean} [options.append=false] - Append to existing tasks file.
 * @param {boolean} [options.research=false] - Use research model for enhanced PRD analysis.
 * @param {Object} [options.reportProgress] - Function to report progress (optional, likely unused).
 * @param {Object} [options.mcpLog] - MCP logger object (optional).
 * @param {Object} [options.session] - Session object from MCP server (optional).
 * @param {string} [options.projectRoot] - Project root path (for MCP/env fallback).
 * @param {string} [options.tag] - Target tag for task generation.
 * @param {string} [outputFormat='text'] - Output format ('text' or 'json').
 */
async function parseDocumentAndGenerateTasks(documentPath, documentId, documentType, tasksPath, numTasks, options = {}) {
	const {
		// reportProgress, // Not directly used, can be removed if not planned for future
		mcpLog,
		session,
		projectRoot,
		force = false, // When true, current tag's tasks are overwritten by this document's tasks
		append = false, // When true, tasks from this document are added to existing tasks in the tag
		research = false,
		tag,
		parentTasksContext = [], // New: Tasks from parent document
		currentTaskStartId = 1  // New: Starting ID for tasks from this document
	} = options;

	const isMCP = !!mcpLog;
	const outputFormat = isMCP ? 'json' : 'text'; // Retained for potential CLI direct call

	const targetTag = tag || getCurrentTag(projectRoot) || 'master';

	const logFn = mcpLog || {
		info: (...args) => log('info', ...args),
		warn: (...args) => log('warn', ...args),
		error: (...args) => log('error', ...args),
		debug: (...args) => log('debug', ...args),
		success: (...args) => log('success', ...args),
	};

	const report = (message, level = 'info') => {
		if (logFn && typeof logFn[level] === 'function') {
			logFn[level](message);
		} else if (!isSilentMode() && outputFormat === 'text') {
			log(level, message);
		}
	};

	report(
		`Parsing document: ${documentPath} (DocID: ${documentId}, Type: ${documentType}) for Tag: '${targetTag}'. StartID: ${currentTaskStartId}, Force: ${force}, Append: ${append}, Research: ${research}, ParentTasks: ${parentTasksContext.length}`,
		'info'
	);

	let existingTasksInTag = []; // Tasks already in tasks.json for the targetTag
	let nextIdForThisDocument = currentTaskStartId; // AI will be instructed to use IDs from this number
	let aiServiceResponse = null;

	try {
		// Load existing tasks for the targetTag if tasks.json exists
		if (fs.existsSync(tasksPath)) {
			try {
				const allData = readJSON(tasksPath) || {}; // Ensure readJSON handles empty/invalid JSON gracefully
				if (allData[targetTag] && Array.isArray(allData[targetTag].tasks)) {
					existingTasksInTag = allData[targetTag].tasks;
					if (!force && !append && existingTasksInTag.length > 0) {
						// This case should ideally be caught by the orchestrator.
						// If called directly and tasks exist without force/append, it's an issue.
						const directCallError = new Error(
							`Tag '${targetTag}' already contains ${existingTasksInTag.length} tasks. Use --force to overwrite or --append. (parseDocumentAndGenerateTasks)`
						);
						report(directCallError.message, 'error');
						if (outputFormat === 'text') {
							console.error(chalk.red(directCallError.message));
							process.exit(1); // Exit if called directly from CLI in a conflicting way
						}
						throw directCallError; // Throw for programmatic use
					}
					if (append) {
						// If appending, nextIdForThisDocument should still be currentTaskStartId,
						// as determined by the orchestrator. existingTasksInTag is just for context and final merge.
						report(`Append mode: ${existingTasksInTag.length} tasks already in tag '${targetTag}'. New tasks will start from ID ${nextIdForThisDocument}.`, 'info');
					}
				}
			} catch (error) {
				report(`Error reading or parsing existing tasks from ${tasksPath} for tag '${targetTag}': ${error.message}. Proceeding as if tag is empty or will be overwritten.`, 'warn');
				existingTasksInTag = []; // Reset on error to be safe
			}
		}

		if (force) {
			report(`Force mode: Tag '${targetTag}' will be overwritten with tasks from this document. ${existingTasksInTag.length} existing tasks will be replaced.`, 'info');
			existingTasksInTag = []; // Effectively start fresh for this tag for this document processing.
			// nextIdForThisDocument is already currentTaskStartId, which should be 1 if orchestrator handles force correctly.
		}
		// Stray '}' was here, removed. The 'else' below correctly pairs with 'if (fs.existsSync(tasksPath))'
		} else {
			// No existing tasks in target tag, proceed without confirmation
			report(
				`Tag '${targetTag}' is empty or doesn't exist. Creating/updating tag with new tasks.`,
				'info'
			);
		}

		report(`Reading content from ${documentPath}`, 'info');
		const documentContent = fs.readFileSync(documentPath, 'utf8');
		if (!documentContent) {
			throw new Error(`Input file ${documentPath} is empty or could not be read.`);
		}

		report(`Reading content from ${documentPath}`, 'info');
		const documentContent = fs.readFileSync(documentPath, 'utf8');
		if (!documentContent) {
			throw new Error(`Input file ${documentPath} is empty or could not be read.`);
		}

		let parentContextInfo = '';
		if (parentTasksContext && parentTasksContext.length > 0) {
			parentContextInfo = `
This document (type: ${documentType}, ID: ${documentId}) is a child of a preceding document. Tasks generated from this document may depend on the following tasks from its parent context:
${parentTasksContext.map(pt => `- ID: ${pt.id}, Title: ${pt.title}, Description: ${pt.description.substring(0,100)}... (from parent doc: ${pt.sourceDocumentId})`).join('\n')}
When defining dependencies for the new tasks you generate below, you can reference these parent task IDs.
Ensure that any dependencies on these parent tasks are valid (i.e., the parent task ID exists in this list).`;
		}

		const researchPromptAddition = research
			? `\nBefore breaking down the document into tasks, you will:
1. Research and analyze the latest technologies, libraries, frameworks, and best practices that would be appropriate for this project based on the document.
2. Identify any potential technical challenges, security concerns, or scalability issues not explicitly mentioned in the document.
3. Consider current industry standards and evolving trends relevant to this project.
Your task breakdown should incorporate this research, resulting in more detailed implementation guidance and technology recommendations.`
			: '';

		const systemPrompt = `You are an AI assistant specialized in analyzing documents (such as ${documentType}) and generating a structured, logically ordered, dependency-aware list of development tasks in JSON format.${researchPromptAddition}
${parentContextInfo}

Analyze the provided document content and generate approximately ${numTasks} top-level development tasks.
Each task should represent a logical unit of work. Include implementation details and a test strategy for each task.
Assign sequential IDs to the tasks you generate, starting from ${nextIdForThisDocument}.
For each task, YOU MUST include "sourceDocumentId": "${documentId}" and "sourceDocumentType": "${documentType}".
Set status to 'pending', and priority to 'medium' initially.
Dependencies can be on other tasks you generate (with IDs >= ${nextIdForThisDocument}) or on tasks from the parent context (IDs < ${nextIdForThisDocument}, listed above if provided).

Respond ONLY with a valid JSON object containing a single key "tasks", where the value is an array of task objects. Each task object must adhere to this Zod schema:
{
	"id": number, // Starting from ${nextIdForThisDocument}
	"title": string,
	"description": string,
	"sourceDocumentId": "${documentId}", // Fixed for this document
	"sourceDocumentType": "${documentType}", // Fixed for this document
	"status": "pending",
	"dependencies": number[], // IDs of tasks this depends on (can be parent tasks or tasks from this doc)
	"priority": "high" | "medium" | "low",
	"details": string,
	"testStrategy": string
}

Guidelines:
1. Create approximately ${numTasks} tasks, numbered sequentially starting from ID ${nextIdForThisDocument}.
2. Ensure logical order and appropriate dependencies, including potential dependencies on parent tasks listed in the context.
3. Adhere strictly to any specific requirements (libraries, tech stacks) mentioned in the document.
4. Focus on providing a direct path to implementation, avoiding over-engineering.
5. If parent tasks are provided, make sure any specified dependencies on them are valid.
Example of a task depending on a parent task (ID 5) and a new task (ID ${nextIdForThisDocument + 1}): "dependencies": [5, ${nextIdForThisDocument + 1}]`;

		const userPrompt = `Document content (Type: ${documentType}, ID: ${documentId}):\n\n${documentContent}\n\n
Generate tasks based on this document, starting task IDs from ${nextIdForThisDocument}.
${parentTasksContext.length > 0 ? 'Remember to consider the parent tasks provided in the system prompt for context and potential dependencies.' : ''}
Return your response in the specified JSON format:
{
    "tasks": [
        {
            "id": ${nextIdForThisDocument},
            "title": "Example Task Title",
            "description": "...",
            "sourceDocumentId": "${documentId}",
            "sourceDocumentType": "${documentType}",
            "status": "pending",
            "dependencies": [],
            "priority": "medium",
            "details": "...",
            "testStrategy": "..."
        }
        // ... more tasks
    ],
    "metadata": { // This metadata block is for your internal use if needed, but the final output must be just the tasks array under "tasks" key as per schema.
        "projectName": "Document Implementation", // Example, not strictly part of Zod schema for tasks list
        "totalTasks": ${numTasks}, // Example
        "sourceFile": "${documentPath}", // Example
        "generatedAt": "YYYY-MM-DD" // Example
    }
}`;
		report(
			`Calling AI service to generate tasks for document ${documentId} (type ${documentType}), starting ID ${nextIdForThisDocument}${research ? ' with research' : ''}...`,
			'info'
		);

		aiServiceResponse = await generateObjectService({
			role: research ? 'research' : 'main',
			session: session,
			projectRoot: projectRoot,
			schema: prdResponseSchema, // Zod schema for the expected { tasks: [], metadata: {} } structure
			objectName: 'tasks_data',
			systemPrompt: systemPrompt,
			prompt: userPrompt,
			commandName: 'parse-document-hierarchical',
			outputType: isMCP ? 'mcp' : 'cli'
		});

		const tasksDir = path.dirname(tasksPath);
		if (!fs.existsSync(tasksDir)) {
			fs.mkdirSync(tasksDir, { recursive: true });
		}
		logFn.success(
			`AI service call successful for document ${documentId}. Processing generated tasks...`
		);

		let generatedData = null;
		if (aiServiceResponse?.mainResult) {
			if (typeof aiServiceResponse.mainResult === 'object' && aiServiceResponse.mainResult !== null && 'tasks' in aiServiceResponse.mainResult) {
				generatedData = aiServiceResponse.mainResult;
			} else if (typeof aiServiceResponse.mainResult.object === 'object' &&	aiServiceResponse.mainResult.object !== null && 'tasks' in aiServiceResponse.mainResult.object) {
				generatedData = aiServiceResponse.mainResult.object;
			}
		}

		if (!generatedData || !Array.isArray(generatedData.tasks)) {
			logFn.error(`AI service returned unexpected data structure for doc ${documentId}: ${JSON.stringify(generatedData)}`);
			throw new Error('AI service returned unexpected data structure after validation by generateObjectService.');
		}

		// Ensure sourceDocumentId and sourceDocumentType are correctly set from function params, overriding AI.
		// Also, AI might not correctly start IDs, so we remap them.
		let currentIdForRemapping = nextIdForThisDocument;
		const taskAiIdToNewIdMap = new Map();

		const processedNewTasks = generatedData.tasks.map((task) => {
			const originalAiTaskId = task.id; // ID assigned by AI
			const newSequentialId = currentIdForRemapping++;
			taskAiIdToNewIdMap.set(originalAiTaskId, newSequentialId);

			return {
				...task,
				id: newSequentialId, // Enforce sequential ID starting from nextIdForThisDocument
				sourceDocumentId: documentId, // Enforce correct source document ID
				sourceDocumentType: documentType, // Enforce correct source document type
				status: task.status || 'pending',
				priority: task.priority || 'medium',
				dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
				subtasks: [] // Initialize subtasks
			};
		});

		// Remap dependencies for the NEWLY processed tasks
		// Dependencies can be:
		// 1. To other new tasks (remapped from AI ID to newSequentialId)
		// 2. To parent tasks (original IDs from parentTasksContext, should be < nextIdForThisDocument)
		// 3. To existing tasks in the tag (original IDs from existingTasksInTag, should be < nextIdForThisDocument)
		processedNewTasks.forEach((task) => {
			task.dependencies = (task.dependencies || [])
				.map(depId => {
					// If depId was an AI-assigned ID for a task in *this* batch, remap it.
					if (taskAiIdToNewIdMap.has(depId)) {
						return taskAiIdToNewIdMap.get(depId);
					}
					// Otherwise, assume it's an ID from parent context or existing tasks.
					return depId;
				})
				.filter(depId => {
					if (depId == null) return false;
					// Check if dependency is valid:
					// Is it one of the parent tasks?
					const isParentTask = parentTasksContext.some(pt => pt.id === depId);
					// Is it one of the existing tasks in the tag (and not a future ID from this batch)?
					const isExistingTask = existingTasksInTag.some(et => et.id === depId);
					// Is it another new task from this document (must have a lower ID)?
					const isNewSiblingTask = processedNewTasks.some(nt => nt.id === depId && nt.id < task.id);

					const isValid = isParentTask || isExistingTask || isNewSiblingTask;
					if (!isValid) {
						logFn.warn(`Task ${task.id} ('${task.title}') from doc ${documentId} has an invalid dependency ID: ${depId}. This dependency will be removed.`);
					}
					return isValid;
				});
		});

		// Combine tasks:
		// If 'force' was true, existingTasksInTag is already empty.
		// 'finalTasksForTag' will contain the tasks for the current tag after this document's processing.
		const finalTasksForTag = append ? [...existingTasksInTag, ...processedNewTasks] :
		                       (force ? processedNewTasks : [...existingTasksInTag, ...processedNewTasks]);


		let allTagsData = {};
		if (fs.existsSync(tasksPath)) {
			try {
				allTagsData = readJSON(tasksPath) || {};
			} catch (error) {
				report(`Could not read existing tasks.json to preserve other tags: ${error.message}. Other tags might be lost if this is the first write.`, 'warn');
				allTagsData = {};
			}
		}

		allTagsData[targetTag] = {
			tasks: finalTasksForTag,
			metadata: {
				created: allTagsData[targetTag]?.metadata?.created || new Date().toISOString(),
				updated: new Date().toISOString(),
				description: `Tasks for ${targetTag} context`
			}
		};
		ensureTagMetadata(allTagsData[targetTag], { description: `Tasks for ${targetTag} context` });

		fs.writeFileSync(tasksPath, JSON.stringify(allTagsData, null, 2));
		report(
			`Successfully ${force ? 'overwritten' : (append ? 'appended' : 'updated')} ${processedNewTasks.length} tasks for document ${documentId} in tag '${targetTag}'. Total tasks in tag: ${finalTasksForTag.length}.`,
			'success'
		);

		if (outputFormat === 'text' && !isMCP) { // Only for direct CLI calls
			console.log(
				boxen(
					chalk.green(
						`Generated ${processedNewTasks.length} new tasks for doc ${documentId}. Total in tag '${targetTag}': ${finalTasksForTag.length}`
					),
					{ padding: 1, borderColor: 'green', borderStyle: 'round' }
				)
			);
			if (aiServiceResponse && aiServiceResponse.telemetryData) {
				displayAiUsageSummary(aiServiceResponse.telemetryData, 'cli');
			}
		}

		return {
			success: true,
			generatedTasks: processedNewTasks, // Only tasks generated from THIS document
			nextTaskId: currentIdForRemapping, // The next available ID for the subsequent document or run
			telemetryData: aiServiceResponse?.telemetryData,
			tagInfo: aiServiceResponse?.tagInfo // If your AI service provides this
		};
	} catch (error) {
		report(`Error parsing document (${documentType}): ${error.message}`, 'error');

		// Only show error UI for text output (CLI)
		if (outputFormat === 'text') {
			console.error(chalk.red(`Error: ${error.message}`));

			if (getDebugFlag(projectRoot)) {
				// Use projectRoot for debug flag check
				console.error(error);
			}

			process.exit(1);
		} else {
			throw error; // Re-throw for JSON output
		}
	}
}

export default parseDocumentAndGenerateTasks;
