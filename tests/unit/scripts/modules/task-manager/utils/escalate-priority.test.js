import { 
  escalateTaskPriority, 
  escalateAllTasks, 
  getMaxPriority, 
  isPriorityHigher, 
  escalateAfterMerge 
} from '../../../../../../scripts/modules/task-manager/utils/escalate-priority.js';

describe('Priority Escalation Utilities', () => {

  describe('escalateTaskPriority', () => {
    
    it('should return medium priority for empty/invalid task', () => {
      expect(escalateTaskPriority(null).priority).toBe('medium');
      expect(escalateTaskPriority(undefined).priority).toBe('medium');
      expect(escalateTaskPriority({}).priority).toBe('medium');
    });

    describe('Base Priority Rules by Document Type', () => {
      it('should assign high priority to PRD tasks', () => {
        const task = { sourceDocumentType: 'PRD' };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('high');
        expect(result.escalationReason).toContain("Base priority 'high' from document type 'PRD'");
      });

      it('should assign medium priority to UX_SPEC tasks', () => {
        const task = { sourceDocumentType: 'UX_SPEC' };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('medium');
        expect(result.escalationReason).toContain("Base priority 'medium' from document type 'UX_SPEC'");
      });

      it('should assign low priority to SDD tasks', () => {
        const task = { sourceDocumentType: 'SDD' };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('low');
        expect(result.escalationReason).toContain("Base priority 'low' from document type 'SDD'");
      });

      it('should assign low priority to TECH_SPEC tasks', () => {
        const task = { sourceDocumentType: 'TECH_SPEC' };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('low');
        expect(result.escalationReason).toContain("Base priority 'low' from document type 'TECH_SPEC'");
      });

      it('should assign medium priority to unknown document types', () => {
        const task = { sourceDocumentType: 'UNKNOWN_TYPE' };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('medium');
        expect(result.escalationReason).toContain("Base priority 'medium' from document type 'UNKNOWN_TYPE'");
      });
    });

    describe('Escalation Triggers', () => {
      it('should escalate tasks with substantial test strategy', () => {
        const task = {
          sourceDocumentType: 'SDD', // starts as low
          testStrategy: 'This is a comprehensive test strategy with detailed steps and verification criteria'
        };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('medium'); // escalated from low
        expect(result.escalationReason).toContain('testStrategy present - indicates testable/production item');
      });

      it('should not escalate tasks with trivial test strategy', () => {
        const task = {
          sourceDocumentType: 'SDD', // starts as low
          testStrategy: 'Test it'
        };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('low'); // no escalation
      });

      it('should escalate tasks with performance goals', () => {
        const task = {
          sourceDocumentType: 'SDD', // starts as low
          performanceGoal: 'Response time < 200ms'
        };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('medium'); // escalated from low
        expect(result.escalationReason).toContain('performanceGoal present - critical or SLO task');
      });

      it('should escalate tasks with reliability targets', () => {
        const task = {
          sourceDocumentType: 'SDD', // starts as low
          reliabilityTarget: '99.9% uptime'
        };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('medium'); // escalated from low
        expect(result.escalationReason).toContain('reliabilityTarget present - critical or SLO task');
      });

      it('should escalate UX_SPEC + presentation layer tasks to medium', () => {
        const task = {
          sourceDocumentType: 'UX_SPEC', // starts as medium
          layer: 'presentation'
        };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('medium'); // maintained medium
        expect(result.escalationReason).toContain('UX_SPEC + presentation layer - user-facing UI task');
      });

      it('should escalate epic tasks to high priority', () => {
        const task = {
          sourceDocumentType: 'UX_SPEC', // starts as medium
          epicId: 'EPIC-AUTH',
          title: 'Epic: User Authentication System'
        };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('high'); // escalated to high
        expect(result.escalationReason).toContain('Epic-level task from PRD - core feature');
      });

      it('should escalate security/authentication tasks', () => {
        const task = {
          sourceDocumentType: 'SDD', // starts as low
          title: 'Implement user authentication',
          description: 'Build secure login system with encryption'
        };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('medium'); // escalated from low
        expect(result.escalationReason).toContain('Security/authentication task - critical for system safety');
      });

      it('should escalate infrastructure tasks with performance goals', () => {
        const task = {
          sourceDocumentType: 'SDD', // starts as low
          layer: 'infra',
          performanceGoal: 'Handle 1000 RPS'
        };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('medium'); // escalated from low
        expect(result.escalationReason).toContain('Infrastructure task with performance requirements');
      });

      it('should apply multiple escalations cumulatively', () => {
        const task = {
          sourceDocumentType: 'SDD', // starts as low
          testStrategy: 'Comprehensive testing strategy with detailed verification',
          performanceGoal: 'Response time < 100ms',
          title: 'Implement authentication service'
        };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('high'); // escalated multiple times: low -> medium -> high -> high
        expect(result.escalationReason).toContain('testStrategy present');
        expect(result.escalationReason).toContain('performanceGoal present');
        expect(result.escalationReason).toContain('Security/authentication task');
      });
    });

    describe('Demotion Rules', () => {
      it('should demote TECH_SPEC tasks without performance goals', () => {
        const task = {
          sourceDocumentType: 'TECH_SPEC', // starts as low, but rule enforces low
          title: 'Some technical implementation'
        };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('low');
        expect(result.escalationReason).toContain('Tech/SDD task without performance goals - demoted to low');
      });

      it('should demote tasks with very short descriptions', () => {
        const task = {
          sourceDocumentType: 'PRD', // starts as high
          description: 'Do it' // very short
        };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('low'); // demoted to low
        expect(result.escalationReason).toContain('Very short description - possibly incomplete task');
      });

      it('should demote refactor/documentation tasks without dependencies', () => {
        const task = {
          sourceDocumentType: 'PRD', // starts as high
          title: 'Refactor user service',
          description: 'Clean up the user service code',
          dependencies: [] // no dependencies
        };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('low'); // demoted to low
        expect(result.escalationReason).toContain('Refactor/documentation task without dependencies - maintenance level');
      });

      it('should not demote refactor tasks with dependencies', () => {
        const task = {
          sourceDocumentType: 'PRD', // starts as high
          title: 'Refactor user service',
          description: 'Clean up the user service code',
          dependencies: [1, 2] // has dependencies
        };
        const result = escalateTaskPriority(task);
        expect(result.priority).toBe('high'); // maintains high priority
        expect(result.escalationReason).not.toContain('Refactor/documentation task without dependencies');
      });
    });
  });

  describe('escalateAllTasks', () => {
    it('should handle empty or invalid input', () => {
      expect(escalateAllTasks(null)).toBe(null);
      expect(escalateAllTasks(undefined)).toBe(undefined);
      expect(escalateAllTasks([])).toEqual([]);
    });

    it('should escalate multiple tasks and build context', () => {
      const tasks = [
        {
          id: 1,
          sourceDocumentType: 'PRD',
          sourceDocumentId: 'doc1',
          title: 'Feature A',
          priority: 'medium'
        },
        {
          id: 2,
          sourceDocumentType: 'SDD',
          sourceDocumentId: 'doc2',
          title: 'Authentication service',
          priority: 'low'
        }
      ];

      const result = escalateAllTasks(tasks);
      
      expect(result).toHaveLength(2);
      expect(result[0].priority).toBe('high'); // PRD escalated to high
      expect(result[1].priority).toBe('medium'); // SDD + auth escalated to medium
    });

    it('should only update tasks where escalation changed priority', () => {
      const tasks = [
        {
          id: 1,
          sourceDocumentType: 'UX_SPEC',
          priority: 'medium' // already correct
        }
      ];

      const result = escalateAllTasks(tasks);
      expect(result[0]).toBe(tasks[0]); // same object reference, no change
    });
  });

  describe('getMaxPriority', () => {
    it('should return the higher priority', () => {
      expect(getMaxPriority('low', 'high')).toBe('high');
      expect(getMaxPriority('high', 'low')).toBe('high');
      expect(getMaxPriority('medium', 'low')).toBe('medium');
      expect(getMaxPriority('high', 'medium')).toBe('high');
    });

    it('should handle equal priorities', () => {
      expect(getMaxPriority('medium', 'medium')).toBe('medium');
      expect(getMaxPriority('high', 'high')).toBe('high');
    });

    it('should handle invalid priorities with fallback', () => {
      expect(getMaxPriority('invalid', 'high')).toBe('high');
      expect(getMaxPriority('low', 'invalid')).toBe('medium'); // fallback for invalid
    });
  });

  describe('isPriorityHigher', () => {
    it('should correctly compare priorities', () => {
      expect(isPriorityHigher('high', 'medium')).toBe(true);
      expect(isPriorityHigher('high', 'low')).toBe(true);
      expect(isPriorityHigher('medium', 'low')).toBe(true);
      expect(isPriorityHigher('medium', 'high')).toBe(false);
      expect(isPriorityHigher('low', 'medium')).toBe(false);
      expect(isPriorityHigher('medium', 'medium')).toBe(false);
    });
  });

  describe('escalateAfterMerge', () => {
    it('should handle null/undefined input', () => {
      expect(escalateAfterMerge(null)).toBe(null);
      expect(escalateAfterMerge(undefined)).toBe(undefined);
    });

    it('should only escalate if new priority is higher', () => {
      const mergedTask = {
        sourceDocumentType: 'PRD', // would escalate to high
        priority: 'high' // already high
      };

      const result = escalateAfterMerge(mergedTask);
      expect(result.priority).toBe('high');
      expect(result.escalationReason).toBeUndefined(); // no escalation happened
    });

    it('should escalate if new priority is higher than current', () => {
      const mergedTask = {
        sourceDocumentType: 'PRD', // would escalate to high
        priority: 'medium' // current is medium
      };

      const result = escalateAfterMerge(mergedTask);
      expect(result.priority).toBe('high');
      expect(result.escalationReason).toContain("Base priority 'high' from document type 'PRD'");
    });

    it('should not escalate if new priority is lower', () => {
      const mergedTask = {
        sourceDocumentType: 'SDD', // would be low
        priority: 'high' // current is high
      };

      const result = escalateAfterMerge(mergedTask);
      expect(result.priority).toBe('high'); // maintains high
      expect(result.escalationReason).toBeUndefined(); // no escalation
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle tasks with missing fields gracefully', () => {
      const task = {
        // minimal task with only some fields
        title: 'Some task'
      };

      const result = escalateTaskPriority(task);
      expect(result.priority).toBe('medium'); // safe default
      expect(result.escalationReason).toContain("Base priority 'medium' from document type 'UNKNOWN'");
    });

    it('should handle complex escalation scenarios', () => {
      const task = {
        sourceDocumentType: 'SDD', // starts low
        testStrategy: 'Comprehensive testing with automated verification and manual checks',
        performanceGoal: 'Sub-100ms response time',
        reliabilityTarget: '99.99% uptime',
        title: 'Security authentication microservice',
        layer: 'infra'
      };

      const result = escalateTaskPriority(task);
      expect(result.priority).toBe('high'); // multiple escalations
      expect(result.escalationReason).toContain('testStrategy present');
      expect(result.escalationReason).toContain('performanceGoal present');
      expect(result.escalationReason).toContain('reliabilityTarget present');
      expect(result.escalationReason).toContain('Security/authentication task');
      expect(result.escalationReason).toContain('Infrastructure task with performance requirements');
    });

    it('should handle conflicting escalation and demotion rules', () => {
      const task = {
        sourceDocumentType: 'PRD', // starts high
        description: 'Short' // would demote to low
      };

      const result = escalateTaskPriority(task);
      expect(result.priority).toBe('low'); // demotion wins
      expect(result.escalationReason).toContain('Very short description - possibly incomplete task');
    });
  });
}); 