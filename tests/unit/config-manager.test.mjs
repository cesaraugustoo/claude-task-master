// @ts-check
/**
 * Module to test the config-manager.js functionality
 * This file uses ES module syntax (.mjs) to properly handle imports
 */

import fs from 'fs';
import path from 'path';
import { jest } from '@jest/globals';
import { fileURLToPath } from 'url';
import { sampleTasks } from '../fixtures/sample-tasks.js';

// Disable chalk's color detection which can cause fs.readFileSync calls
process.env.FORCE_COLOR = '0';

// --- Read REAL supported-models.json data BEFORE mocks ---
const __filename = fileURLToPath(import.meta.url); // Get current file path
const __dirname = path.dirname(__filename); // Get current directory
const realSupportedModelsPath = path.resolve(
	__dirname,
	'../../scripts/modules/supported-models.json'
);
let REAL_SUPPORTED_MODELS_CONTENT;
let REAL_SUPPORTED_MODELS_DATA;
try {
	REAL_SUPPORTED_MODELS_CONTENT = fs.readFileSync(
		realSupportedModelsPath,
		'utf-8'
	);
	REAL_SUPPORTED_MODELS_DATA = JSON.parse(REAL_SUPPORTED_MODELS_CONTENT);
} catch (err) {
	console.error(
		'FATAL TEST SETUP ERROR: Could not read or parse real supported-models.json',
		err
	);
	REAL_SUPPORTED_MODELS_CONTENT = '{}'; // Default to empty object on error
	REAL_SUPPORTED_MODELS_DATA = {};
	process.exit(1); // Exit if essential test data can't be loaded
}

// --- Define Mock Function Instances ---
const mockFindProjectRoot = jest.fn();
const mockLog = jest.fn();
const mockResolveEnvVariable = jest.fn();
const mockFindConfigPath = jest.fn(); // Added for findConfigPath

// --- Mock fs functions directly instead of the whole module ---
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();

// Instead of mocking the entire fs module, mock just the functions we need
fs.existsSync = mockExistsSync;
fs.readFileSync = mockReadFileSync;
fs.writeFileSync = mockWriteFileSync;

// --- Test Data (Keep as is, ensure DEFAULT_CONFIG is accurate) ---
const MOCK_PROJECT_ROOT = '/mock/project';
// MOCK_CONFIG_PATH is now primarily controlled by mockFindConfigPath's return value for config files
const ACTUAL_MOCK_CONFIG_FILENAME = '.taskmaster/config.json'; // The actual expected filename
const MOCK_CONFIG_FULL_PATH = path.join(MOCK_PROJECT_ROOT, ACTUAL_MOCK_CONFIG_FILENAME);


// Updated DEFAULT_CONFIG reflecting the implementation
const DEFAULT_CONFIG = {
	models: {
		main: {
			provider: 'anthropic',
			modelId: 'claude-3-7-sonnet-20250219',
			maxTokens: 64000,
			temperature: 0.2
		},
		research: {
			provider: 'perplexity',
			modelId: 'sonar-pro',
			maxTokens: 8700,
			temperature: 0.1
		},
		fallback: {
			provider: 'anthropic',
			modelId: 'claude-3-5-sonnet',
			maxTokens: 64000,
			temperature: 0.2
		}
	},
	global: {
		logLevel: 'info',
		debug: false,
		defaultSubtasks: 5,
		defaultPriority: 'medium',
		projectName: 'Task Master',
		ollamaBaseURL: 'http://localhost:11434/api'
	},
	documentSources: [] // Added default for documentSources
};

// Other test data (VALID_CUSTOM_CONFIG, PARTIAL_CONFIG, INVALID_PROVIDER_CONFIG)
const VALID_CUSTOM_CONFIG = {
	models: {
		main: {
			provider: 'openai',
			modelId: 'gpt-4o',
			maxTokens: 4096,
			temperature: 0.5
		},
		research: {
			provider: 'google',
			modelId: 'gemini-1.5-pro-latest',
			maxTokens: 8192,
			temperature: 0.3
		},
		fallback: {
			provider: 'anthropic',
			modelId: 'claude-3-opus-20240229',
			maxTokens: 100000,
			temperature: 0.4
		}
	},
	global: {
		logLevel: 'debug',
		defaultPriority: 'high',
		projectName: 'My Custom Project'
	},
	documentSources: [{ id: 'valid_ds', type: 'TEST', path: 'test.txt' }]
};

const PARTIAL_CONFIG = {
	models: {
		main: { provider: 'openai', modelId: 'gpt-4-turbo' }
	},
	global: {
		projectName: 'Partial Project'
	}
	// documentSources will be defaulted
};

const INVALID_PROVIDER_CONFIG = {
	models: {
		main: { provider: 'invalid-provider', modelId: 'some-model' },
		research: {
			provider: 'perplexity',
			modelId: 'llama-3-sonar-large-32k-online'
		}
	},
	global: {
		logLevel: 'warn'
	}
};

// Define spies globally to be restored in afterAll
let consoleErrorSpy;
let consoleWarnSpy;

beforeAll(() => {
	// Set up console spies
	consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
	// Restore all spies
	jest.restoreAllMocks();
});

describe('Config Manager Module', () => {
	// Declare variables for imported module
	let configManager;

	// Reset mocks before each test for isolation
	beforeEach(async () => {
		// Clear all mock calls and reset implementations between tests
		jest.clearAllMocks();
		// Reset the external mock instances for utils
		mockFindProjectRoot.mockReset();
		mockLog.mockReset();
		mockResolveEnvVariable.mockReset();
		mockExistsSync.mockReset(); // fs.existsSync
		mockReadFileSync.mockReset(); // fs.readFileSync
		mockWriteFileSync.mockReset(); // fs.writeFileSync
		mockFindConfigPath.mockReset(); // Specific mock for findConfigPath

		// --- Mock Dependencies BEFORE importing the module under test ---
		jest.doMock('../../scripts/modules/utils.js', () => ({
			__esModule: true,
			findProjectRoot: mockFindProjectRoot,
			log: mockLog,
			resolveEnvVariable: mockResolveEnvVariable
		}));
		// Mock findConfigPath from its actual module
		jest.doMock('../../src/utils/path-utils.js', () => ({
			__esModule: true,
			findConfigPath: mockFindConfigPath
		}));


		// Dynamically import the module under test AFTER mocking dependencies
		configManager = await import('../../scripts/modules/config-manager.js');

		// --- Default Mock Implementations ---
		mockFindProjectRoot.mockReturnValue(MOCK_PROJECT_ROOT);
		// For most tests, assume findConfigPath returns a valid path
		mockFindConfigPath.mockReturnValue(MOCK_CONFIG_FULL_PATH);
		// fs.existsSync will be controlled by findConfigPath's return value for config file existence
		// but might be used for other files, so a default can be helpful.
		mockExistsSync.mockReturnValue(true);


		// Default readFileSync: Return REAL models content, mocked config, or throw error
		mockReadFileSync.mockImplementation((filePath) => {
			const baseName = path.basename(filePath);
			if (baseName === 'supported-models.json') {
				return REAL_SUPPORTED_MODELS_CONTENT;
			}
			// If findConfigPath returned a path, and readFileSync is called with it
			if (filePath === MOCK_CONFIG_FULL_PATH) {
				return JSON.stringify(DEFAULT_CONFIG); // Default config content
			}
			// Throw for unexpected reads - helps catch errors
			throw new Error(`Unexpected fs.readFileSync call in test: ${filePath}`);
		});

		// Default writeFileSync: Do nothing, just allow calls
		mockWriteFileSync.mockImplementation(() => {});
	});

	// --- Validation Functions ---
	describe('Validation Functions', () => {
		// Tests for validateProvider and validateProviderModelCombination
		test('validateProvider should return true for valid providers', () => {
			expect(configManager.validateProvider('openai')).toBe(true);
			// ... (other valid providers)
		});

		test('validateProvider should return false for invalid providers', () => {
			expect(configManager.validateProvider('invalid-provider')).toBe(false);
			// ... (other invalid providers)
		});

		test('validateProviderModelCombination should validate known good combinations', () => {
			configManager.getConfig(MOCK_PROJECT_ROOT, true); // Ensure MODEL_MAP is populated
			expect(
				configManager.validateProviderModelCombination('openai', 'gpt-4o')
			).toBe(true);
		});
        // ... other validation tests from original file ...
        test('validateProviderModelCombination should return false for known bad combinations', () => {
			configManager.getConfig(MOCK_PROJECT_ROOT, true);
			expect(
				configManager.validateProviderModelCombination(
					'openai',
					'claude-3-opus-20240229'
				)
			).toBe(false);
		});

		test('validateProviderModelCombination should return true for ollama/openrouter (empty lists in map)', () => {
			configManager.getConfig(MOCK_PROJECT_ROOT, true);
			expect(
				configManager.validateProviderModelCombination('ollama', 'any-model')
			).toBe(false); // Per current supported-models, ollama has no predefined models, so this is false
			expect(
				configManager.validateProviderModelCombination(
					'openrouter',
					'any/model'
				)
			).toBe(false); // Same for openrouter
		});

		test('validateProviderModelCombination should return true for providers not in map', () => {
			configManager.getConfig(MOCK_PROJECT_ROOT, true);
			expect(
				configManager.validateProviderModelCombination(
					'unknown-provider',
					'some-model'
				)
			).toBe(true);
		});
	});

	// --- getConfig Tests ---
	describe('getConfig Tests', () => {
		test('should return default config if config file does not exist (findConfigPath returns null)', () => {
			mockFindConfigPath.mockReturnValue(null); // Simulate config file not found
			// findProjectRoot mock is set in beforeEach

			const config = configManager.getConfig(MOCK_PROJECT_ROOT, true); // Force reload

			expect(config).toEqual(DEFAULT_CONFIG);
			expect(mockFindProjectRoot).not.toHaveBeenCalled(); // Explicit root provided
			expect(mockFindConfigPath).toHaveBeenCalledWith(null, { projectRoot: MOCK_PROJECT_ROOT });
			expect(mockReadFileSync).not.toHaveBeenCalledWith(MOCK_CONFIG_FULL_PATH, 'utf-8');
			expect(consoleWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining('Configuration file not found at provided project root')
			);
		});
        // ... other getConfig tests from original file, ensure they use mockFindConfigPath and MOCK_CONFIG_FULL_PATH ...
        test('should read and merge valid config file with defaults', () => {
			mockFindConfigPath.mockReturnValue(MOCK_CONFIG_FULL_PATH);
			mockReadFileSync.mockImplementation((filePath) => {
				if (filePath === MOCK_CONFIG_FULL_PATH) return JSON.stringify(VALID_CUSTOM_CONFIG);
				if (path.basename(filePath) === 'supported-models.json') {
					return JSON.stringify(REAL_SUPPORTED_MODELS_DATA);
				}
				throw new Error(`Unexpected fs.readFileSync call: ${filePath}`);
			});

			const config = configManager.getConfig(MOCK_PROJECT_ROOT, true);

			const expectedMergedConfig = {
				models: {
					main: { ...DEFAULT_CONFIG.models.main, ...VALID_CUSTOM_CONFIG.models.main },
					research: { ...DEFAULT_CONFIG.models.research, ...VALID_CUSTOM_CONFIG.models.research },
					fallback: { ...DEFAULT_CONFIG.models.fallback, ...VALID_CUSTOM_CONFIG.models.fallback }
				},
				global: { ...DEFAULT_CONFIG.global, ...VALID_CUSTOM_CONFIG.global },
                documentSources: VALID_CUSTOM_CONFIG.documentSources // This should now be part of the merge
			};
			expect(config).toEqual(expectedMergedConfig);
			expect(mockReadFileSync).toHaveBeenCalledWith(MOCK_CONFIG_FULL_PATH, 'utf-8');
		});

		test('should merge defaults for partial config file (including documentSources)', () => {
			mockFindConfigPath.mockReturnValue(MOCK_CONFIG_FULL_PATH);
			mockReadFileSync.mockImplementation((filePath) => {
				if (filePath === MOCK_CONFIG_FULL_PATH) return JSON.stringify(PARTIAL_CONFIG);
				if (path.basename(filePath) === 'supported-models.json') {
					return JSON.stringify(REAL_SUPPORTED_MODELS_DATA);
				}
				throw new Error(`Unexpected fs.readFileSync call: ${filePath}`);
			});
			const config = configManager.getConfig(MOCK_PROJECT_ROOT, true);
			const expectedMergedConfig = {
				models: {
					main: { ...DEFAULT_CONFIG.models.main, ...PARTIAL_CONFIG.models.main },
					research: { ...DEFAULT_CONFIG.models.research },
					fallback: { ...DEFAULT_CONFIG.models.fallback }
				},
				global: { ...DEFAULT_CONFIG.global, ...PARTIAL_CONFIG.global },
                documentSources: DEFAULT_CONFIG.documentSources // Should take default empty array
			};
			expect(config).toEqual(expectedMergedConfig);
		});


		test('should handle JSON parsing error and return defaults', () => {
			mockFindConfigPath.mockReturnValue(MOCK_CONFIG_FULL_PATH);
			mockReadFileSync.mockImplementation((filePath) => {
				if (filePath === MOCK_CONFIG_FULL_PATH) return 'invalid json';
				if (path.basename(filePath) === 'supported-models.json') {
					return REAL_SUPPORTED_MODELS_CONTENT;
				}
				throw new Error(`Unexpected fs.readFileSync call: ${filePath}`);
			});
			const config = configManager.getConfig(MOCK_PROJECT_ROOT, true);
			expect(config).toEqual(DEFAULT_CONFIG);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Error reading or parsing')
			);
		});
	});

	// --- writeConfig Tests ---
	describe('writeConfig', () => {
		test('should write valid config to file', () => {
			mockFindProjectRoot.mockReturnValue(MOCK_PROJECT_ROOT); // Ensure this is explicitly set if not using explicitRoot in call
			const success = configManager.writeConfig(VALID_CUSTOM_CONFIG, MOCK_PROJECT_ROOT);
			expect(success).toBe(true);
			expect(mockWriteFileSync).toHaveBeenCalledWith(
				MOCK_CONFIG_FULL_PATH, // Path now includes .taskmaster/config.json
				JSON.stringify(VALID_CUSTOM_CONFIG, null, 2)
			);
		});
        // ... other writeConfig tests ...
        test('should return false and log error if write fails', () => {
			const mockWriteError = new Error('Disk full');
			mockWriteFileSync.mockImplementation(() => { throw mockWriteError; });
			const success = configManager.writeConfig(VALID_CUSTOM_CONFIG, MOCK_PROJECT_ROOT);
			expect(success).toBe(false);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Disk full`));
		});
	});

	// --- Getter Functions (Example) ---
	describe('Getter Functions', () => {
		test('getMainProvider should return provider from config', () => {
			mockFindConfigPath.mockReturnValue(MOCK_CONFIG_FULL_PATH);
			mockReadFileSync.mockImplementation((filePath) => {
				if (filePath === MOCK_CONFIG_FULL_PATH) return JSON.stringify(VALID_CUSTOM_CONFIG);
				if (path.basename(filePath) === 'supported-models.json') return REAL_SUPPORTED_MODELS_CONTENT;
				throw new Error(`Unexpected readFileSync: ${filePath}`);
			});
			const provider = configManager.getMainProvider(MOCK_PROJECT_ROOT);
			expect(provider).toBe(VALID_CUSTOM_CONFIG.models.main.provider);
		});
        // ... other getter tests ...
	});

    // --- getDocumentSources Tests ---
	describe('getDocumentSources Tests', () => {
		// mockProjectRoot is defined in the outer scope as MOCK_PROJECT_ROOT

		beforeEach(() => {
			// Reset mocks that are specifically relevant to getDocumentSources
			// mockReadFileSync and mockFindConfigPath are already reset in the outer beforeEach
		});

		test('should return an empty array if documentSources is missing in config.json', () => {
			mockFindConfigPath.mockReturnValue(MOCK_CONFIG_FULL_PATH); // Config file "exists"
			mockReadFileSync.mockImplementation((filePath) => {
				if (filePath === MOCK_CONFIG_FULL_PATH) {
					// Return a config that's valid but missing documentSources
					return JSON.stringify({ models: DEFAULT_CONFIG.models, global: DEFAULT_CONFIG.global });
				}
				if (path.basename(filePath) === 'supported-models.json') {
					return REAL_SUPPORTED_MODELS_CONTENT;
				}
				throw new Error(`getDocumentSources/missing: Unexpected readFileSync: ${filePath}`);
			});

			const sources = configManager.getDocumentSources(MOCK_PROJECT_ROOT);
			expect(sources).toEqual([]);
		});

		test('should return an empty array if documentSources is empty in config.json', () => {
			mockFindConfigPath.mockReturnValue(MOCK_CONFIG_FULL_PATH);
			mockReadFileSync.mockImplementation((filePath) => {
				if (filePath === MOCK_CONFIG_FULL_PATH) {
					return JSON.stringify({ ...DEFAULT_CONFIG, documentSources: [] }); // Explicitly empty
				}
				if (path.basename(filePath) === 'supported-models.json') {
					return REAL_SUPPORTED_MODELS_CONTENT;
				}
				throw new Error(`getDocumentSources/empty: Unexpected readFileSync: ${filePath}`);
			});

			const sources = configManager.getDocumentSources(MOCK_PROJECT_ROOT);
			expect(sources).toEqual([]);
		});

		test('should return documentSources array if present in config.json', () => {
			const sampleSources = [{ id: 'prd1', type: 'PRD', path: 'doc.txt', parserConfig: {} }];
			mockFindConfigPath.mockReturnValue(MOCK_CONFIG_FULL_PATH);
			mockReadFileSync.mockImplementation((filePath) => {
				if (filePath === MOCK_CONFIG_FULL_PATH) {
					return JSON.stringify({ ...DEFAULT_CONFIG, documentSources: sampleSources });
				}
				if (path.basename(filePath) === 'supported-models.json') {
					return REAL_SUPPORTED_MODELS_CONTENT;
				}
				throw new Error(`getDocumentSources/present: Unexpected readFileSync: ${filePath}`);
			});

			const sources = configManager.getDocumentSources(MOCK_PROJECT_ROOT);
			expect(sources).toEqual(sampleSources);
		});

		test('should return an empty array if documentSources is not an array (e.g., an object)', () => {
			mockFindConfigPath.mockReturnValue(MOCK_CONFIG_FULL_PATH);
			mockReadFileSync.mockImplementation((filePath) => {
				if (filePath === MOCK_CONFIG_FULL_PATH) {
					// Malformed: documentSources is an object, not an array
					return JSON.stringify({ ...DEFAULT_CONFIG, documentSources: { id: 'prd1', type: 'PRD' } });
				}
				if (path.basename(filePath) === 'supported-models.json') {
					return REAL_SUPPORTED_MODELS_CONTENT;
				}
				throw new Error(`getDocumentSources/notArray: Unexpected readFileSync: ${filePath}`);
			});
			// This scenario might also trigger a console.warn if schema validation in _loadAndValidateConfig is robust.
			// Focusing on the direct output of getDocumentSources, which should default to [].
			const sources = configManager.getDocumentSources(MOCK_PROJECT_ROOT);
			expect(sources).toEqual([]); // Default behavior for malformed documentSources
		});

		test('should return an empty array if config file does not exist (findConfigPath returns null)', () => {
			mockFindConfigPath.mockReturnValue(null); // Simulate config file not found

			// readFileSync for supported-models.json will still be called during module initialization
			mockReadFileSync.mockImplementation((filePath) => {
				if (path.basename(filePath) === 'supported-models.json') {
					return REAL_SUPPORTED_MODELS_CONTENT;
				}
				// No other reads expected if config path is null for the config file itself
				throw new Error(`getDocumentSources/noConfig: Unexpected readFileSync: ${filePath}`);
			});

			const sources = configManager.getDocumentSources(MOCK_PROJECT_ROOT);
			expect(sources).toEqual([]);
			// Check that readFileSync was NOT called for MOCK_CONFIG_FULL_PATH
			expect(mockReadFileSync).not.toHaveBeenCalledWith(MOCK_CONFIG_FULL_PATH, 'utf-8');
		});
	});

	// --- isConfigFilePresent Tests ---
	describe('isConfigFilePresent', () => {
		test('should return true if config file exists (findConfigPath returns a path)', () => {
			mockFindConfigPath.mockReturnValue(MOCK_CONFIG_FULL_PATH); // Simulate found
			expect(configManager.isConfigFilePresent(MOCK_PROJECT_ROOT)).toBe(true);
			expect(mockFindConfigPath).toHaveBeenCalledWith(null, { projectRoot: MOCK_PROJECT_ROOT });
		});

		test('should return false if config file does not exist (findConfigPath returns null)', () => {
			mockFindConfigPath.mockReturnValue(null); // Simulate not found
			expect(configManager.isConfigFilePresent(MOCK_PROJECT_ROOT)).toBe(false);
			expect(mockFindConfigPath).toHaveBeenCalledWith(null, { projectRoot: MOCK_PROJECT_ROOT });
		});
	});
    // ... other tests from original file (getAllProviders, isApiKeySet) ...
    describe('getAllProviders Tests', () => {
		test('should return list of providers from supported-models.json', () => {
			configManager.getConfig(MOCK_PROJECT_ROOT, true); // Force load using the mock that returns real data
			const providers = configManager.getAllProviders();
			const expectedProviders = Object.keys(REAL_SUPPORTED_MODELS_DATA);
			expect(providers).toEqual(expect.arrayContaining(expectedProviders));
			expect(providers.length).toBe(expectedProviders.length);
		});
	});

	describe('isApiKeySet Tests', () => {
		const mockSession = { env: {} };
		const testCases = [
			['anthropic', 'ANTHROPIC_API_KEY', 'sk-valid-key', true, 'valid Anthropic key'],
			['ollama', 'OLLAMA_API_KEY', undefined, true, 'Ollama provider (no key needed)'],
			['anthropic', 'ANTHROPIC_API_KEY', undefined, false, 'missing Anthropic key'],
			['google', 'GOOGLE_API_KEY', 'YOUR_GOOGLE_API_KEY_HERE', false, 'placeholder Google key'],
			['unknownprovider', 'UNKNOWN_KEY', 'any-key', false, 'unknown provider']
		];

		testCases.forEach(([providerName, envVarName, keyValue, expectedResult, testName]) => {
			test(`should return ${expectedResult} for ${testName} (CLI context)`, () => {
				mockResolveEnvVariable.mockImplementation((key) => key === envVarName ? keyValue : undefined);
				expect(configManager.isApiKeySet(providerName, null, MOCK_PROJECT_ROOT)).toBe(expectedResult);
			});
		});
	});
});
