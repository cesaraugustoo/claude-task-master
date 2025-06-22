/**
 * classify-document.js
 * Automatic document type classification using regex heuristics and optional LLM fallback
 */

import { generateObjectService } from '../../ai-services-unified.js';
import { getSupportedDocumentTypes } from '../document-adapters/index.js';
import { z } from 'zod';

/**
 * Document type classification patterns for regex-based analysis
 * Each pattern includes keywords and weight multipliers for scoring
 */
const CLASSIFICATION_PATTERNS = {
	PRD: {
		keywords: [
			'problem statement', 'user stories', 'acceptance criteria', 'business goals',
			'product requirements', 'functional requirements', 'user journey',
			'success metrics', 'stakeholders', 'product roadmap', 'market analysis',
			'competitive analysis', 'user personas', 'business value', 'kpis'
		],
		titlePatterns: [
			/product\s+requirements?/i,
			/prd\b/i,
			/requirements?\s+document/i,
			/product\s+spec/i
		],
		sectionPatterns: [
			/^#+\s*(problem\s+statement|business\s+goals|user\s+stories|acceptance\s+criteria)/i,
			/^#+\s*(success\s+metrics|stakeholder|roadmap)/i
		],
		weightMultiplier: 1.0
	},

	UX_SPEC: {
		keywords: [
			'screen', 'component', 'figma', 'button', 'responsive', 'wireframe',
			'user interface', 'ui component', 'design system', 'interaction',
			'user experience', 'navigation', 'layout', 'visual design',
			'accessibility', 'usability', 'prototype', 'mockup', 'user flow'
		],
		titlePatterns: [
			/ux\s+(spec|design)/i,
			/ui\s+(spec|design)/i,
			/design\s+(spec|document)/i,
			/wireframe/i,
			/user\s+interface/i
		],
		sectionPatterns: [
			/^#+\s*(screen|component|wireframe|user\s+flow)/i,
			/^#+\s*(design\s+system|interaction|navigation)/i
		],
		weightMultiplier: 1.0
	},

	SDD: {
		keywords: [
			'architecture', 'module', 'service', 'interface', 'layer', 'class diagram',
			'software design', 'system architecture', 'api design', 'database schema',
			'data flow', 'component diagram', 'design patterns', 'technical design',
			'software architecture', 'system design', 'implementation details'
		],
		titlePatterns: [
			/software\s+design/i,
			/system\s+design/i,
			/sdd\b/i,
			/technical\s+design/i,
			/architecture\s+document/i
		],
		sectionPatterns: [
			/^#+\s*(architecture|system\s+design|technical\s+design)/i,
			/^#+\s*(module|service|interface|layer)/i,
			/^#+\s*(database|api\s+design)/i
		],
		weightMultiplier: 1.0
	},

	TECH_SPEC: {
		keywords: [
			'api', 'protocol', 'integration', 'rate limiting', 'authentication',
			'technical specification', 'implementation', 'endpoint', 'payload',
			'request', 'response', 'webhook', 'sdk', 'technical details',
			'security', 'performance', 'scalability', 'monitoring'
		],
		titlePatterns: [
			/tech\s+spec/i,
			/technical\s+spec/i,
			/api\s+spec/i,
			/integration\s+spec/i
		],
		sectionPatterns: [
			/^#+\s*(api|endpoint|integration|protocol)/i,
			/^#+\s*(authentication|security|performance)/i
		],
		weightMultiplier: 1.0
	},

	INFRA_SPEC: {
		keywords: [
			'deployment', 'kubernetes', 'ci/cd', 'infrastructure', 'load balancer',
			'docker', 'container', 'orchestration', 'monitoring', 'logging',
			'devops', 'pipeline', 'automation', 'provisioning', 'cloud',
			'aws', 'azure', 'gcp', 'terraform', 'ansible'
		],
		titlePatterns: [
			/infra\s+spec/i,
			/infrastructure/i,
			/deployment\s+guide/i,
			/devops/i,
			/ci\/cd/i
		],
		sectionPatterns: [
			/^#+\s*(deployment|infrastructure|devops)/i,
			/^#+\s*(kubernetes|docker|container)/i,
			/^#+\s*(monitoring|logging|pipeline)/i
		],
		weightMultiplier: 1.0
	},

	DESIGN_SYSTEM: {
		keywords: [
			'design system', 'style guide', 'design tokens', 'component library',
			'brand guidelines', 'typography', 'color palette', 'spacing',
			'design principles', 'visual identity', 'ui kit', 'pattern library',
			'atomic design', 'design language', 'brand identity'
		],
		titlePatterns: [
			/design\s+system/i,
			/style\s+guide/i,
			/component\s+library/i,
			/design\s+tokens/i,
			/brand\s+guidelines/i
		],
		sectionPatterns: [
			/^#+\s*(design\s+system|style\s+guide|component\s+library)/i,
			/^#+\s*(typography|color|spacing|tokens)/i
		],
		weightMultiplier: 1.0
	}
};

/**
 * Zod schema for LLM classification response
 */
const ClassificationResponseSchema = z.object({
	type: z.enum(['PRD', 'UX_SPEC', 'SDD', 'TECH_SPEC', 'INFRA_SPEC', 'DESIGN_SYSTEM', 'OTHER']),
	confidence: z.number().min(0).max(1),
	reasoning: z.string().optional()
});

/**
 * Calculate classification score for a document type based on regex patterns
 * @param {string} documentText - The document content to analyze
 * @param {string} documentType - The document type to score against
 * @returns {number} Score between 0 and 1
 */
function calculateRegexScore(documentText, documentType) {
	const pattern = CLASSIFICATION_PATTERNS[documentType];
	if (!pattern) return 0;

	const textLower = documentText.toLowerCase();
	const lines = documentText.split('\n');
	
	let score = 0;
	let totalPossibleScore = 0;

	// Score based on keyword frequency
	const keywordMatches = pattern.keywords.filter(keyword => 
		textLower.includes(keyword.toLowerCase())
	).length;
	const keywordScore = Math.min(keywordMatches / pattern.keywords.length, 1.0);
	score += keywordScore * 0.4; // 40% weight for keywords
	totalPossibleScore += 0.4;

	// Score based on title patterns
	let titleScore = 0;
	for (const titlePattern of pattern.titlePatterns) {
		if (lines.slice(0, 5).some(line => titlePattern.test(line))) {
			titleScore = 1.0;
			break;
		}
	}
	score += titleScore * 0.3; // 30% weight for title patterns
	totalPossibleScore += 0.3;

	// Score based on section patterns
	const sectionMatches = pattern.sectionPatterns.filter(sectionPattern =>
		lines.some(line => sectionPattern.test(line))
	).length;
	const sectionScore = Math.min(sectionMatches / Math.max(pattern.sectionPatterns.length, 1), 1.0);
	score += sectionScore * 0.3; // 30% weight for section patterns
	totalPossibleScore += 0.3;

	// Apply weight multiplier and normalize
	const finalScore = (score / totalPossibleScore) * pattern.weightMultiplier;
	return Math.min(finalScore, 1.0);
}

/**
 * Perform regex-based classification of document
 * @param {string} documentText - The document content to classify
 * @returns {object} Classification result with type, confidence, and source
 */
function classifyWithRegex(documentText) {
	if (!documentText || typeof documentText !== 'string' || documentText.trim().length === 0) {
		return { type: 'OTHER', confidence: 0, source: 'regex' };
	}

	const supportedTypes = getSupportedDocumentTypes();
	const scores = {};
	
	// Calculate scores for each supported document type
	for (const docType of supportedTypes) {
		// Only score types that have classification patterns
		if (CLASSIFICATION_PATTERNS[docType]) {
			scores[docType] = calculateRegexScore(documentText, docType);
		}
	}

	// Find the highest scoring type
	let bestType = 'OTHER';
	let bestScore = 0;

	for (const [type, score] of Object.entries(scores)) {
		if (score > bestScore) {
			bestScore = score;
			bestType = type;
		}
	}

	return {
		type: bestType,
		confidence: bestScore,
		source: 'regex'
	};
}

/**
 * Perform LLM-based classification of document
 * @param {string} documentText - The document content to classify
 * @param {object} options - Classification options
 * @param {object} [options.session] - MCP session object
 * @param {string} [options.projectRoot] - Project root path
 * @returns {Promise<object>} Classification result with type, confidence, and source
 */
async function classifyWithLLM(documentText, options = {}) {
	const { session, projectRoot } = options;

	// Truncate document to manage token costs (keep first 3000 chars)
	const truncatedText = documentText.slice(0, 3000);
	
	const supportedTypes = getSupportedDocumentTypes();
	const typesList = [...supportedTypes, 'OTHER'].join(', ');

	const prompt = `You are an expert software architect. Analyze the following document and classify it by its primary purpose and content.

Available document types:
- PRD: Product Requirements Document (user stories, business goals, acceptance criteria)
- UX_SPEC: UX/Design Specification (screens, components, wireframes, user flows)
- SDD: Software Design Document (architecture, modules, technical design)
- TECH_SPEC: Technical Specification (APIs, protocols, integration details)
- INFRA_SPEC: Infrastructure Specification (deployment, DevOps, cloud infrastructure)
- DESIGN_SYSTEM: Design System Documentation (style guides, design tokens, component libraries)
- OTHER: Does not clearly fit any of the above categories

Document content:
${truncatedText}

Analyze the document and provide:
1. The most appropriate document type from the list above
2. Your confidence level (0.0 to 1.0)
3. Brief reasoning for your classification

Focus on the primary purpose and content structure rather than minor mentions of other topics.`;

	try {
		const aiResponse = await generateObjectService({
			role: 'research',
			session,
			projectRoot,
			schema: ClassificationResponseSchema,
			prompt,
			systemPrompt: 'You are a document classification expert. Provide accurate, confident classifications based on document content and structure.',
			objectName: 'document_classification',
			commandName: 'classify-document',
			outputType: session ? 'mcp' : 'cli'
		});

		const classification = aiResponse.mainResult;

		// Validate the response and ensure supported type
		if (!classification || !classification.type) {
			console.warn('[classifyDocument] LLM returned invalid classification, defaulting to OTHER');
			return { type: 'OTHER', confidence: 0, source: 'llm' };
		}

		// Ensure the type is supported or fallback to OTHER
		const finalType = supportedTypes.includes(classification.type) ? classification.type : 'OTHER';

		return {
			type: finalType,
			confidence: Math.min(Math.max(classification.confidence || 0, 0), 1),
			source: 'llm',
			reasoning: classification.reasoning,
			telemetryData: aiResponse.telemetryData
		};

	} catch (error) {
		console.warn(`[classifyDocument] LLM classification failed: ${error.message}`);
		return { type: 'OTHER', confidence: 0, source: 'llm' };
	}
}

/**
 * Classify a document to determine its type automatically
 * @param {string} documentText - Raw text of the document
 * @param {object} [options] - Classification options
 * @param {boolean} [options.useLLMFallback=false] - Use LLM if regex is inconclusive
 * @param {number} [options.threshold=0.65] - Confidence threshold for regex classification
 * @param {object} [options.session] - MCP session object for LLM calls
 * @param {string} [options.projectRoot] - Project root path for LLM calls
 * @returns {Promise<object>} Classification result: { type, confidence, source, reasoning?, telemetryData? }
 */
async function classifyDocument(documentText, options = {}) {
	const {
		useLLMFallback = false,
		threshold = 0.65,
		session,
		projectRoot
	} = options;

	// Input validation
	if (!documentText || typeof documentText !== 'string') {
		console.warn('[classifyDocument] Invalid or empty document text provided');
		return { type: 'OTHER', confidence: 0, source: 'none' };
	}

	const trimmedText = documentText.trim();
	if (trimmedText.length === 0) {
		console.warn('[classifyDocument] Document text is empty after trimming');
		return { type: 'OTHER', confidence: 0, source: 'none' };
	}

	try {
		// Phase 1: Try regex-based classification first
		const regexResult = classifyWithRegex(trimmedText);
		
		// If regex confidence is above threshold, return it
		if (regexResult.confidence >= threshold) {
			return regexResult;
		}

		// Phase 2: If regex is inconclusive and LLM fallback is enabled, try LLM
		if (useLLMFallback) {
			const llmResult = await classifyWithLLM(trimmedText, { session, projectRoot });
			
			// If LLM classification succeeded, return it
			if (llmResult.confidence > 0) {
				return llmResult;
			}
		}

		// Fallback: return regex result even if below threshold
		return regexResult;

	} catch (error) {
		console.warn(`[classifyDocument] Classification failed: ${error.message}`);
		return { type: 'OTHER', confidence: 0, source: 'none' };
	}
}

export {
	classifyDocument,
	calculateRegexScore,
	classifyWithRegex,
	classifyWithLLM,
	CLASSIFICATION_PATTERNS
}; 