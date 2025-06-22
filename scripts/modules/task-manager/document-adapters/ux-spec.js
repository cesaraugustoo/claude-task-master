/**
 * UX/Design Specification Adapter
 * 
 * UX Specs typically contain:
 * - Screen layouts and wireframes
 * - Component specifications
 * - User interaction flows
 * - Design system references
 * - Responsive behavior definitions
 * - Accessibility requirements
 */

/**
 * Generate UX-specific system prompt additions
 * @param {string} documentText - The UX spec content
 * @returns {string} Additional system prompt for UX spec processing
 */
function getPrePrompt(documentText) {
	// Analyze document for UX-specific context
	const hasScreens = /screen|page|view|layout|wireframe/i.test(documentText);
	const hasComponents = /component|widget|element|control|button|form|input/i.test(documentText);
	const hasInteractions = /click|hover|tap|scroll|swipe|gesture|animation|transition/i.test(documentText);
	const hasResponsive = /responsive|mobile|tablet|desktop|breakpoint|viewport/i.test(documentText);
	const hasAccessibility = /accessibility|a11y|screen reader|keyboard|aria|wcag/i.test(documentText);
	
	let prompt = `
This is a UX/Design Specification document. Focus on creating tasks that:

TASK GENERATION STRATEGY:
- Break down UI implementation by screens and components
- Prioritize user-facing interface elements and interactions
- Create tasks that represent complete UI features or components
- Focus on component reusability and design system consistency
- Consider responsive behavior and cross-device compatibility
- Include accessibility implementation from the start

TASK CHARACTERISTICS FOR UX SPECS:
- Tasks should represent complete UI components or screen implementations
- Each task should result in functional, interactive UI elements
- Prioritize component-based architecture
- Include clear visual and interaction specifications
- Consider the design-to-code workflow (design → component → integrate → test)
- Address responsive behavior and accessibility in implementation tasks

FIELD USAGE:
- Use 'screen' field to indicate which page/view the task belongs to
- Use 'component' field for reusable UI component tasks
- Use 'viewport' field to specify responsive breakpoint requirements
- Use 'designToken' field to reference design system tokens (colors, spacing, typography)
- Set appropriate priority based on user journey importance`;

	if (hasScreens) {
		prompt += `\n- Pay special attention to screen boundaries and page-level implementations mentioned in the document`;
	}

	if (hasComponents) {
		prompt += `\n- Focus on creating reusable components that can be shared across screens`;
	}

	if (hasInteractions) {
		prompt += `\n- Ensure interactive behaviors and animations are captured in task details`;
	}

	if (hasResponsive) {
		prompt += `\n- Include responsive design requirements and breakpoint considerations in tasks`;
	}

	if (hasAccessibility) {
		prompt += `\n- Ensure accessibility requirements (ARIA, keyboard navigation, screen readers) are included in all UI tasks`;
	}

	return prompt;
}

/**
 * Post-process tasks to add UX-specific fields
 * @param {Array} taskList - Generated tasks array
 * @param {string} documentId - The UX spec document identifier
 * @returns {Array} Tasks with UX-specific fields added
 */
function postProcessTasks(taskList, documentId) {
	if (!Array.isArray(taskList)) {
		return taskList;
	}

	return taskList.map((task, index) => {
		const processedTask = { ...task };

		// Set source document information
		processedTask.sourceDocumentType = 'UX_SPEC';
		processedTask.sourceDocumentId = documentId;

		// Extract screen information from task content
		const screen = extractScreenInfo(task);
		if (screen) {
			processedTask.screen = screen;
		}

		// Extract component information
		const component = extractComponentInfo(task);
		if (component) {
			processedTask.component = component;
		}

		// Determine viewport requirements
		const viewport = determineViewport(task);
		if (viewport) {
			processedTask.viewport = viewport;
		}

		// Add design token references
		const designToken = extractDesignTokens(task);
		if (designToken) {
			processedTask.designToken = designToken;
		}

		// Set layer for UI tasks
		processedTask.layer = 'presentation';

		// Add UX-specific estimation notes
		if (/animation|transition|micro.*interaction/i.test(task.title || task.description || '')) {
			processedTask.estimationNote = 'Complex interactions - allow extra time for animation implementation and testing';
		} else if (/responsive|mobile.*first|breakpoint/i.test(task.title || task.description || '')) {
			processedTask.estimationNote = 'Responsive implementation - test across all target devices';
		} else if (/accessibility|a11y|screen.*reader/i.test(task.title || task.description || '')) {
			processedTask.estimationNote = 'Accessibility requirements - ensure WCAG compliance and screen reader testing';
		} else if (/component|reusable/i.test(task.title || task.description || '')) {
			processedTask.estimationNote = 'Reusable component - design for flexibility and multiple use cases';
		}

		// Set performance goals for UI tasks
		if (/performance|load|render|paint/i.test(task.description || '')) {
			processedTask.performanceGoal = 'UI load time < 1s, smooth 60fps animations';
		} else {
			processedTask.performanceGoal = 'Smooth UI interactions, responsive feel';
		}

		return processedTask;
	});
}

/**
 * Extract screen/page information from task content
 * @param {Object} task - The task object
 * @returns {string|null} Screen name or null
 */
function extractScreenInfo(task) {
	const taskText = `${task.title || ''} ${task.description || ''}`.toLowerCase();
	
	// Look for screen/page patterns
	const screenMatches = taskText.match(/(?:screen|page|view).*?(?:for|of|called)?\s*([a-z][a-z0-9\s]*)/i);
	if (screenMatches && screenMatches[1]) {
		return toTitleCase(screenMatches[1].trim());
	}

	// Common screen patterns
	if (/login|signin|sign.*in/i.test(taskText)) {
		return 'LoginScreen';
	} else if (/register|signup|sign.*up/i.test(taskText)) {
		return 'SignUpScreen';
	} else if (/dashboard|home.*page|main.*screen/i.test(taskText)) {
		return 'DashboardScreen';
	} else if (/profile|account.*settings/i.test(taskText)) {
		return 'ProfileScreen';
	} else if (/settings|configuration/i.test(taskText)) {
		return 'SettingsScreen';
	} else if (/search|find/i.test(taskText)) {
		return 'SearchScreen';
	} else if (/detail|details.*page/i.test(taskText)) {
		return 'DetailScreen';
	} else if (/list|listing|index/i.test(taskText)) {
		return 'ListScreen';
	}

	return null;
}

/**
 * Extract component information from task content
 * @param {Object} task - The task object
 * @returns {string|null} Component name or null
 */
function extractComponentInfo(task) {
	const taskText = `${task.title || ''} ${task.description || ''}`.toLowerCase();
	
	// Look for component patterns
	const componentMatches = taskText.match(/(?:component|widget|element)\s*(?:for|called)?\s*([a-z][a-z0-9\s]*)/i);
	if (componentMatches && componentMatches[1]) {
		return toTitleCase(componentMatches[1].trim()) + 'Component';
	}

	// Common component patterns
	if (/button/i.test(taskText)) {
		return 'Button';
	} else if (/form/i.test(taskText)) {
		return 'Form';
	} else if (/input|field/i.test(taskText)) {
		return 'InputField';
	} else if (/card/i.test(taskText)) {
		return 'Card';
	} else if (/modal|dialog/i.test(taskText)) {
		return 'Modal';
	} else if (/navigation|navbar|nav.*bar/i.test(taskText)) {
		return 'Navigation';
	} else if (/header/i.test(taskText)) {
		return 'Header';
	} else if (/footer/i.test(taskText)) {
		return 'Footer';
	} else if (/sidebar/i.test(taskText)) {
		return 'Sidebar';
	} else if (/dropdown|select/i.test(taskText)) {
		return 'Dropdown';
	} else if (/table|grid/i.test(taskText)) {
		return 'DataTable';
	}

	return null;
}

/**
 * Determine viewport requirements from task content
 * @param {Object} task - The task object
 * @returns {string|null} Viewport requirement or null
 */
function determineViewport(task) {
	const taskText = `${task.title || ''} ${task.description || ''}`.toLowerCase();
	
	if (/mobile.*first|mobile.*only|phone/i.test(taskText)) {
		return 'mobile';
	} else if (/tablet.*only|ipad/i.test(taskText)) {
		return 'tablet';
	} else if (/desktop.*only|large.*screen/i.test(taskText)) {
		return 'desktop';
	} else if (/responsive|all.*devices|cross.*device/i.test(taskText)) {
		return 'responsive';
	}

	return null;
}

/**
 * Extract design token references from task content
 * @param {Object} task - The task object
 * @returns {string|null} Design token reference or null
 */
function extractDesignTokens(task) {
	const taskText = `${task.title || ''} ${task.description || ''}`.toLowerCase();
	
	if (/color|palette|theme/i.test(taskText)) {
		return 'color-tokens';
	} else if (/spacing|margin|padding|gap/i.test(taskText)) {
		return 'spacing-tokens';
	} else if (/typography|font|text.*style/i.test(taskText)) {
		return 'typography-tokens';
	} else if (/shadow|elevation/i.test(taskText)) {
		return 'shadow-tokens';
	} else if (/border|radius/i.test(taskText)) {
		return 'border-tokens';
	}

	return null;
}

/**
 * Convert string to TitleCase
 * @param {string} str - Input string
 * @returns {string} TitleCased string
 */
function toTitleCase(str) {
	return str.replace(/\w\S*/g, (txt) => {
		return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
	}).replace(/\s+/g, '');
}

/**
 * Estimate task count based on UX spec content analysis
 * @param {string} documentText - The UX spec content
 * @returns {number} Estimated number of tasks
 */
function estimateTaskCount(documentText) {
	if (!documentText || typeof documentText !== 'string') {
		return 4; // Default fallback for UX specs
	}

	let taskCount = 2; // Minimum base tasks

	// Count screens/pages
	const screenMatches = documentText.match(/(?:screen|page|view|layout|wireframe)/gi) || [];
	taskCount += screenMatches.length;

	// Count components (these often need separate implementation tasks)
	const componentMatches = documentText.match(/(?:component|widget|button|form|input|card|modal)/gi) || [];
	taskCount += Math.floor(componentMatches.length * 0.6);

	// Count interaction patterns
	const interactionMatches = documentText.match(/(?:click|hover|tap|animation|transition|gesture)/gi) || [];
	taskCount += Math.floor(interactionMatches.length * 0.4);

	// Count responsive mentions (these add complexity)
	const responsiveMatches = documentText.match(/(?:responsive|mobile|tablet|desktop|breakpoint)/gi) || [];
	taskCount += Math.floor(responsiveMatches.length * 0.3);

	// Count accessibility mentions
	const a11yMatches = documentText.match(/(?:accessibility|a11y|screen reader|keyboard|aria)/gi) || [];
	taskCount += Math.floor(a11yMatches.length * 0.5);

	// Document length factor (UX specs tend to be more visual, less text)
	const wordCount = documentText.split(/\s+/).length;
	if (wordCount > 1500) {
		taskCount += Math.floor((wordCount - 1500) / 300); // Add 1 task per 300 words above 1500
	}

	// Reasonable bounds for UX specs
	return Math.max(2, Math.min(taskCount, 20));
}

export default {
	getPrePrompt,
	postProcessTasks,
	estimateTaskCount
}; 