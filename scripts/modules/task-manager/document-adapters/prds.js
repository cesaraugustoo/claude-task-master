/**
 * Product Requirements Document (PRD) Adapter
 * 
 * PRDs typically contain:
 * - Product goals and objectives
 * - Feature requirements
 * - Epic-level planning
 * - Business logic and flows
 * - User stories and acceptance criteria
 */

/**
 * Generate PRD-specific system prompt additions
 * @param {string} documentText - The PRD content
 * @returns {string} Additional system prompt for PRD processing
 */
function getPrePrompt(documentText) {
	// Analyze document for product-specific context
	const hasEpics = /epic|feature|user story|acceptance criteria/i.test(documentText);
	const hasBusinessRules = /business rule|logic|workflow|process/i.test(documentText);
	
	let prompt = `
This is a Product Requirements Document (PRD). Focus on creating tasks that:

TASK GENERATION STRATEGY:
- Break down features into implementable development tasks
- Prioritize user-facing functionality and business value
- Create tasks that map to clear deliverables and milestones
- Focus on feature completion rather than technical implementation details
- Group related functionality into logical development sequences

TASK CHARACTERISTICS FOR PRDs:
- Tasks should represent complete features or significant feature components
- Each task should deliver measurable user value
- Prioritize frontend/user experience tasks higher
- Include clear acceptance criteria and testing strategies
- Consider the full development lifecycle (design → implement → test → deploy)

FIELD USAGE:
- Use 'epicId' field to group related feature tasks under the same epic identifier
- Set appropriate priority levels based on business impact
- Include performance goals if specified in the PRD
- Reference the PRD sections that justify each task`;

	if (hasEpics) {
		prompt += `\n- Pay special attention to epic boundaries and feature groupings mentioned in the document`;
	}

	if (hasBusinessRules) {
		prompt += `\n- Ensure business rules and workflows are captured in task details and test strategies`;
	}

	return prompt;
}

/**
 * Post-process tasks to add PRD-specific fields
 * @param {Array} taskList - Generated tasks array
 * @param {string} documentId - The PRD document identifier
 * @returns {Array} Tasks with PRD-specific fields added
 */
function postProcessTasks(taskList, documentId) {
	if (!Array.isArray(taskList)) {
		return taskList;
	}

	return taskList.map((task, index) => {
		const processedTask = { ...task };

		// Set source document information
		processedTask.sourceDocumentType = 'PRD';
		processedTask.sourceDocumentId = documentId;

		// Generate epic IDs based on task groupings
		// For PRDs, we create epics based on feature boundaries
		const epicId = generateEpicId(task, index, taskList);
		if (epicId) {
			processedTask.epicId = epicId;
		}

		// Add estimation notes based on PRD characteristics
		if (task.description && task.description.length > 200) {
			processedTask.estimationNote = 'Complex feature - consider breaking into smaller tasks';
		} else if (/integration|api|database|backend/i.test(task.title || task.description || '')) {
			processedTask.estimationNote = 'Backend integration required - coordinate with API team';
		} else if (/ui|frontend|design|user interface/i.test(task.title || task.description || '')) {
			processedTask.estimationNote = 'Frontend implementation - ensure design system compliance';
		}

		// Set performance goals for relevant tasks
		if (/performance|speed|load|response time/i.test(task.description || '')) {
			processedTask.performanceGoal = 'Follow application performance standards';
		}

		return processedTask;
	});
}

/**
 * Generate epic ID based on task content and position
 * @param {Object} task - The task object
 * @param {number} index - Task index in the list
 * @param {Array} taskList - Full task list for context
 * @returns {string|null} Epic ID or null
 */
function generateEpicId(task, index, taskList) {
	const taskText = `${task.title || ''} ${task.description || ''}`.toLowerCase();
	
	// Common PRD feature patterns
	if (/auth|login|register|signup|signin/i.test(taskText)) {
		return 'EPIC-AUTH';
	} else if (/user.*profile|profile.*management|account.*settings/i.test(taskText)) {
		return 'EPIC-PROFILE';
	} else if (/dashboard|overview|summary|main.*page/i.test(taskText)) {
		return 'EPIC-DASHBOARD';
	} else if (/search|filter|query|find/i.test(taskText)) {
		return 'EPIC-SEARCH';
	} else if (/notification|alert|message|email/i.test(taskText)) {
		return 'EPIC-NOTIFICATIONS';
	} else if (/payment|billing|subscription|checkout/i.test(taskText)) {
		return 'EPIC-PAYMENTS';
	} else if (/admin|management|settings|configuration/i.test(taskText)) {
		return 'EPIC-ADMIN';
	} else if (/report|analytics|metrics|insights/i.test(taskText)) {
		return 'EPIC-ANALYTICS';
	}

	// For tasks that don't match patterns, group by position
	// Every 3-4 tasks gets a new epic to keep them manageable
	const epicNumber = Math.floor(index / 3) + 1;
	return `EPIC-FEATURE-${epicNumber}`;
}

/**
 * Estimate task count based on PRD content analysis
 * @param {string} documentText - The PRD content
 * @returns {number} Estimated number of tasks
 */
function estimateTaskCount(documentText) {
	if (!documentText || typeof documentText !== 'string') {
		return 5; // Default fallback
	}

	let taskCount = 3; // Minimum base tasks

	// Count feature indicators
	const featureMatches = documentText.match(/(?:feature|functionality|capability|requirement)s?:/gi) || [];
	taskCount += featureMatches.length;

	// Count user stories
	const userStoryMatches = documentText.match(/(?:as a|user story|story|shall|should|must).*(?:so that|in order to)/gi) || [];
	taskCount += Math.floor(userStoryMatches.length * 0.8); // Not all stories = tasks

	// Count sections that typically indicate distinct features
	const sectionMatches = documentText.match(/^#+\s|^##\s|^###\s/gm) || [];
	taskCount += Math.floor(sectionMatches.length * 0.4);

	// Count API/integration mentions (these usually need separate tasks)
	const integrationMatches = documentText.match(/(?:api|integration|endpoint|service|webhook)/gi) || [];
	taskCount += Math.floor(integrationMatches.length * 0.3);

	// Count UI/UX mentions
	const uiMatches = documentText.match(/(?:page|screen|form|button|interface|component)/gi) || [];
	taskCount += Math.floor(uiMatches.length * 0.2);

	// Document length factor
	const wordCount = documentText.split(/\s+/).length;
	if (wordCount > 2000) {
		taskCount += Math.floor((wordCount - 2000) / 500); // Add 1 task per 500 words above 2000
	}

	// Reasonable bounds for PRDs
	return Math.max(3, Math.min(taskCount, 25));
}

export default {
	getPrePrompt,
	postProcessTasks,
	estimateTaskCount
}; 