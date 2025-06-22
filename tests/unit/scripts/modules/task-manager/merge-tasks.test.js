import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  generateTaskHash,
  normalizeTitle,
  createGroupingKey
} from '../../../../../scripts/modules/task-manager/utils/hash-task.js';
import {
  identifyDuplicateGroups,
  calculateSemanticSimilarity,
  mergeTasks,
  reindexDependencies
} from '../../../../../scripts/modules/task-manager/merge-tasks.js';

describe('Task Merging Utilities', () => {
  describe('generateTaskHash', () => {
    it('should generate consistent hashes for identical tasks', () => {
      const task1 = {
        title: 'Implement Login',
        description: 'Create login functionality',
        screen: 'LoginScreen',
        component: 'LoginForm',
        sourceDocumentType: 'UX_SPEC'
      };

      const task2 = {
        title: 'Implement Login',
        description: 'Create login functionality',
        screen: 'LoginScreen',
        component: 'LoginForm',
        sourceDocumentType: 'UX_SPEC'
      };

      const hash1 = generateTaskHash(task1);
      const hash2 = generateTaskHash(task2);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex string length
    });

    it('should generate different hashes for different tasks', () => {
      const task1 = {
        title: 'Implement Login',
        description: 'Create login functionality'
      };

      const task2 = {
        title: 'Implement Logout',
        description: 'Create logout functionality'
      };

      const hash1 = generateTaskHash(task1);
      const hash2 = generateTaskHash(task2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle missing fields gracefully', () => {
      const task = { title: 'Test Task' };
      const hash = generateTaskHash(task);
      expect(hash).toHaveLength(64);
    });
  });

  describe('normalizeTitle', () => {
    it('should normalize titles consistently', () => {
      expect(normalizeTitle('Implement User Authentication')).toBe('user authentication');
      expect(normalizeTitle('Create User Authentication Setup')).toBe('user authentication');
      expect(normalizeTitle('Build Authentication Implementation')).toBe('authentication');
    });

    it('should handle empty or invalid input', () => {
      expect(normalizeTitle('')).toBe('');
      expect(normalizeTitle(null)).toBe('');
      expect(normalizeTitle(undefined)).toBe('');
    });
  });

  describe('createGroupingKey', () => {
    it('should create consistent grouping keys', () => {
      const task1 = {
        title: 'Implement Login Page',
        screen: 'LoginScreen',
        component: 'LoginForm',
        epicId: 'AUTH-001'
      };

      const task2 = {
        title: 'Create Login Page Implementation',
        screen: 'LoginScreen',
        component: 'LoginForm',
        epicId: 'AUTH-001'
      };

      const key1 = createGroupingKey(task1);
      const key2 = createGroupingKey(task2);

      expect(key1).toBe(key2);
    });
  });

  describe('identifyDuplicateGroups', () => {
    it('should group similar tasks together', () => {
      const tasks = [
        { id: 1, title: 'Implement Login', screen: 'LoginScreen' },
        { id: 2, title: 'Create Login Implementation', screen: 'LoginScreen' },
        { id: 3, title: 'Build Dashboard', screen: 'DashboardScreen' },
        { id: 4, title: 'Setup Dashboard', screen: 'DashboardScreen' }
      ];

      const groups = identifyDuplicateGroups(tasks);
      
      expect(groups).toHaveLength(2);
      expect(groups[0]).toHaveLength(2); // Login tasks
      expect(groups[1]).toHaveLength(2); // Dashboard tasks
    });

    it('should return empty array for no duplicates', () => {
      const tasks = [
        { id: 1, title: 'Implement Login', screen: 'LoginScreen' },
        { id: 2, title: 'Build Dashboard', screen: 'DashboardScreen' }
      ];

      const groups = identifyDuplicateGroups(tasks);
      expect(groups).toHaveLength(0);
    });
  });

  describe('calculateSemanticSimilarity', () => {
    it('should calculate high similarity for similar tasks', () => {
      const taskA = {
        title: 'Implement user authentication system',
        description: 'Create login and logout functionality'
      };

      const taskB = {
        title: 'Build user authentication',
        description: 'Implement login and logout features'
      };

      const similarity = calculateSemanticSimilarity(taskA, taskB);
      expect(similarity).toBeGreaterThan(0.5); // Adjusted threshold
    });

    it('should calculate low similarity for different tasks', () => {
      const taskA = {
        title: 'Implement user authentication',
        description: 'Create login functionality'
      };

      const taskB = {
        title: 'Setup database migration',
        description: 'Create migration scripts'
      };

      const similarity = calculateSemanticSimilarity(taskA, taskB);
      expect(similarity).toBeLessThan(0.3);
    });

    it('should handle empty tasks', () => {
      const similarity = calculateSemanticSimilarity({}, {});
      expect(similarity).toBe(1); // Empty tasks are considered identical
    });
  });

  describe('mergeTasks', () => {
    it('should merge tasks correctly', () => {
      const taskGroup = [
        {
          id: 2,
          title: 'Login Implementation',
          description: 'Create login form',
          priority: 'medium',
          screen: 'LoginScreen',
          dependencies: [1],
          sourceDocumentType: 'UX_SPEC',
          sourceDocumentId: 'doc2'
        },
        {
          id: 1,
          title: 'Implement Login',
          description: 'Build login functionality',
          priority: 'high',
          screen: 'LoginScreen',
          dependencies: [],
          sourceDocumentType: 'PRD',
          sourceDocumentId: 'doc1'
        }
      ];

      const merged = mergeTasks(taskGroup);

      expect(merged.id).toBe(1); // Lowest ID kept
      expect(merged.mergedFrom).toEqual([2]);
      expect(merged.priority).toBe('high'); // Highest priority kept
      expect(merged.sourceDocumentType).toEqual(['PRD', 'UX_SPEC']);
      expect(merged.sourceDocumentId).toEqual(['doc1', 'doc2']);
      expect(merged.dependencies).toEqual([1]); // Union of dependencies
    });

    it('should handle priority upgrades', () => {
      const taskGroup = [
        { id: 1, title: 'Test', priority: 'low' },
        { id: 2, title: 'Test', priority: 'high' }
      ];

      const merged = mergeTasks(taskGroup);
      
      expect(merged.priority).toBe('high');
      expect(merged.estimationNote).toContain('Priority upgraded to \'high\' due to task merge');
    });

    it('should throw error for invalid input', () => {
      expect(() => mergeTasks([])).toThrow();
      expect(() => mergeTasks([{ id: 1 }])).toThrow();
    });
  });

  describe('reindexDependencies', () => {
    it('should update dependencies after merge', () => {
      const tasks = [
        { id: 1, dependencies: [2, 3] },
        { id: 4, dependencies: [2] },
        { id: 5, dependencies: [1, 3] }
      ];

      const mergedIdMap = new Map([[2, 1], [3, 1]]); // 2 and 3 merged into 1

      const updated = reindexDependencies(tasks, mergedIdMap);

      expect(updated[0].dependencies).toEqual([]); // Self-reference to 1 removed, duplicates removed
      expect(updated[1].dependencies).toEqual([1]);
      expect(updated[2].dependencies).toEqual([1]); // 3->1, 1 kept
    });

    it('should handle empty dependencies', () => {
      const tasks = [
        { id: 1, dependencies: [] },
        { id: 2 } // No dependencies property
      ];

      const mergedIdMap = new Map([[3, 1]]);
      const updated = reindexDependencies(tasks, mergedIdMap);

      expect(updated[0].dependencies).toEqual([]);
      expect(updated[1]).toEqual({ id: 2 });
    });
  });
}); 