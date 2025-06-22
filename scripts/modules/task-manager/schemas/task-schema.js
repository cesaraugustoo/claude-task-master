import { z } from 'zod';

/**
 * Base Task Schema - Core fields shared by all task types
 * Includes new document-type specific optional fields for multi-document support
 */
const BaseTaskSchema = z.object({
	// Existing core fields (maintain current types for compatibility)
	id: z.number().int().positive(),
	title: z.string().min(1),
	description: z.string().min(1),
	status: z.string().optional().default('pending'),
	dependencies: z.array(z.number().int().positive()).optional().default([]),
	priority: z.enum(['low', 'medium', 'high']).default('medium'),
	details: z.string().optional().default(''),
	testStrategy: z.string().optional().default(''),
	
	// Existing document tracking fields
	sourceDocumentId: z.string().optional(),
	sourceDocumentType: z.enum(['PRD', 'SDD', 'UX_SPEC', 'TECH_SPEC', 'INFRA_SPEC', 'DESIGN_SYSTEM']).optional(),
	
	// NEW: Document-type specific fields
	// ENUMS (controlled values for stability)
	layer: z.enum(['presentation', 'business', 'data', 'infra']).optional(),
	viewport: z.enum(['mobile', 'tablet', 'desktop']).optional(),
	
	// STRINGS (flexible/user-defined values)
	epicId: z.string().optional(),
	module: z.string().optional(),
	component: z.string().optional(),
	screen: z.string().optional(),
	infraZone: z.string().optional(),
	performanceGoal: z.string().optional(),
	reliabilityTarget: z.string().optional(),
	designToken: z.string().optional(),
	estimationNote: z.string().optional(),
	
	// Existing optional (keep flexible for now)
	subtasks: z.array(z.any()).optional()
});

/**
 * Task Schema - For standard tasks (same as base)
 */
const TaskSchema = BaseTaskSchema;

/**
 * Subtask Schema - Inherits all fields from base task schema
 * Subtasks inherit document-specific fields for flattened context access
 */
const SubtaskSchema = BaseTaskSchema.extend({
	// Subtasks may have additional constraints in the future
	// For now, they use the same structure as tasks
});

/**
 * AI-Generated Task Schema - For tasks created by AI services
 * Used when validating AI responses for task creation
 */
const AiTaskDataSchema = z.object({
	title: z.string().describe('Clear, concise title for the task'),
	description: z
		.string()
		.describe('A one or two sentence description of the task'),
	details: z
		.string()
		.describe('In-depth implementation details, considerations, and guidance'),
	testStrategy: z
		.string()
		.describe('Detailed approach for verifying task completion'),
	dependencies: z
		.array(z.number())
		.optional()
		.describe(
			'Array of task IDs that this task depends on (must be completed before this task can start)'
		),
	
	// NEW: Include document-type specific fields in AI generation
	// ENUMS (controlled values)
	layer: z.enum(['presentation', 'business', 'data', 'infra']).optional(),
	viewport: z.enum(['mobile', 'tablet', 'desktop']).optional(),
	
	// STRINGS (flexible/user-defined values)
	epicId: z.string().optional(),
	module: z.string().optional(),
	component: z.string().optional(),
	screen: z.string().optional(),
	infraZone: z.string().optional(),
	performanceGoal: z.string().optional(),
	reliabilityTarget: z.string().optional(),
	designToken: z.string().optional(),
	estimationNote: z.string().optional()
});

/**
 * Updated Task Schema - For validating updated tasks (from update operations)
 * More flexible to handle partial updates and different formats
 */
const UpdatedTaskSchema = z
	.object({
		id: z.number().int(),
		title: z.string(),
		description: z.string(),
		status: z.string(),
		dependencies: z.array(z.union([z.number().int(), z.string()])), // More flexible for updates
		priority: z.string().optional(),
		details: z.string().optional(),
		testStrategy: z.string().optional(),
		subtasks: z.array(z.any()).optional(), // Keep flexible for now
		
		// Include new document-type specific fields
		sourceDocumentId: z.string().optional(),
		sourceDocumentType: z.enum(['PRD', 'SDD', 'UX_SPEC', 'TECH_SPEC', 'INFRA_SPEC', 'DESIGN_SYSTEM']).optional(),
		layer: z.enum(['presentation', 'business', 'data', 'infra']).optional(),
		viewport: z.enum(['mobile', 'tablet', 'desktop']).optional(),
		epicId: z.string().optional(),
		module: z.string().optional(),
		component: z.string().optional(),
		screen: z.string().optional(),
		infraZone: z.string().optional(),
		performanceGoal: z.string().optional(),
		reliabilityTarget: z.string().optional(),
		designToken: z.string().optional(),
		estimationNote: z.string().optional()
	})
	.strip(); // Allow potential extra fields during parsing if needed, then validate structure

/**
 * PRD Response Schema - For parsing PRD documents into tasks
 */
const PrdResponseSchema = z.object({
	tasks: z.array(TaskSchema),
	metadata: z.object({
		projectName: z.string(),
		totalTasks: z.number(),
		sourceFile: z.string(),
		generatedAt: z.string()
	})
});

/**
 * Subtask Wrapper Schema - For AI-generated subtask responses
 */
const SubtaskWrapperSchema = z.object({
	subtasks: z.array(SubtaskSchema).describe('The array of generated subtasks.')
});

// Export functions for schema access
export function getTaskSchema() {
	return TaskSchema;
}

export function getSubtaskSchema() {
	return SubtaskSchema;
}

export function getAiTaskSchema() {
	return AiTaskDataSchema;
}

export function getUpdatedTaskSchema() {
	return UpdatedTaskSchema;
}

export function getPrdResponseSchema() {
	return PrdResponseSchema;
}

export function getSubtaskWrapperSchema() {
	return SubtaskWrapperSchema;
}

// Export arrays for convenience
export function getUpdatedTaskArraySchema() {
	return z.array(UpdatedTaskSchema);
}

export function getSubtaskArraySchema() {
	return z.array(SubtaskSchema);
}

// Export the base schema for extension by other modules
export function getBaseTaskSchema() {
	return BaseTaskSchema;
} 