import { generateTaskHash, createGroupingKey, normalizeTitle } from './utils/hash-task.js';
import { escalateAfterMerge, getMaxPriority } from './utils/escalate-priority.js';
import { generateObjectService } from '../ai-services-unified.js';
import { displayAiUsageSummary } from '../ui.js';
import fs from 'fs/promises';
import z from 'zod';

/**
 * Group tasks by potential merge candidates
 * @param {Array} tasks - Array of task objects
 * @returns {Array} - Array of task groups (arrays of tasks that might be duplicates)
 */
export function identifyDuplicateGroups(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return [];
  }

  // Group tasks by potential similarity
  const groups = new Map();
  
  for (const task of tasks) {
    const groupKey = createGroupingKey(task);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey).push(task);
  }

  // Only return groups with multiple tasks
  return Array.from(groups.values()).filter(group => group.length > 1);
}

/**
 * Calculate semantic similarity between two tasks using token overlap
 * @param {Object} taskA - First task
 * @param {Object} taskB - Second task
 * @returns {number} - Similarity score between 0 and 1
 */
export function calculateSemanticSimilarity(taskA, taskB) {
  if (!taskA || !taskB) return 0;

  const textA = `${taskA.title || ''} ${taskA.description || ''}`.toLowerCase();
  const textB = `${taskB.title || ''} ${taskB.description || ''}`.toLowerCase();

  // Tokenize and create sets
  const tokensA = new Set(textA.split(/\s+/).filter(token => token.length > 2));
  const tokensB = new Set(textB.split(/\s+/).filter(token => token.length > 2));

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  // Calculate Jaccard similarity
  const intersection = new Set([...tokensA].filter(token => tokensB.has(token)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}

/**
 * Use LLM to determine if two tasks should be merged
 * @param {Object} taskA - First task
 * @param {Object} taskB - Second task
 * @param {Object} options - Options including context
 * @returns {Object} - { shouldMerge: boolean, reasoning: string, confidence: number }
 */
export async function confirmMergeWithLLM(taskA, taskB, options = {}) {
  const { context = {}, outputFormat = 'json' } = options;

  try {
    const mergeSchema = z.object({
      shouldMerge: z.boolean(),
      reasoning: z.string(),
      confidence: z.number().min(0).max(1)
    });

    const prompt = `You are analyzing two tasks from a software project to determine if they are semantically equivalent and should be merged.

Task A:
- ID: ${taskA.id}
- Title: "${taskA.title}"
- Description: "${taskA.description || 'No description'}"
- Source: ${taskA.sourceDocumentType || 'Unknown'} document
- Screen: ${taskA.screen || 'Not specified'}
- Component: ${taskA.component || 'Not specified'}

Task B:
- ID: ${taskB.id}
- Title: "${taskB.title}"
- Description: "${taskB.description || 'No description'}"
- Source: ${taskB.sourceDocumentType || 'Unknown'} document
- Screen: ${taskB.screen || 'Not specified'}
- Component: ${taskB.component || 'Not specified'}

Consider these factors:
1. Are they describing the same functionality or feature?
2. Do they target the same screen/component (if specified)?
3. Would implementing one satisfy the requirements of both?
4. Are they just different perspectives on the same work?

Respond with whether they should be merged, your reasoning, and confidence level (0-1).`;

    const aiServiceResponse = await generateObjectService({
      prompt,
      schema: mergeSchema,
      role: 'research',
      commandName: context.commandName || 'merge-tasks-llm',
      outputType: context.outputType || 'cli'
    });

    if (outputFormat === 'text' && aiServiceResponse.telemetryData) {
      displayAiUsageSummary(aiServiceResponse.telemetryData, 'cli');
    }

    return {
      ...aiServiceResponse.mainResult.object,
      telemetryData: aiServiceResponse.telemetryData
    };

  } catch (error) {
    console.warn('LLM merge confirmation failed:', error.message);
    return {
      shouldMerge: false,
      reasoning: 'LLM analysis failed, defaulting to no merge',
      confidence: 0,
      telemetryData: null
    };
  }
}

/**
 * Merge a group of tasks into a single consolidated task
 * @param {Array} taskGroup - Array of tasks to merge
 * @param {Object} options - Merge options
 * @returns {Object} - Merged task
 */
export function mergeTasks(taskGroup, options = {}) {
  if (!Array.isArray(taskGroup) || taskGroup.length < 2) {
    throw new Error('Task group must contain at least 2 tasks to merge');
  }

  // Sort by ID to keep the lowest as primary
  const sortedTasks = [...taskGroup].sort((a, b) => a.id - b.id);
  const primaryTask = sortedTasks[0];
  const otherTasks = sortedTasks.slice(1);

  // Start with primary task as base
  const mergedTask = { ...primaryTask };

  // Track merged task IDs
  mergedTask.mergedFrom = otherTasks.map(task => task.id);

  // Merge sourceDocumentId and sourceDocumentType into arrays
  const sourceDocumentIds = new Set();
  const sourceDocumentTypes = new Set();

  for (const task of sortedTasks) {
    if (task.sourceDocumentId) {
      if (Array.isArray(task.sourceDocumentId)) {
        task.sourceDocumentId.forEach(id => sourceDocumentIds.add(id));
      } else {
        sourceDocumentIds.add(task.sourceDocumentId);
      }
    }
    
    if (task.sourceDocumentType) {
      if (Array.isArray(task.sourceDocumentType)) {
        task.sourceDocumentType.forEach(type => sourceDocumentTypes.add(type));
      } else {
        sourceDocumentTypes.add(task.sourceDocumentType);
      }
    }
  }

  mergedTask.sourceDocumentId = Array.from(sourceDocumentIds);
  mergedTask.sourceDocumentType = Array.from(sourceDocumentTypes);

  // Merge priority - take highest from existing merge logic
  let highestPriority = primaryTask.priority || 'medium';
  let priorityChanged = false;

  for (const task of otherTasks) {
    const taskPriority = task.priority || 'medium';
    const maxPriority = getMaxPriority(highestPriority, taskPriority);
    if (maxPriority !== highestPriority) {
      highestPriority = maxPriority;
      priorityChanged = true;
    }
  }

  mergedTask.priority = highestPriority;

  // Log priority upgrade if it happened during merge
  if (priorityChanged) {
    const priorityNote = `Priority upgraded to '${highestPriority}' due to task merge.`;
    mergedTask.estimationNote = mergedTask.estimationNote 
      ? `${mergedTask.estimationNote} ${priorityNote}`
      : priorityNote;
  }

  // Merge unique metadata fields
  const metadataFields = ['screen', 'component', 'epicId', 'module', 'layer', 'viewport', 'infraZone'];
  
  for (const field of metadataFields) {
    const values = new Set();
    for (const task of sortedTasks) {
      if (task[field]) {
        if (Array.isArray(task[field])) {
          task[field].forEach(val => values.add(val));
        } else {
          values.add(task[field]);
        }
      }
    }
    
    if (values.size > 0) {
      mergedTask[field] = values.size === 1 ? Array.from(values)[0] : Array.from(values);
    }
  }

  // Merge dependencies (union)
  const allDependencies = new Set();
  for (const task of sortedTasks) {
    if (Array.isArray(task.dependencies)) {
      task.dependencies.forEach(dep => allDependencies.add(dep));
    }
  }
  mergedTask.dependencies = Array.from(allDependencies);

  // Merge subtasks from all tasks
  const allSubtasks = [];
  for (const task of sortedTasks) {
    if (Array.isArray(task.subtasks)) {
      allSubtasks.push(...task.subtasks);
    }
  }
  if (allSubtasks.length > 0) {
    mergedTask.subtasks = allSubtasks;
  }

  // Combine descriptions if they're meaningfully different
  const descriptions = sortedTasks
    .map(task => task.description)
    .filter(desc => desc && desc.trim())
    .filter((desc, index, arr) => arr.indexOf(desc) === index); // Remove duplicates

  if (descriptions.length > 1) {
    mergedTask.description = descriptions.join(' | ');
  }

  // Apply priority escalation after merge if enabled
  if (options.escalate) {
    const escalatedTask = escalateAfterMerge(mergedTask, options.context);
    if (escalatedTask.priority !== mergedTask.priority) {
      // Log escalation in addition to any merge priority changes
      const escalationNote = `Priority escalated to '${escalatedTask.priority}' after merge (${escalatedTask.escalationReason})`;
      escalatedTask.estimationNote = escalatedTask.estimationNote 
        ? `${escalatedTask.estimationNote}; ${escalationNote}`
        : escalationNote;
    }
    return escalatedTask;
  }

  return mergedTask;
}

/**
 * Update dependency references after tasks have been merged
 * @param {Array} tasks - All tasks
 * @param {Map} mergedIdMap - Map of old ID -> new ID
 * @returns {Array} - Tasks with updated dependencies
 */
export function reindexDependencies(tasks, mergedIdMap) {
  if (!Array.isArray(tasks) || !mergedIdMap || mergedIdMap.size === 0) {
    return tasks;
  }

  return tasks.map(task => {
    if (!Array.isArray(task.dependencies) || task.dependencies.length === 0) {
      return task;
    }

    const updatedDependencies = task.dependencies.map(depId => {
      return mergedIdMap.has(depId) ? mergedIdMap.get(depId) : depId;
    });

    // Remove duplicates and self-references
    const uniqueDependencies = [...new Set(updatedDependencies)]
      .filter(depId => depId !== task.id);

    return {
      ...task,
      dependencies: uniqueDependencies
    };
  });
}

/**
 * Main function to merge duplicate tasks
 * @param {Array} tasks - Array of tasks to process
 * @param {Object} options - Merge options
 * @returns {Object} - { mergedTasks: Array, mergeReport: Object, telemetryData: Array }
 */
export async function mergeTasksInTag(tasks, options = {}) {
  const {
    similarityThreshold = 0.85,
    useLLM = false,
    preserveOriginalIds = true,
    context = {},
    outputFormat = 'json'
  } = options;

  const mergeReport = {
    originalCount: tasks.length,
    mergedGroups: [],
    finalCount: 0,
    strategy: {
      hashMatches: 0,
      semanticMatches: 0,
      llmDecisions: 0
    }
  };

  let allTelemetryData = [];
  let processedTasks = [...tasks];
  const mergedIdMap = new Map();

  // Step 1: Identify potential duplicate groups
  const duplicateGroups = identifyDuplicateGroups(tasks);

  for (const group of duplicateGroups) {
    // Step 2: Check for hash matches (fast path)
    const hashGroups = new Map();
    for (const task of group) {
      const hash = generateTaskHash(task);
      if (!hashGroups.has(hash)) {
        hashGroups.set(hash, []);
      }
      hashGroups.get(hash).push(task);
    }

    // Merge exact hash matches
    for (const [hash, hashGroup] of hashGroups) {
      if (hashGroup.length > 1) {
        const mergedTask = mergeTasks(hashGroup, options);
        const removedIds = hashGroup.slice(1).map(task => task.id);
        
        // Update processed tasks
        processedTasks = processedTasks.filter(task => !removedIds.includes(task.id));
        const primaryIndex = processedTasks.findIndex(task => task.id === mergedTask.id);
        if (primaryIndex >= 0) {
          processedTasks[primaryIndex] = mergedTask;
        }

        // Track ID mappings
        for (const removedId of removedIds) {
          mergedIdMap.set(removedId, mergedTask.id);
        }

        mergeReport.mergedGroups.push({
          keptId: mergedTask.id,
          mergedFrom: removedIds,
          strategy: 'hash',
          hash
        });

        mergeReport.strategy.hashMatches++;
      }
    }

    // Step 3: Semantic similarity for remaining tasks
    const remainingInGroup = group.filter(task => 
      !mergedIdMap.has(task.id) && processedTasks.some(pt => pt.id === task.id)
    );

    if (remainingInGroup.length > 1) {
      for (let i = 0; i < remainingInGroup.length - 1; i++) {
        for (let j = i + 1; j < remainingInGroup.length; j++) {
          const taskA = remainingInGroup[i];
          const taskB = remainingInGroup[j];

          // Skip if either task was already merged
          if (mergedIdMap.has(taskA.id) || mergedIdMap.has(taskB.id)) continue;

          const similarity = calculateSemanticSimilarity(taskA, taskB);
          let shouldMerge = similarity >= similarityThreshold;
          let strategy = 'semantic';
          let reasoning = `Token similarity: ${(similarity * 100).toFixed(1)}%`;

          // Step 4: LLM fallback for borderline cases
          if (!shouldMerge && useLLM && similarity > 0.5) {
            try {
              const llmResult = await confirmMergeWithLLM(taskA, taskB, {
                context,
                outputFormat
              });
              
              if (llmResult.telemetryData) {
                allTelemetryData.push(llmResult.telemetryData);
              }

              shouldMerge = llmResult.shouldMerge && llmResult.confidence > 0.7;
              strategy = 'llm';
              reasoning = llmResult.reasoning;
              mergeReport.strategy.llmDecisions++;
            } catch (error) {
              console.warn('LLM merge decision failed:', error.message);
            }
          }

          if (shouldMerge) {
            const mergedTask = mergeTasks([taskA, taskB], options);
            const removedId = taskB.id;

            // Update processed tasks
            processedTasks = processedTasks.filter(task => task.id !== removedId);
            const primaryIndex = processedTasks.findIndex(task => task.id === mergedTask.id);
            if (primaryIndex >= 0) {
              processedTasks[primaryIndex] = mergedTask;
            }

            // Track ID mapping
            mergedIdMap.set(removedId, mergedTask.id);

            mergeReport.mergedGroups.push({
              keptId: mergedTask.id,
              mergedFrom: [removedId],
              strategy,
              reasoning,
              similarity: strategy === 'semantic' ? similarity : undefined
            });

            if (strategy === 'semantic') {
              mergeReport.strategy.semanticMatches++;
            }

            // Update remaining group to reflect the merge
            const taskBIndex = remainingInGroup.indexOf(taskB);
            if (taskBIndex >= 0) {
              remainingInGroup.splice(taskBIndex, 1);
            }
          }
        }
      }
    }
  }

  // Step 5: Update all dependencies
  processedTasks = reindexDependencies(processedTasks, mergedIdMap);

  mergeReport.finalCount = processedTasks.length;

  return {
    mergedTasks: processedTasks,
    mergeReport,
    telemetryData: allTelemetryData
  };
} 