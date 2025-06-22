/**
 * Software Design Document (SDD) / Technical Specification Adapter
 * 
 * SDDs typically contain:
 * - System architecture diagrams
 * - Module and component specifications
 * - API definitions and interfaces
 * - Database schema designs
 * - Layer-based architectural patterns
 * - Technical implementation details
 */

/**
 * Generate SDD-specific system prompt additions
 * @param {string} documentText - The SDD content
 * @returns {string} Additional system prompt for SDD processing
 */
function getPrePrompt(documentText) {
	// Analyze document for technical architecture context
	const hasArchitecture = /architecture|system.*design|layer|tier|module/i.test(documentText);
	const hasDatabase = /database|schema|table|entity|model|orm/i.test(documentText);
	const hasAPI = /api|endpoint|service|interface|contract|rest|graphql/i.test(documentText);
	const hasInfrastructure = /infrastructure|deployment|docker|kubernetes|cloud|server/i.test(documentText);
	const hasSecurity = /security|authentication|authorization|encryption|token/i.test(documentText);
	const hasPerformance = /performance|optimization|caching|scaling|load.*balancing/i.test(documentText);
	
	let prompt = `
This is a Software Design Document (SDD) or Technical Specification. Focus on creating tasks that:

TASK GENERATION STRATEGY:
- Break down implementation by architectural layers and modules
- Prioritize backend services, APIs, and data layer implementation
- Create tasks that represent complete system components or modules
- Focus on service-oriented and modular architecture
- Consider integration points between different system components
- Include infrastructure, security, and performance considerations

TASK CHARACTERISTICS FOR SDDs:
- Tasks should represent complete modules, services, or architectural components
- Each task should result in functional backend services or system components
- Prioritize API-first development and service boundaries
- Include clear technical specifications and interface definitions
- Consider the development workflow (design → implement → integrate → test → deploy)
- Address non-functional requirements (performance, security, reliability)

FIELD USAGE:
- Use 'layer' field to indicate architectural layer (presentation, business, data, infra)
- Use 'module' field to specify the backend module or service component
- Use 'infraZone' field for infrastructure-related tasks (CI, K8s, LoadBalancer, etc.)
- Use 'performanceGoal' field to specify technical performance requirements
- Use 'reliabilityTarget' field for SLO and reliability requirements
- Set appropriate priority based on system criticality and dependencies`;

	if (hasArchitecture) {
		prompt += `\n- Pay special attention to architectural layer boundaries and module interfaces mentioned in the document`;
	}

	if (hasDatabase) {
		prompt += `\n- Focus on data layer implementation and database schema tasks`;
	}

	if (hasAPI) {
		prompt += `\n- Ensure API design and service interface tasks are clearly defined`;
	}

	if (hasInfrastructure) {
		prompt += `\n- Include infrastructure setup and deployment automation tasks`;
	}

	if (hasSecurity) {
		prompt += `\n- Ensure security implementation requirements are captured in relevant tasks`;
	}

	if (hasPerformance) {
		prompt += `\n- Include performance optimization and scalability requirements in tasks`;
	}

	return prompt;
}

/**
 * Post-process tasks to add SDD-specific fields
 * @param {Array} taskList - Generated tasks array
 * @param {string} documentId - The SDD document identifier
 * @returns {Array} Tasks with SDD-specific fields added
 */
function postProcessTasks(taskList, documentId) {
	if (!Array.isArray(taskList)) {
		return taskList;
	}

	return taskList.map((task, index) => {
		const processedTask = { ...task };

		// Set source document information
		processedTask.sourceDocumentType = 'SDD';
		processedTask.sourceDocumentId = documentId;

		// Determine architectural layer
		const layer = determineArchitecturalLayer(task);
		if (layer) {
			processedTask.layer = layer;
		}

		// Extract module information
		const module = extractModuleInfo(task);
		if (module) {
			processedTask.module = module;
		}

		// Determine infrastructure zone
		const infraZone = determineInfraZone(task);
		if (infraZone) {
			processedTask.infraZone = infraZone;
		}

		// Extract performance goals
		const performanceGoal = extractPerformanceGoal(task);
		if (performanceGoal) {
			processedTask.performanceGoal = performanceGoal;
		}

		// Extract reliability targets
		const reliabilityTarget = extractReliabilityTarget(task);
		if (reliabilityTarget) {
			processedTask.reliabilityTarget = reliabilityTarget;
		}

		// Add technical estimation notes
		if (/database|schema|migration|orm/i.test(task.title || task.description || '')) {
			processedTask.estimationNote = 'Database implementation - consider migration strategy and data consistency';
		} else if (/api|service|endpoint|interface/i.test(task.title || task.description || '')) {
			processedTask.estimationNote = 'Service implementation - ensure proper error handling and documentation';
		} else if (/security|auth|encryption|token/i.test(task.title || task.description || '')) {
			processedTask.estimationNote = 'Security-critical implementation - require security review and testing';
		} else if (/performance|optimization|caching|scaling/i.test(task.title || task.description || '')) {
			processedTask.estimationNote = 'Performance-focused task - include benchmarking and load testing';
		} else if (/integration|external.*service|third.*party/i.test(task.title || task.description || '')) {
			processedTask.estimationNote = 'External integration - account for API rate limits and error handling';
		} else if (/infrastructure|deployment|docker|kubernetes/i.test(task.title || task.description || '')) {
			processedTask.estimationNote = 'Infrastructure task - test in staging environment before production';
		}

		return processedTask;
	});
}

/**
 * Determine architectural layer from task content
 * @param {Object} task - The task object
 * @returns {string|null} Architectural layer or null
 */
function determineArchitecturalLayer(task) {
	const taskText = `${task.title || ''} ${task.description || ''}`.toLowerCase();
	
	if (/ui|frontend|client|presentation|view|component/i.test(taskText)) {
		return 'presentation';
	} else if (/business.*logic|service|domain|use.*case|workflow|process/i.test(taskText)) {
		return 'business';
	} else if (/database|data.*layer|repository|orm|sql|nosql|storage/i.test(taskText)) {
		return 'data';
	} else if (/infrastructure|deployment|server|cloud|docker|kubernetes|ci.*cd/i.test(taskText)) {
		return 'infra';
	}

	return null;
}

/**
 * Extract module information from task content
 * @param {Object} task - The task object
 * @returns {string|null} Module name or null
 */
function extractModuleInfo(task) {
	const taskText = `${task.title || ''} ${task.description || ''}`.toLowerCase();
	
	// Look for explicit module mentions
	const moduleMatches = taskText.match(/(?:module|service|component)\s*(?:for|called)?\s*([a-z][a-z0-9\s]*)/i);
	if (moduleMatches && moduleMatches[1]) {
		return toKebabCase(moduleMatches[1].trim());
	}

	// Common module patterns
	if (/auth|authentication|login|signin/i.test(taskText)) {
		return 'auth-service';
	} else if (/user|profile|account/i.test(taskText)) {
		return 'user-service';
	} else if (/payment|billing|subscription|checkout/i.test(taskText)) {
		return 'payment-service';
	} else if (/notification|email|message|alert/i.test(taskText)) {
		return 'notification-service';
	} else if (/search|query|index/i.test(taskText)) {
		return 'search-service';
	} else if (/analytics|metrics|reporting|insights/i.test(taskText)) {
		return 'analytics-service';
	} else if (/file|upload|storage|asset/i.test(taskText)) {
		return 'file-service';
	} else if (/api.*gateway|gateway|proxy/i.test(taskText)) {
		return 'api-gateway';
	} else if (/database|data.*access|repository/i.test(taskText)) {
		return 'data-access';
	} else if (/configuration|config|settings/i.test(taskText)) {
		return 'config-service';
	}

	return null;
}

/**
 * Determine infrastructure zone from task content
 * @param {Object} task - The task object
 * @returns {string|null} Infrastructure zone or null
 */
function determineInfraZone(task) {
	const taskText = `${task.title || ''} ${task.description || ''}`.toLowerCase();
	
	if (/ci.*cd|pipeline|build|deployment|release/i.test(taskText)) {
		return 'CI/CD';
	} else if (/kubernetes|k8s|container|docker|orchestration/i.test(taskText)) {
		return 'K8s';
	} else if (/load.*balancer|lb|proxy|nginx|traffic/i.test(taskText)) {
		return 'LoadBalancer';
	} else if (/dns|domain|routing|gateway/i.test(taskText)) {
		return 'DNS';
	} else if (/monitoring|logging|observability|metrics/i.test(taskText)) {
		return 'Monitoring';
	} else if (/database|data.*store|persistence/i.test(taskText)) {
		return 'Database';
	} else if (/cache|redis|memcached/i.test(taskText)) {
		return 'Cache';
	} else if (/queue|message.*broker|kafka|rabbitmq/i.test(taskText)) {
		return 'MessageQueue';
	} else if (/security|firewall|ssl|tls|certificate/i.test(taskText)) {
		return 'Security';
	} else if (/backup|disaster.*recovery|failover/i.test(taskText)) {
		return 'Backup';
	}

	return null;
}

/**
 * Extract performance goals from task content
 * @param {Object} task - The task object
 * @returns {string|null} Performance goal or null
 */
function extractPerformanceGoal(task) {
	const taskText = `${task.title || task.description || ''}`.toLowerCase();
	
	// Look for specific performance metrics
	const latencyMatch = taskText.match(/(?:latency|response.*time).*?(?:<|under|below|within)\s*(\d+\s*ms)/i);
	if (latencyMatch) {
		return `Latency < ${latencyMatch[1]}`;
	}

	const throughputMatch = taskText.match(/(?:throughput|requests.*per.*second|rps).*?(\d+)/i);
	if (throughputMatch) {
		return `${throughputMatch[1]} RPS minimum`;
	}

	const p95Match = taskText.match(/p95.*?(?:<|under|below)\s*(\d+\s*[ms|s])/i);
	if (p95Match) {
		return `P95 < ${p95Match[1]}`;
	}

	// General performance patterns
	if (/high.*performance|fast|optimization|speed/i.test(taskText)) {
		return 'High performance requirements - optimize for speed';
	} else if (/scalability|scaling|load/i.test(taskText)) {
		return 'Must handle high load and scale horizontally';
	} else if (/real.*time|instant|immediate/i.test(taskText)) {
		return 'Real-time performance required';
	}

	return null;
}

/**
 * Extract reliability targets from task content
 * @param {Object} task - The task object
 * @returns {string|null} Reliability target or null
 */
function extractReliabilityTarget(task) {
	const taskText = `${task.title || task.description || ''}`.toLowerCase();
	
	// Look for specific SLO patterns
	const uptimeMatch = taskText.match(/(?:uptime|availability).*?(\d+\.?\d*%)/i);
	if (uptimeMatch) {
		return `${uptimeMatch[1]} uptime`;
	}

	const mttrMatch = taskText.match(/mttr.*?(?:<|under|below|within)\s*(\d+\s*[hm])/i);
	if (mttrMatch) {
		return `MTTR < ${mttrMatch[1]}`;
	}

	// General reliability patterns
	if (/high.*availability|ha|fault.*tolerant/i.test(taskText)) {
		return '99.9% uptime minimum';
	} else if (/disaster.*recovery|backup|failover/i.test(taskText)) {
		return 'Disaster recovery capable';
	} else if (/mission.*critical|critical.*system/i.test(taskText)) {
		return '99.99% uptime - mission critical';
	}

	return null;
}

/**
 * Convert string to kebab-case
 * @param {string} str - Input string
 * @returns {string} kebab-cased string
 */
function toKebabCase(str) {
	return str
		.replace(/\s+/g, '-')
		.replace(/[^a-zA-Z0-9-]/g, '')
		.toLowerCase();
}

/**
 * Estimate task count based on SDD content analysis
 * @param {string} documentText - The SDD content
 * @returns {number} Estimated number of tasks
 */
function estimateTaskCount(documentText) {
	if (!documentText || typeof documentText !== 'string') {
		return 6; // Default fallback for SDDs
	}

	let taskCount = 4; // Minimum base tasks for technical implementations

	// Count architectural components
	const archMatches = documentText.match(/(?:module|service|component|layer|tier)/gi) || [];
	taskCount += Math.floor(archMatches.length * 0.8);

	// Count API/service mentions
	const apiMatches = documentText.match(/(?:api|endpoint|service|interface|contract)/gi) || [];
	taskCount += Math.floor(apiMatches.length * 0.6);

	// Count database/data mentions
	const dataMatches = documentText.match(/(?:database|table|schema|entity|model|migration)/gi) || [];
	taskCount += Math.floor(dataMatches.length * 0.7);

	// Count infrastructure mentions
	const infraMatches = documentText.match(/(?:deployment|docker|kubernetes|server|cloud|infrastructure)/gi) || [];
	taskCount += Math.floor(infraMatches.length * 0.5);

	// Count integration points (these often need separate tasks)
	const integrationMatches = documentText.match(/(?:integration|external.*service|third.*party|webhook)/gi) || [];
	taskCount += Math.floor(integrationMatches.length * 0.8);

	// Count security requirements
	const securityMatches = documentText.match(/(?:security|authentication|authorization|encryption)/gi) || [];
	taskCount += Math.floor(securityMatches.length * 0.4);

	// Document length factor (SDDs tend to be comprehensive)
	const wordCount = documentText.split(/\s+/).length;
	if (wordCount > 2500) {
		taskCount += Math.floor((wordCount - 2500) / 400); // Add 1 task per 400 words above 2500
	}

	// Reasonable bounds for SDDs
	return Math.max(4, Math.min(taskCount, 30));
}

export default {
	getPrePrompt,
	postProcessTasks,
	estimateTaskCount
}; 