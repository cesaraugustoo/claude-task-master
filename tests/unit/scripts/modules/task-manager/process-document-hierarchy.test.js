import { jest } from '@jest/globals'; // Import jest global

// Mock dependencies first
jest.mock('../../../../../scripts/modules/config-manager.js');
jest.mock('../../../../../scripts/modules/utils.js');
jest.mock('../../../../../scripts/modules/task-manager/parse-prd.js');
jest.mock('../../../../../scripts/modules/task-manager/utils/classify-document.js');
jest.mock('fs');

// Declare variables for modules that will be imported dynamically
let processDocumentHierarchy;
let configManager;
let utils;
let taskParser; // This is parseDocumentAndGenerateTasks
let classifyDocument;
let fs;
let path;

// Default mock implementations for utils.log
const mockLogImpl = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    success: jest.fn(),
};

beforeAll(async () => {
    // Dynamically import modules after mocks are set up
    utils = await import('../../../../../scripts/modules/utils.js');
    // Now that utils is imported, we can set up its mock implementations
    utils.log.mockImplementation((level, ...args) => mockLogImpl[level](...args));
    utils.readJSON.mockImplementation((filePath) => {
        if (filePath.endsWith('tasks.json')) {
            return {};
        }
        return {};
    });

    processDocumentHierarchy = (await import('../../../../../scripts/modules/task-manager/process-document-hierarchy.js')).default;
    configManager = await import('../../../../../scripts/modules/config-manager.js');
    taskParser = await import('../../../../../scripts/modules/task-manager/parse-prd.js');
    classifyDocument = await import('../../../../../scripts/modules/task-manager/utils/classify-document.js');
    fs = (await import('fs')).default; // fs is often default export when mocked or actual
    path = (await import('path')).default; // path is also often default
});


describe('processDocumentHierarchy', () => {
    let mockConfig;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogImpl.info.mockClear();
        mockLogImpl.warn.mockClear();
        mockLogImpl.error.mockClear();
        mockLogImpl.debug.mockClear();
        mockLogImpl.success.mockClear();

        mockConfig = {
            documentSources: [],
            global: { defaultTag: 'master', defaultTasksPerDocument: 5 },
        };
        configManager.getConfig.mockReturnValue(mockConfig);
        taskParser.default.mockResolvedValue({
            success: true,
            generatedTasks: [],
            nextTaskId: 1
        });
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue('{}');
    });

    describe('sortDocumentSources (internal helper, tested via processDocumentHierarchy)', () => {
        // Test cases for sorting logic will be implicitly covered by testing processDocumentHierarchy
        // with different documentSource configurations.
        // For direct testing of sortDocumentSources if it were exported:
        // 1. Empty input
        // 2. Single root
        // 3. Simple parent-child
        // 4. Multi-level hierarchy
        // 5. Multiple roots
        // 6. Siblings
        // 7. Invalid parentId
        // 8. Circular dependency
    });

    describe('Main Orchestration Logic', () => {
        it('should do nothing if no documentSources are configured', async () => {
            mockConfig.documentSources = [];
            const result = await processDocumentHierarchy({ projectRoot: '/test/project' });
            expect(result.success).toBe(true);
            expect(result.message).toContain('No document sources configured');
            expect(taskParser.default).not.toHaveBeenCalled();
        });

        it('should process a single root document', async () => {
            mockConfig.documentSources = [
                { id: 'doc1', type: 'ROOT_PRD', path: 'docs/doc1.txt' },
            ];
            taskParser.default.mockResolvedValueOnce({
                success: true,
                generatedTasks: [{ id: 1, title: 'Task from doc1' }],
                nextTaskId: 2,
            });

            await processDocumentHierarchy({ projectRoot: '/test/project' });

            expect(taskParser.default).toHaveBeenCalledTimes(1);
            expect(taskParser.default).toHaveBeenCalledWith(
                path.resolve('/test/project', 'docs/doc1.txt'),
                'doc1',
                'ROOT_PRD',
                path.join('/test/project', '.taskmaster', 'tasks', 'tasks.json'),
                5,
                expect.objectContaining({
                    projectRoot: '/test/project',
                    tag: 'master',
                    currentTaskStartId: 1,
                    parentTasksContext: [],
                })
            );
            expect(mockLogImpl.success).toHaveBeenCalledWith(expect.stringContaining('Successfully processed document doc1.'));
        });

        it('should process documents in parent-child order', async () => {
            mockConfig.documentSources = [
                { id: 'child1', type: 'FEATURE_PRD', path: 'docs/child1.txt', parentId: 'root1' },
                { id: 'root1', type: 'PRODUCT_PRD', path: 'docs/root1.txt' },
            ];
            const rootTasks = [{ id: 1, title: 'Task from root1', sourceDocumentId: 'root1' }];
            taskParser.default
                .mockResolvedValueOnce({ // For root1
                    success: true,
                    generatedTasks: rootTasks,
                    nextTaskId: 2,
                })
                .mockResolvedValueOnce({ // For child1
                    success: true,
                    generatedTasks: [{ id: 2, title: 'Task from child1', sourceDocumentId: 'child1' }],
                    nextTaskId: 3,
                });

            await processDocumentHierarchy({ projectRoot: '/test/project' });

            expect(taskParser.default).toHaveBeenCalledTimes(2);
            // Check root1 call
            expect(taskParser.default.mock.calls[0][1]).toBe('root1');
            expect(taskParser.default.mock.calls[0][5].parentTasksContext).toEqual([]);
            expect(taskParser.default.mock.calls[0][5].currentTaskStartId).toBe(1);

            expect(taskParser.default.mock.calls[1][1]).toBe('child1');
            expect(taskParser.default.mock.calls[1][5].parentTasksContext).toEqual(rootTasks);
            expect(taskParser.default.mock.calls[1][5].currentTaskStartId).toBe(2);
        });

        it('should handle multi-level hierarchy', async () => {
            mockConfig.documentSources = [
                { id: 'grandchild1', type: 'SPEC', path: 'spec.txt', parentId: 'child1' },
                { id: 'child1', type: 'FEATURE', path: 'child.txt', parentId: 'root1' },
                { id: 'root1', type: 'PRODUCT', path: 'root.txt' },
            ];
            const rootTasks = [{ id: 1, title: 'RTask1', sourceDocumentId: 'root1' }];
            const childTasks = [{ id: 2, title: 'CTask1', sourceDocumentId: 'child1' }];
            taskParser.default
                .mockResolvedValueOnce({ success: true, generatedTasks: rootTasks, nextTaskId: 2 }) // root1
                .mockResolvedValueOnce({ success: true, generatedTasks: childTasks, nextTaskId: 3 }) // child1
                .mockResolvedValueOnce({ success: true, generatedTasks: [{id: 3, title: 'GCTask1'}], nextTaskId: 4 }); // grandchild1

            await processDocumentHierarchy({ projectRoot: '/test/project' });

            expect(taskParser.default).toHaveBeenCalledTimes(3);
            expect(taskParser.default.mock.calls[0][1]).toBe('root1');
            expect(taskParser.default.mock.calls[1][1]).toBe('child1');
            expect(taskParser.default.mock.calls[1][5].parentTasksContext).toEqual(rootTasks);
            expect(taskParser.default.mock.calls[2][1]).toBe('grandchild1');
            expect(taskParser.default.mock.calls[2][5].parentTasksContext).toEqual(childTasks);
        });

        it('should correctly manage task IDs with --append and existing tasks', async () => {
            utils.readJSON.mockImplementation((filePath) => { // utils is now defined
                if (filePath.endsWith('tasks.json')) {
                    return {
                        master: {
                            tasks: [{ id: 1, title: "Existing Task" }],
                            metadata: { created: new Date().toISOString(), updated: new Date().toISOString() }
                        }
                    };
                }
                return {};
            });

            mockConfig.documentSources = [
                { id: 'doc1', type: 'ROOT_PRD', path: 'docs/doc1.txt' },
            ];
            taskParser.default.mockResolvedValueOnce({
                success: true,
                generatedTasks: [{ id: 2, title: 'Appended Task' }], // Expecting ID to start from 2
                nextTaskId: 3,
            });

            await processDocumentHierarchy({ projectRoot: '/test/project', append: true });

            expect(taskParser.default).toHaveBeenCalledTimes(1);
            expect(taskParser.default).toHaveBeenCalledWith(
                expect.any(String), 'doc1', expect.any(String), expect.any(String), expect.any(Number),
                expect.objectContaining({
                    append: true,
                    currentTaskStartId: 2,
                })
            );
            expect(mockLogImpl.info).toHaveBeenCalledWith(expect.stringContaining("Appending to tag 'master'. Next task ID will start from 2."));
        });

        it('should correctly manage task IDs with --force and existing tasks', async () => {
            utils.readJSON.mockImplementation((filePath) => ({ // utils is now defined
                master: { tasks: [{ id: 1, title: "Existing Task" }] }
            }));
             mockConfig.documentSources = [
                { id: 'doc1', type: 'ROOT_PRD', path: 'docs/doc1.txt' },
                { id: 'doc2', type: 'FEATURE_PRD', path: 'docs/doc2.txt', parentId: 'doc1' },
            ];
            const doc1Tasks = [{ id: 1, title: 'New Task Doc1' }];
            taskParser.default
                .mockResolvedValueOnce({ // doc1
                    success: true,
                    generatedTasks: doc1Tasks,
                    nextTaskId: 2
                })
                .mockResolvedValueOnce({ // doc2
                    success: true,
                    generatedTasks: [{ id: 2, title: 'New Task Doc2' }],
                    nextTaskId: 3,
                });

            await processDocumentHierarchy({ projectRoot: '/test/project', force: true });

            expect(taskParser.default).toHaveBeenCalledTimes(2);
            // First call (doc1) should have force: true and currentTaskStartId: 1
            expect(taskParser.default.mock.calls[0][5]).toMatchObject({
                force: true,
                append: false, // Because it's the first doc in a forced run
                currentTaskStartId: 1,
            });
            // Second call (doc2) should have force: false (as force is only for the first) and append: true
            expect(taskParser.default.mock.calls[1][5]).toMatchObject({
                force: false,
                append: true,
                currentTaskStartId: 2,
                parentTasksContext: doc1Tasks
            });
             expect(mockLogImpl.info).toHaveBeenCalledWith(expect.stringContaining("Force enabled for tag 'master'. Tasks will be overwritten. Task IDs will restart from 1."));
        });


        it('should skip a document if its path does not exist', async () => {
            mockConfig.documentSources = [
                { id: 'doc1', type: 'ROOT_PRD', path: 'docs/nonexistent.txt' },
            ];
            fs.existsSync.mockImplementation((p) => !p.endsWith('nonexistent.txt')); // fs is now defined

            await processDocumentHierarchy({ projectRoot: '/test/project' });

            expect(taskParser.default).not.toHaveBeenCalled();
            expect(mockLogImpl.warn).toHaveBeenCalledWith(expect.stringContaining('Document path not found:'));
        });

        it('should handle errors from parseDocumentAndGenerateTasks and continue if failFast is false', async () => {
            mockConfig.documentSources = [
                { id: 'doc1', type: 'ROOT_PRD', path: 'docs/doc1.txt' },
                { id: 'doc2', type: 'FEATURE_PRD', path: 'docs/doc2.txt', parentId: 'doc1' },
            ];
            taskParser.default
                .mockRejectedValueOnce(new Error("Failed to parse doc1"))
                .mockResolvedValueOnce({ success: true, generatedTasks: [], nextTaskId: 1});

            await processDocumentHierarchy({ projectRoot: '/test/project', failFast: false });

            expect(taskParser.default).toHaveBeenCalledTimes(2);
            expect(mockLogImpl.error).toHaveBeenCalledWith(expect.stringContaining('Error processing document doc1: Failed to parse doc1'));
            expect(mockLogImpl.success).toHaveBeenCalledWith(expect.stringContaining('Successfully processed document doc2.'));
        });

        it('should throw and stop processing if parseDocumentAndGenerateTasks fails and failFast is true (default)', async () => {
            mockConfig.documentSources = [
                { id: 'doc1', type: 'ROOT_PRD', path: 'docs/doc1.txt' },
                { id: 'doc2', type: 'FEATURE_PRD', path: 'docs/doc2.txt', parentId: 'doc1' },
            ];
            const parseError = new Error("Failed to parse doc1");
            taskParser.default.mockRejectedValueOnce(parseError);

            await expect(processDocumentHierarchy({ projectRoot: '/test/project' })).rejects.toThrow(parseError);

            expect(taskParser.default).toHaveBeenCalledTimes(1);
            expect(mockLogImpl.error).toHaveBeenCalledWith(expect.stringContaining('Error processing document doc1: Failed to parse doc1'));
        });

        it('should warn if a document has an invalid parentId', async () => {
            mockConfig.documentSources = [
                { id: 'doc1', type: 'ROOT_PRD', path: 'docs/doc1.txt' },
                { id: 'doc2', type: 'FEATURE_PRD', path: 'docs/doc2.txt', parentId: 'nonExistentParent' },
            ];
             taskParser.default.mockResolvedValue({ success: true, generatedTasks: [], nextTaskId: 1 });


            await processDocumentHierarchy({ projectRoot: '/test/project' });

            expect(mockLogImpl.warn).toHaveBeenCalledWith(expect.stringContaining('Document source "doc2" has an invalid parentId "nonExistentParent"'));
            expect(taskParser.default).toHaveBeenCalledTimes(2);
        });

        it('should throw error if circular dependency is detected in documentSources', async () => {
            mockConfig.documentSources = [
                { id: 'docA', path: 'a.txt', parentId: 'docB' },
                { id: 'docB', path: 'b.txt', parentId: 'docA' },
            ];
            // No need to mock taskParser.default as sorting should fail first

            await expect(processDocumentHierarchy({ projectRoot: '/test/project' })).rejects.toThrow(/Circular dependency detected/);
            expect(taskParser.default).not.toHaveBeenCalled();
        });

        it('should automatically classify document type when type is "auto"', async () => {
            // Mock document content that should classify as PRD
            const prdContent = `Product Requirements Document

Problem Statement:
Users need better authentication

User Stories:
- As a user, I want to login
- As a user, I want to reset password

Business Goals:
- Improve user experience
- Increase security`;

            fs.readFileSync.mockReturnValue(prdContent);
            classifyDocument.classifyDocument.mockResolvedValue({
                type: 'PRD',
                confidence: 0.85,
                source: 'regex'
            });

            mockConfig.documentSources = [
                { id: 'doc1', type: 'auto', path: 'docs/auto-doc.txt' },
            ];
            
            taskParser.default.mockResolvedValueOnce({
                success: true,
                generatedTasks: [{ id: 1, title: 'Task from auto-classified doc' }],
                nextTaskId: 2,
            });

            await processDocumentHierarchy({ projectRoot: '/test/project' });

            // Verify classification was called with document content
            expect(fs.readFileSync).toHaveBeenCalledWith(
                expect.stringContaining('auto-doc.txt'),
                'utf8'
            );
            expect(classifyDocument.classifyDocument).toHaveBeenCalledWith(
                prdContent,
                expect.objectContaining({
                    useLLMFallback: true, // Default behavior
                    threshold: 0.65,
                    projectRoot: '/test/project'
                })
            );

            // Verify the classified type was passed to parser, not 'auto'
            expect(taskParser.default).toHaveBeenCalledWith(
                expect.stringContaining('auto-doc.txt'),
                'doc1',
                'PRD', // Should use classified type, not 'auto'
                expect.any(String),
                expect.any(Number),
                expect.any(Object)
            );

            // Verify success logging
            expect(mockLogImpl.success).toHaveBeenCalledWith(
                expect.stringContaining(`Classified doc1 as 'PRD' (regex, 85% confidence)`)
            );
        });

        it('should handle classification failure gracefully and default to OTHER', async () => {
            const documentContent = 'Some ambiguous content';
            fs.readFileSync.mockReturnValue(documentContent);
            classifyDocument.classifyDocument.mockRejectedValue(new Error('Classification failed'));

            mockConfig.documentSources = [
                { id: 'doc1', type: 'auto', path: 'docs/auto-doc.txt' },
            ];
            
            taskParser.default.mockResolvedValueOnce({
                success: true,
                generatedTasks: [],
                nextTaskId: 1,
            });

            await processDocumentHierarchy({ projectRoot: '/test/project' });

            // Verify classification was attempted
            expect(classifyDocument.classifyDocument).toHaveBeenCalled();

            // Verify fallback to 'OTHER' type
            expect(taskParser.default).toHaveBeenCalledWith(
                expect.any(String),
                'doc1',
                'OTHER', // Should fallback to 'OTHER' on classification failure
                expect.any(String),
                expect.any(Number),
                expect.any(Object)
            );

            // Verify warning was logged
            expect(mockLogImpl.warn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to classify document doc1: Classification failed. Defaulting to \'OTHER\'.')
            );
        });

        it('should respect document-specific llmFallback setting', async () => {
            const documentContent = 'Some document content';
            fs.readFileSync.mockReturnValue(documentContent);
            classifyDocument.classifyDocument.mockResolvedValue({
                type: 'UX_SPEC',
                confidence: 0.7,
                source: 'regex'
            });

            mockConfig.documentSources = [
                { id: 'doc1', type: 'auto', path: 'docs/auto-doc.txt', llmFallback: false },
            ];
            mockConfig.global.enableLLMClassification = true; // Global setting is true
            
            taskParser.default.mockResolvedValueOnce({
                success: true,
                generatedTasks: [],
                nextTaskId: 1,
            });

            await processDocumentHierarchy({ projectRoot: '/test/project' });

            // Verify classification was called with llmFallback disabled
            expect(classifyDocument.classifyDocument).toHaveBeenCalledWith(
                documentContent,
                expect.objectContaining({
                    useLLMFallback: false, // Should respect doc-specific setting
                    threshold: 0.65,
                    projectRoot: '/test/project'
                })
            );
        });

    });
});

describe('sortDocumentSources (internal logic, tested via processDocumentHierarchy)', () => {
    // This suite is more for conceptual clarity. The actual tests are above,
    // as sortDocumentSources is not exported and its behavior is tested through the main function.
    // If it were exported, tests would look like:
    /*
    const sortDocs = requireActual('../../../../../scripts/modules/task-manager/process-document-hierarchy.js').sortDocumentSources; // if it were exported
    test('basic sorting', () => {
        const sources = [{id: 'c', parentId: 'p'}, {id: 'p'}];
        const sorted = sortDocs(sources, mockLog);
        expect(sorted.map(s=>s.id)).toEqual(['p', 'c']);
    });
    */
});
