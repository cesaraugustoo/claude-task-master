/**
 * Priority Escalation Utility
 * 
 * Automatically assigns or adjusts task priority based on:
 * - Source document type (PRD, SDD, UX_SPEC, etc.)
 * - Task semantic context (performance goals, component type, etc.)
 * - Position in hierarchy (epic vs subtask)
 * - Estimated impact (infrastructure, user-visible, compliance)
 */

/**
 * Priority order mapping for calculations
 */
const PRIORITY_ORDER = {
  'low': 1,
  'medium': 2,
  'high': 3
};

/**
 * Reverse mapping for converting back to priority strings
 */
const PRIORITY_LEVELS = ['low', 'medium', 'high'];

/**
 * Base priority rules by source document type
 */
const BASE_PRIORITY_BY_DOCUMENT_TYPE = {
  'PRD': 'high',
  'PRODUCT_REQUIREMENTS': 'high',
  'UX_SPEC': 'medium',
  'DESIGN_SPEC': 'medium',
  'UI_SPEC': 'medium',
  'SDD': 'low',
  'SOFTWARE_DESIGN': 'low',
  'TECH_SPEC': 'low',
  'ARCHITECTURE': 'low',
  'INFRA_SPEC': 'low',
  'DESIGN_SYSTEM': 'medium',
  'OTHER': 'medium',
  'UNKNOWN': 'medium'
};

/**
 * Escalate a single task's priority based on rules
 * @param {Object} task - The task object to analyze
 * @param {Object} context - Optional context for escalation decisions
 * @returns {string} - The escalated priority ('low', 'medium', 'high')
 */
export function escalateTaskPriority(task, context = {}) {
  if (!task || typeof task !== 'object') {
    return {
      priority: 'medium',
      escalationReason: 'Invalid task input - using default priority'
    };
  }

  // Start with base priority from document type
  const sourceDocumentType = task.sourceDocumentType || 'UNKNOWN';
  let basePriority = BASE_PRIORITY_BY_DOCUMENT_TYPE[sourceDocumentType] || 'medium';
  let currentPriorityLevel = PRIORITY_ORDER[basePriority];
  
  // Track escalation reasoning for transparency
  const escalationReasons = [];
  escalationReasons.push(`Base priority '${basePriority}' from document type '${sourceDocumentType}'`);

  // ESCALATION TRIGGERS

  // 1. Test Strategy Escalation
  if (task.testStrategy && task.testStrategy.trim().length > 20) {
    currentPriorityLevel = Math.min(currentPriorityLevel + 1, 3);
    escalationReasons.push('testStrategy present - indicates testable/production item');
  }

  // 2. Performance/Reliability Goals
  if (task.performanceGoal && task.performanceGoal.trim().length > 0) {
    currentPriorityLevel = Math.min(currentPriorityLevel + 1, 3);
    escalationReasons.push('performanceGoal present - critical or SLO task');
  }

  if (task.reliabilityTarget && task.reliabilityTarget.trim().length > 0) {
    currentPriorityLevel = Math.min(currentPriorityLevel + 1, 3);
    escalationReasons.push('reliabilityTarget present - critical or SLO task');
  }

  // 3. UX Spec + Presentation Layer
  if (sourceDocumentType === 'UX_SPEC' && task.layer === 'presentation') {
    currentPriorityLevel = Math.max(currentPriorityLevel, PRIORITY_ORDER['medium']);
    escalationReasons.push('UX_SPEC + presentation layer - user-facing UI task');
  }

  // 4. Epic-level tasks
  if (task.epicId && task.epicId.trim().length > 0 && 
      (task.title && task.title.toLowerCase().includes('epic'))) {
    currentPriorityLevel = PRIORITY_ORDER['high'];
    escalationReasons.push('Epic-level task from PRD - core feature');
  }

  // 5. Security/Authentication tasks
  if (task.title || task.description) {
    const taskText = `${task.title || ''} ${task.description || ''}`.toLowerCase();
    if (/security|auth|encryption|token|login|signin|authentication|authorization/i.test(taskText)) {
      currentPriorityLevel = Math.min(currentPriorityLevel + 1, 3);
      escalationReasons.push('Security/authentication task - critical for system safety');
    }
  }

  // 6. Infrastructure with performance goals (ensure medium priority minimum)
  if (task.layer === 'infra' && task.performanceGoal) {
    currentPriorityLevel = Math.max(currentPriorityLevel, PRIORITY_ORDER['medium']);
    escalationReasons.push('Infrastructure task with performance requirements');
  }

  // DEMOTION RULES

  // 1. Tech spec without performance goals (only demote if no other escalations happened)
  if ((sourceDocumentType === 'TECH_SPEC' || sourceDocumentType === 'SDD') && 
      (!task.performanceGoal || task.performanceGoal.trim().length === 0) &&
      currentPriorityLevel === PRIORITY_ORDER[basePriority]) { // Only if no escalations occurred
    currentPriorityLevel = Math.min(currentPriorityLevel, PRIORITY_ORDER['low']);
    escalationReasons.push('Tech/SDD task without performance goals - demoted to low');
  }

  // 2. Very short descriptions (likely incomplete/junk tasks)
  if (task.description && task.description.trim().length < 20) {
    currentPriorityLevel = PRIORITY_ORDER['low'];
    escalationReasons.push('Very short description - possibly incomplete task');
  }

  // 3. Refactor/documentation tasks without dependencies
  if (task.title || task.description) {
    const taskText = `${task.title || ''} ${task.description || ''}`.toLowerCase();
    if (/refactor|documentation|doc|readme|comment/i.test(taskText) && 
        (!task.dependencies || task.dependencies.length === 0)) {
      currentPriorityLevel = PRIORITY_ORDER['low'];
      escalationReasons.push('Refactor/documentation task without dependencies - maintenance level');
    }
  }

  // Convert back to priority string
  const finalPriority = PRIORITY_LEVELS[currentPriorityLevel - 1];
  
  // Create escalation reason summary
  const escalationReason = escalationReasons.join('; ');

  return {
    priority: finalPriority,
    escalationReason: escalationReason
  };
}

/**
 * Escalate priorities for all tasks in a list
 * @param {Array} tasks - Array of task objects
 * @param {Object} context - Optional context for escalation decisions
 * @returns {Array} - Tasks with updated priorities and escalation reasons
 */
export function escalateAllTasks(tasks, context = {}) {
  if (!Array.isArray(tasks)) {
    return tasks;
  }

  // Build context maps for hierarchy analysis
  const taskMapById = new Map();
  tasks.forEach(task => {
    if (task.id) {
      taskMapById.set(task.id, task);
    }
  });

  // Build document metadata map
  const documentMetadataMap = new Map();
  tasks.forEach(task => {
    if (task.sourceDocumentId && task.sourceDocumentType) {
      if (!documentMetadataMap.has(task.sourceDocumentId)) {
        documentMetadataMap.set(task.sourceDocumentId, {
          type: task.sourceDocumentType,
          title: task.sourceDocumentId, // Use ID as title for now
          taskCount: 0
        });
      }
      const metadata = documentMetadataMap.get(task.sourceDocumentId);
      metadata.taskCount++;
    }
  });

  // Enhanced context for escalation
  const enhancedContext = {
    ...context,
    taskMapById,
    documentMetadataMap,
    totalTasks: tasks.length
  };

  // Process each task
  return tasks.map(task => {
    const escalationResult = escalateTaskPriority(task, enhancedContext);
    
    // Only update if escalation resulted in a change
    const originalPriority = task.priority || 'medium';
    if (escalationResult.priority !== originalPriority) {
      return {
        ...task,
        priority: escalationResult.priority,
        escalationReason: escalationResult.escalationReason
      };
    }
    
    return task;
  });
}

/**
 * Get the maximum priority between two priorities
 * @param {string} priorityA - First priority
 * @param {string} priorityB - Second priority
 * @returns {string} - The higher priority
 */
export function getMaxPriority(priorityA, priorityB) {
  const levelA = PRIORITY_ORDER[priorityA] || PRIORITY_ORDER['medium'];
  const levelB = PRIORITY_ORDER[priorityB] || PRIORITY_ORDER['medium'];
  
  const maxLevel = Math.max(levelA, levelB);
  return PRIORITY_LEVELS[maxLevel - 1];
}

/**
 * Check if one priority is higher than another
 * @param {string} priorityA - First priority
 * @param {string} priorityB - Second priority
 * @returns {boolean} - True if priorityA is higher than priorityB
 */
export function isPriorityHigher(priorityA, priorityB) {
  const levelA = PRIORITY_ORDER[priorityA] || PRIORITY_ORDER['medium'];
  const levelB = PRIORITY_ORDER[priorityB] || PRIORITY_ORDER['medium'];
  
  return levelA > levelB;
}

/**
 * Escalate priority for tasks after merging (integration with merge system)
 * @param {Object} mergedTask - The merged task
 * @param {Object} context - Optional context
 * @returns {Object} - Task with potentially escalated priority
 */
export function escalateAfterMerge(mergedTask, context = {}) {
  if (!mergedTask) {
    return mergedTask;
  }

  const escalationResult = escalateTaskPriority(mergedTask, context);
  const currentPriority = mergedTask.priority || 'medium';
  
  // Only escalate if the new priority is higher
  if (isPriorityHigher(escalationResult.priority, currentPriority)) {
    return {
      ...mergedTask,
      priority: escalationResult.priority,
      escalationReason: escalationResult.escalationReason
    };
  }
  
  return mergedTask;
}

export default {
  escalateTaskPriority,
  escalateAllTasks,
  getMaxPriority,
  isPriorityHigher,
  escalateAfterMerge
}; 