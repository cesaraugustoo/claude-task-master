/**
 * Fallback Document Adapter
 * 
 * Used when no specific adapter is found for a document type.
 * Provides generic, sensible defaults for any document type.
 */

/**
 * Generate generic system prompt additions
 * @param {string} documentText - The document content
 * @returns {string} Generic system prompt for document processing
 */
function getPrePrompt(documentText) {
	// Analyze document for general patterns to provide best-effort guidance
	const hasFeatures = /feature|functionality|requirement|capability/i.test(documentText);
	const hasTechnical = /api|database|service|component|architecture/i.test(documentText);
	const hasUI = /ui|interface|screen|page|component|design/i.test(documentText);
	const hasProcess = /workflow|process|procedure|step|guideline/i.test(documentText);
	
	let prompt = `
This document does not match a specific known type, so I'll analyze it generically. Focus on creating tasks that:

TASK GENERATION STRATEGY:
- Break down work into logical, implementable chunks
- Prioritize deliverable outcomes and clear milestones
- Create tasks that represent complete, testable units of work
- Consider dependencies and logical sequencing
- Balance between too granular and too broad

TASK CHARACTERISTICS:
- Each task should have a clear definition of "done"
- Tasks should be implementation-focused rather than purely planning
- Include sufficient detail for developers to understand requirements
- Consider testing and validation strategies
- Aim for tasks that can be completed in reasonable timeframes

FIELD USAGE:
- Use available fields appropriately based on task content
- Set priority based on logical importance and dependencies
- Include estimation notes for complex or uncertain tasks
- Reference source document sections where helpful`;

	if (hasFeatures) {
		prompt += `\n- This appears to contain feature descriptions - focus on user-facing functionality`;
	}

	if (hasTechnical) {
		prompt += `\n- Technical implementation details detected - include appropriate architecture considerations`;
	}

	if (hasUI) {
		prompt += `\n- UI/interface elements mentioned - consider user experience and design implementation`;
	}

	if (hasProcess) {
		prompt += `\n- Process or workflow content detected - break down into actionable implementation steps`;
	}

	return prompt;
}

/**
 * Post-process tasks to add generic document fields
 * @param {Array} taskList - Generated tasks array
 * @param {string} documentId - The document identifier
 * @returns {Array} Tasks with generic fields added
 */
function postProcessTasks(taskList, documentId) {
	if (!Array.isArray(taskList)) {
		return taskList;
	}

	return taskList.map((task, index) => {
		const processedTask = { ...task };

		// Set source document information
		processedTask.sourceDocumentType = 'UNKNOWN';
		processedTask.sourceDocumentId = documentId;

		// Try to infer some basic categorization from task content
		const taskText = `${task.title || ''} ${task.description || ''}`.toLowerCase();

		// Attempt to categorize by content patterns
		if (/ui|interface|screen|page|component|design|frontend/i.test(taskText)) {
			processedTask.layer = 'presentation';
			processedTask.estimationNote = 'UI/Frontend task - verify design requirements and user experience';
		} else if (/api|service|backend|server|database|data/i.test(taskText)) {
			processedTask.layer = 'business';
			processedTask.estimationNote = 'Backend/Service task - ensure proper error handling and testing';
		} else if (/database|data.*layer|storage|persistence/i.test(taskText)) {
			processedTask.layer = 'data';
			processedTask.estimationNote = 'Data layer task - consider data consistency and migration needs';
		} else if (/infrastructure|deployment|docker|kubernetes|ci.*cd/i.test(taskText)) {
			processedTask.layer = 'infra';
			processedTask.estimationNote = 'Infrastructure task - test in non-production environment first';
		}

		// Add basic module inference for service-related tasks
		if (/auth|login|signin|authentication/i.test(taskText)) {
			processedTask.module = 'auth';
		} else if (/user|profile|account/i.test(taskText)) {
			processedTask.module = 'user';
		} else if (/notification|email|message/i.test(taskText)) {
			processedTask.module = 'notification';
		} else if (/search|query/i.test(taskText)) {
			processedTask.module = 'search';
		} else if (/payment|billing/i.test(taskText)) {
			processedTask.module = 'payment';
		}

		// Add generic estimation notes based on complexity indicators
		if (!processedTask.estimationNote) {
			if (task.description && task.description.length > 300) {
				processedTask.estimationNote = 'Complex task - consider breaking into smaller subtasks';
			} else if (/integration|external|third.*party/i.test(taskText)) {
				processedTask.estimationNote = 'External integration - account for API dependencies and error handling';
			} else if (/security|privacy|compliance/i.test(taskText)) {
				processedTask.estimationNote = 'Security-related task - ensure proper review and testing';
			} else if (/performance|optimization|speed/i.test(taskText)) {
				processedTask.estimationNote = 'Performance task - include benchmarking and measurement';
			}
		}

		// Set basic performance goals if performance-related
		if (/performance|speed|fast|optimization/i.test(taskText)) {
			processedTask.performanceGoal = 'Meet standard application performance requirements';
		}

		return processedTask;
	});
}

/**
 * Estimate task count based on generic document content analysis
 * @param {string} documentText - The document content
 * @returns {number} Estimated number of tasks
 */
function estimateTaskCount(documentText) {
	if (!documentText || typeof documentText !== 'string') {
		return 5; // Default fallback
	}

	let taskCount = 3; // Minimum base tasks

	// Count sections/headers (common across many document types)
	const headerMatches = documentText.match(/^#+\s|^##\s|^###\s|^\d+\./gm) || [];
	taskCount += Math.floor(headerMatches.length * 0.5);

	// Count requirement-like patterns
	const requirementMatches = documentText.match(/(?:requirement|must|should|shall|need to|has to)/gi) || [];
	taskCount += Math.floor(requirementMatches.length * 0.3);

	// Count feature/functionality mentions
	const featureMatches = documentText.match(/(?:feature|functionality|capability|function)/gi) || [];
	taskCount += Math.floor(featureMatches.length * 0.4);

	// Count implementation indicators
	const implementMatches = documentText.match(/(?:implement|build|create|develop|code|setup)/gi) || [];
	taskCount += Math.floor(implementMatches.length * 0.2);

	// Count bullet points and lists (often indicate separate items)
	const listMatches = documentText.match(/^[-*+]\s|^\d+\.\s/gm) || [];
	taskCount += Math.floor(listMatches.length * 0.1);

	// Document length factor (generic approach)
	const wordCount = documentText.split(/\s+/).length;
	if (wordCount > 1000) {
		taskCount += Math.floor((wordCount - 1000) / 400); // Add 1 task per 400 words above 1000
	}

	// Reasonable bounds for generic documents
	return Math.max(3, Math.min(taskCount, 20));
}

export default {
	getPrePrompt,
	postProcessTasks,
	estimateTaskCount
}; 