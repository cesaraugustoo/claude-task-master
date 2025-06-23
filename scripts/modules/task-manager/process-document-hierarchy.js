// scripts/modules/task-manager/process-document-hierarchy.js
import fs from 'fs';
import path from 'path';
import { readJSON, writeJSON, log } from '../utils.js';
import parseDocumentAndGenerateTasks from './parse-prd.js'; // This will be the enhanced version
import { getConfig } from '../config-manager.js';
import { classifyDocument } from './utils/classify-document.js';

// Helper function to sort documents ensuring parents are processed before children
function sortDocumentSources(documentSources, logFn = log) {
    const sorted = [];
    const docMap = new Map(documentSources.map(doc => [doc.id, { ...doc, children: [], visited: false, visiting: false }]));

    const roots = [];
    documentSources.forEach(doc => {
        if (doc.parentId) {
            if (docMap.has(doc.parentId)) {
                docMap.get(doc.parentId).children.push(doc.id);
            } else {
                logFn('warn', `Document source "${doc.id}" has an invalid parentId "${doc.parentId}". It may be skipped or cause issues.`);
            }
        } else {
            roots.push(doc.id);
        }
    });

    function visit(docId) {
        const docNode = docMap.get(docId);

        if (!docNode) {
            logFn('warn', `Document ID "${docId}" referenced but not found in configuration. Skipping.`);
            return;
        }
        if (docNode.visited) {
            return;
        }
        if (docNode.visiting) {
            logFn('error', `Circular dependency detected involving document ID "${docId}". Aborting sort.`);
            throw new Error(`Circular dependency detected at document "${docId}"`);
        }

        docNode.visiting = true;

        // Ensure parent is visited first (though typical DAG traversal handles this, explicit check for safety)
        // Parent visiting is implicitly handled by starting from roots and then children.

        // Visit children first (for typical topological sort where dependencies are processed before dependents)
        // However, for our case, we want PARENTS processed first, then children.
        // So, we add the current node, THEN visit children.

        // The logic below is more akin to a pre-order traversal, which is what we need: process parent, then children.
        // The `roots.forEach(visit)` ensures we start correctly.

        // Add current document to sorted list
        // sorted.push(docNode); // This was the previous logic, moving it after parent check

        // The actual sorting happens by the recursive calls processing children AFTER the parent is added.
        // Let's refine the visit for clarity on pre-order traversal for parent-first processing.

        // The provided initial sort logic was:
        // 1. Add doc to sorted list
        // 2. Visit children
        // This is correct for parent-first processing.

        // sorted.push(docNode); // Add current node
        // docNode.children.forEach(childId => visit(childId)); // Then visit its children
        // docNode.visited = true;
        // docNode.visiting = false;

        // Corrected DFS for topological sort (or parent-first processing)
        // Parent would be visited (pushed to sorted) before its children are recursively called.

        // The issue with the original sort was more about how roots were handled if they also had children.
        // The structure of map and then iterating roots and calling visit is standard.

        // Let's use a standard topological sort algorithm based on Kahn's (using in-degrees) or DFS.
        // DFS approach for parent-first:
        // Add to sorted list *after* all its children have been added if we were doing task dependencies.
        // But for document processing, we need parent *before* children.

        // So, current node IS processed (pushed to sorted) before its children are.
        // The original `visit` structure was essentially correct for this.
        // Let's trace:
        // visit(root):
        //   sorted.push(root)
        //   visit(child1_of_root):
        //     sorted.push(child1_of_root)
        //     visit(grandchild1_of_child1) ...
        //   visit(child2_of_root): ...
        // This is correct.

        // The main change is ensuring `visited` and `visiting` are correctly managed.
        // Add current document to sorted list
        const { children: _children, visited: _visited, visiting: _visiting, ...docToAdd } = docNode;
        sorted.push(docToAdd);


        docNode.children.forEach(childId => {
            // Before visiting a child, ensure its parent (current docNode) is already conceptually "processed"
            // which it is, by being added to `sorted`.
            visit(childId);
        });

        docNode.visited = true;
        docNode.visiting = false;
    }

    roots.forEach(rootId => visit(rootId));


    if (sorted.length !== documentSources.length) {
        const processedIds = new Set(sorted.map(d => d.id));
        documentSources.forEach(doc => {
            if (!processedIds.has(doc.id)) {
                logFn('warn', `Document source "${doc.id}" was not included in the sorted list. It might be part of a cycle or disconnected.`);
            }
        });
    }
    // No need to map to remove temporary properties if they are not spread into docToAdd.
    return sorted;
}


async function processDocumentHierarchy(options = {}) {
    const {
        mcpLog,
        tag,
        force = false,
        append = false,
        research = false,
        escalate = false,
        session,
        projectRoot: explicitProjectRoot
    } = options;

    const projectRoot = explicitProjectRoot || process.cwd();

    const logFn = mcpLog || {
        info: (...args) => log('info', ...args),
        warn: (...args) => log('warn', ...args),
        error: (...args) => log('error', ...args),
        debug: (...args) => log('debug', ...args),
        success: (...args) => log('success', ...args),
    };

    let config;
    try {
        config = getConfig(projectRoot);
    } catch (e) {
        logFn.error(`Failed to load configuration: ${e.message}`);
        throw e; // Rethrow if config is essential and cannot be loaded
    }

    if (!config || !config.documentSources || !Array.isArray(config.documentSources) || config.documentSources.length === 0) {
        logFn.warn('No documentSources found or array is empty in .taskmaster/config.json. Nothing to process.');
        return { success: true, message: "No document sources configured.", generatedTasksByTag: {} };
    }

    const documentSources = config.documentSources;
    let sortedDocuments;
    try {
        sortedDocuments = sortDocumentSources(documentSources, logFn);
    } catch (error) {
        logFn.error(`Failed to sort document sources due to error: ${error.message}`);
        // Depending on strictness, either return an error or try to proceed with unsorted (not recommended)
        throw error; // Stop if sorting fails (e.g. circular dependency)
    }


    logFn.info(`Found ${documentSources.length} document sources. Processing ${sortedDocuments.length} in determined order...`);
    sortedDocuments.forEach((doc, index) => {
        logFn.debug(`[${index + 1}/${sortedDocuments.length}] Order: ${doc.id} (Type: ${doc.type}, Path: ${doc.path})`);
    });

    const tasksDir = path.join(projectRoot, '.taskmaster', 'tasks');
    if (!fs.existsSync(tasksDir)) {
        fs.mkdirSync(tasksDir, { recursive: true });
    }
    const tasksPath = path.join(tasksDir, 'tasks.json');

    let allGeneratedTasksByDocId = {}; // Stores tasks generated in this run, keyed by documentId -> tag -> tasks[]
    let currentTaskStartIdPerTag = {}; // Tracks next available ID for each tag.
    const generatedTasksByTagForOutput = {}; // Final aggregated tasks for output

    const targetTag = tag || config.global?.defaultTag || 'master';

    // Initialize currentTaskStartIdPerTag for the targetTag
    // This logic needs to be robust for force/append
    let existingTasksData = {};
    if (fs.existsSync(tasksPath)) {
        try {
            existingTasksData = readJSON(tasksPath) || {};
        } catch (e) {
            logFn.warn(`Could not read or parse existing tasks.json: ${e.message}. Assuming empty or will be overwritten if --force.`);
            existingTasksData = {};
        }
    }

    if (existingTasksData[targetTag] && existingTasksData[targetTag].tasks && existingTasksData[targetTag].tasks.length > 0) {
        if (append) {
            currentTaskStartIdPerTag[targetTag] = Math.max(0, ...existingTasksData[targetTag].tasks.map(t => t.id || 0)) + 1;
            logFn.info(`Appending to tag '${targetTag}'. Next task ID will start from ${currentTaskStartIdPerTag[targetTag]}.`);
        } else if (force) {
            currentTaskStartIdPerTag[targetTag] = 1;
            logFn.info(`Force enabled for tag '${targetTag}'. Tasks will be overwritten. Task IDs will restart from 1.`);
            // Actual overwrite of the tag in tasks.json will be handled by the first call to parseDocumentAndGenerateTasks with force=true
        } else {
            const message = `Tag '${targetTag}' in tasks.json already contains tasks. Use --force to overwrite or --append. Aborting.`;
            logFn.error(message);
            throw new Error(message);
        }
    } else {
        // No tasks in tag, or tag doesn't exist, or tasks.json doesn't exist/is empty
        currentTaskStartIdPerTag[targetTag] = 1;
        if (append) {
            logFn.info(`Tag '${targetTag}' is empty or does not exist. New tasks will be added starting from ID 1 (append mode).`);
        } else if (force) {
             logFn.info(`Tag '${targetTag}' is empty or does not exist. New tasks will be added starting from ID 1 (force mode).`);
        } else {
             logFn.info(`Tag '${targetTag}' is empty or does not exist. New tasks will be added starting from ID 1.`);
        }
    }


    for (let i = 0; i < sortedDocuments.length; i++) {
        const doc = sortedDocuments[i];
        logFn.info(`Processing document ${i + 1}/${sortedDocuments.length}: ${doc.id} (Path: ${doc.path}) for tag '${targetTag}'`);

        const absoluteDocPath = path.resolve(projectRoot, doc.path);
        if (!fs.existsSync(absoluteDocPath)) {
            logFn.warn(`Document path not found: ${absoluteDocPath} for document ID ${doc.id}. Skipping.`);
            continue;
        }

        // Handle automatic document classification if type is 'auto'
        let finalDocumentType = doc.type;
        if (doc.type === 'auto') {
            logFn.info(`Document ${doc.id} has type 'auto'. Attempting automatic classification...`);
            
            try {
                // Read the document content for classification
                const documentContent = fs.readFileSync(absoluteDocPath, 'utf8');
                
                // Get LLM fallback setting from config or doc-specific setting
                const useLLMFallback = doc.llmFallback !== false && config.global?.enableLLMClassification !== false;
                
                // Perform classification
                const classificationResult = await classifyDocument(documentContent, {
                    useLLMFallback,
                    threshold: config.global?.classificationThreshold || 0.65,
                    session,
                    projectRoot
                });

                finalDocumentType = classificationResult.type;
                const confidencePercent = Math.round(classificationResult.confidence * 100);
                
                logFn.success(`Classified ${doc.id} as '${finalDocumentType}' (${classificationResult.source}, ${confidencePercent}% confidence)`);
                
                // Log reasoning if available from LLM
                if (classificationResult.reasoning) {
                    logFn.debug(`Classification reasoning: ${classificationResult.reasoning}`);
                }

                // TODO: Track telemetry if available
                if (classificationResult.telemetryData) {
                    // Aggregate classification telemetry for later reporting
                }
                
            } catch (classificationError) {
                logFn.warn(`Failed to classify document ${doc.id}: ${classificationError.message}. Defaulting to 'OTHER'.`);
                finalDocumentType = 'OTHER';
            }
        }

        let parentTasksContext = [];
        if (doc.parentId) {
            const parentDocTaskSet = (allGeneratedTasksByDocId[doc.parentId] && allGeneratedTasksByDocId[doc.parentId][targetTag])
                                   ? allGeneratedTasksByDocId[doc.parentId][targetTag]
                                   : [];
            if (parentDocTaskSet.length > 0) {
                logFn.info(`Providing ${parentDocTaskSet.length} tasks from parent document '${doc.parentId}' (tag '${targetTag}') as context for '${doc.id}'.`);
            }
            parentTasksContext = parentDocTaskSet;
        }

        const numTasksToGenerate = doc.parserConfig?.numTasks || config.global?.defaultTasksPerDocument || 10;

        // Determine if this specific call to parseDocumentAndGenerateTasks should force overwrite the tag.
        // Only the *first* document processed for a specific tag in a `force` run should actually clear/overwrite that tag's task list.
        // Subsequent documents for the same tag (e.g. if processing multiple hierarchies for one tag, though unlikely here) should append.
        const shouldForceOverwriteTag = force && (!allGeneratedTasksByDocId[doc.id] || !allGeneratedTasksByDocId[doc.id][targetTag]);
        // A simpler way: force is true for the first document in the sorted list if global force is true.
        const isFirstDocumentInForcedRun = force && i === 0;


        const parseOptions = {
            mcpLog,
            session,
            projectRoot,
            force: isFirstDocumentInForcedRun, // Only the very first document processing for a tag does the actual "force" clear.
            append: !isFirstDocumentInForcedRun || append, // Subsequent docs always append to the (potentially just cleared) tag, or if global append is true.
            research,
            tag: targetTag,
            currentTaskStartId: currentTaskStartIdPerTag[targetTag],
            parentTasksContext
        };

        try {
            const result = await parseDocumentAndGenerateTasks(
                absoluteDocPath,
                doc.id,
                finalDocumentType,
                tasksPath,
                numTasksToGenerate,
                parseOptions
            );

            if (result && result.success) {
                // Store generated tasks for context of subsequent child documents
                if (!allGeneratedTasksByDocId[doc.id]) allGeneratedTasksByDocId[doc.id] = {};
                allGeneratedTasksByDocId[doc.id][targetTag] = result.generatedTasks || [];

                // Aggregate all generated tasks for this tag for the final output
                if (!generatedTasksByTagForOutput[targetTag]) generatedTasksByTagForOutput[targetTag] = [];
                generatedTasksByTagForOutput[targetTag].push(...(result.generatedTasks || []));


                currentTaskStartIdPerTag[targetTag] = result.nextTaskId;
                logFn.success(`Successfully processed document ${doc.id}. Next task ID for tag '${targetTag}' will be ${currentTaskStartIdPerTag[targetTag]}`);
                // TODO: Aggregate telemetry if needed: result.telemetryData
            } else {
                logFn.warn(`Processing document ${doc.id} for tag '${targetTag}' did not complete successfully or returned no tasks. Result: ${JSON.stringify(result)}`);
            }
        } catch (error) {
            logFn.error(`Error processing document ${doc.id} for tag '${targetTag}': ${error.message}`);
            if (options.failFast === undefined || options.failFast === true) { // Default to fail fast
                throw error;
            }
            logFn.warn(`Continuing processing despite error due to failFast=false.`);
        }
    }

    logFn.success(`Successfully processed all document sources for tag '${targetTag}'.`);
    
    // Apply priority escalation if requested
    if (escalate && generatedTasksByTagForOutput[targetTag] && generatedTasksByTagForOutput[targetTag].length > 0) {
        logFn.info(`Applying priority escalation rules to ${generatedTasksByTagForOutput[targetTag].length} tasks in tag '${targetTag}'...`);
        
        try {
            // Import escalation functions
            const { escalateAllTasks } = await import('./utils/escalate-priority.js');
            
            // Create document metadata map for escalation context
            const documentMetadataMap = {};
            documentSources.forEach(doc => {
                documentMetadataMap[doc.id] = {
                    type: doc.type,
                    path: doc.path,
                    parentId: doc.parentId
                };
            });
            
            // Prepare escalation context
            const escalationContext = {
                tagName: targetTag,
                documentMetadataMap,
                projectRoot
            };
            
            // Apply escalation to all generated tasks
            const escalatedTasks = escalateAllTasks(generatedTasksByTagForOutput[targetTag], escalationContext);
            
            // Update the tasks in the file
            const finalTasksData = readJSON(tasksPath) || {};
            if (!finalTasksData[targetTag]) {
                finalTasksData[targetTag] = { tasks: [] };
            }
            finalTasksData[targetTag].tasks = escalatedTasks;
            
            // Write back to file
            writeJSON(tasksPath, finalTasksData);
            
            // Count escalated tasks for reporting
            const escalatedCount = escalatedTasks.filter(task => task.escalationReason).length;
            if (escalatedCount > 0) {
                logFn.success(`Priority escalation applied: ${escalatedCount} tasks had their priority adjusted.`);
            } else {
                logFn.info('Priority escalation completed: No tasks required priority adjustments.');
            }
            
            // Update output to reflect escalated tasks
            generatedTasksByTagForOutput[targetTag] = escalatedTasks;
            
        } catch (escalationError) {
            logFn.warn(`Priority escalation failed: ${escalationError.message}. Tasks generated successfully without escalation.`);
        }
    }

    return {
        success: true,
        message: `All document sources processed for tag '${targetTag}'.`,
        generatedTasksByTag: generatedTasksByTagForOutput // Contains all tasks generated in this run, organized by tag.
        // aggregatedTelemetry
    };
}

export default processDocumentHierarchy;
