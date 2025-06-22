🚩 **Current State of Multi-Document Support**

1.  Parsing Pipeline  
    • Core function `parseDocumentAndGenerateTasks` (```scripts/modules/task-manager/parse-prd.js```) already accepts  
      – `documentType` (PRD, DESIGN_DOC, …)  
      – `documentId` + parent-task context  
      – `force / append / research` flags.  
    • It validates an LLM response against a **generic Zod task schema** and writes results into `.taskmaster/tasks/tasks.json` under the active **tag**.

2.  Hierarchical Orchestration  
    • `process-document-hierarchy.js` reads `documentSources` from `.taskmaster/config.json`, topologically sorts them by `parentId`, then calls the core parser for each source, propagating parent-task context and managing ID ranges.  
    • This allows nested documents (PRD → child specs) to cascade into a single tag.

3.  Storage Model  
    • Tasks are stored per-tag:  
      ```json
      {
        "master": {
          "tasks": [ { id, title, description, sourceDocumentId, sourceDocumentType, … }, … ],
          "metadata": { … }
        }
      }
      ```  
    • Each task keeps `sourceDocumentId` / `sourceDocumentType`, giving us a hook for later filtering or grouping.

4.  LLM Abstraction  
    • All AI calls go through `generateObjectService` in ```scripts/modules/ai-services-unified.js``` with pluggable providers, automatic telemetry, retries, etc.  
    • The caller passes `role: 'main' | 'research'` and is free to change models per request.

5.  CLI / MCP Integration  
    • Direct function `parseDocumentDirect` plus an MCP tool already expose the generic parser.  
    • However, CLI wrappers still use the older `task-master parse-prd` naming; UX for multi-doc parsing is embryonic.

---

### 🕳️ Gap Analysis

| Capability | Exists | Missing / Weak |
|------------|--------|----------------|
| Generic document parser accepting `documentType` | ✅ | — |
| Document hierarchy processing (parent/child) | ✅ (`process-document-hierarchy`) | Needs CLI/MCP entry point & config docs |
| Multiple doc-type schemas | ⚠️ Single task schema only | No type-specific adapters (e.g., SDD may need “layers”, UX spec may need “screens”) |
| Automatic document classification | ❌ | Currently relies on explicit config `documentSources[].type` |
| Task merging / deduping across docs | ❌ | Append/force modes only; no semantic merge or priority reconciliation |
| Cross-doc dependency validation | Partial (simple ID checks) | Lacks global cycle detection & inter-doc consistency audit |
| Prioritization strategies (product → feature → tech) | ❌ | All generated tasks default to `medium` priority |
| Tests for multi-doc flow | ❌ | Unit/integration tests cover single-PRD path only |
| CLI UX & Docs | ⚠️ | No `task-master process-docs` command, README still PRD-centric |

Potential bottlenecks / constraints  
• **ID collisions** when multiple branches/tags parse different hierarchies.  
• **Large documents** may exceed token limits—needs chunking or hybrid summarization.  
• **Schema drift**: adding new fields to tasks affects dozens of helpers, markdown generators, and UI.

---

### 🛠️ Proposed Task Tree to Enable Full Multi-Source Parsing

(IDs are illustrative; dependencies use ✅ syntax)

1.  Parsing Enhancements  
    1.1 Extend task Zod schema with optional doc-type-specific fields (layer, screen, component, etc.)  
    1.2 Add pluggable “document adapters”: `prds.js`, `sdds.js`, `ux-spec.js`, … each provides:  
        • additional system prompt snippets  
        • default `numTasks` heuristic  
        • post-processing hooks (e.g., map “screen” to UI subtasks)  
    1.3 Refactor `parseDocumentAndGenerateTasks` to load adapter by `documentType`. ✅ 1.1  
    1.4 Implement streaming / chunked reading for very large docs.

2.  Document Classification  
    2.1 Create `classify-document` utility (LLM + regex fallback) that inspects a file and outputs probable doc type & confidence.  
    2.2 If `documentSources[].type` is `"auto"`, classification runs before parsing.  
    2.3 Wire this into `process-document-hierarchy`. ✅ 2.1

3.  Task Merging & Prioritization  
    3.1 Build `merge-tasks` module: detects duplicates (title + hash, semantic similarity), consolidates, and re-indexes IDs.  
    3.2 Introduce priority escalation rules (product-level → high, tech-detail → low unless inherited).  
    3.3 Add CLI/MCP flag `--merge` to hierarchy processor. ✅ 3.1

4.  Validation & Auditing  
    4.1 Extend dependency validator to span multiple sourceDocumentIds and detect cycles across docs.  
    4.2 Add `lint-tasks` command that checks for orphan tasks, missing testStrategy, empty details.  
    4.3 Unit tests covering merge, validation, and adapter-specific parsing.

5.  CLI / MCP Surface  
    5.1 New command `task-master process-docs [--tag xxx] [--force|--append]` → calls `process-document-hierarchy`.  
    5.2 Update help, README, and examples to showcase PRD + SDD + UX flow.  
    5.3 Provide template `.taskmaster/config.json` with sample `documentSources`.

6.  Telemetry & Cost Tracking  
    6.1 Enhance `generateObjectService` to tag telemetry with `documentType` and adapter name for better analytics.

7.  Tests & Examples  
    7.1 Add fixture docs (mini PRD, SDD, UX spec) under `tests/fixtures/`.  
    7.2 Integration test: run `process-docs` and assert layered task counts, sourceDocumentType distribution, and dependency validity.  
    7.3 Update continuous-integration scripts.

---

### 🏗️ Architectural Suggestions

• **Adapter Pattern**: keep `documentType`-specific logic in its own folder `task-manager/document-adapters/`, each exporting `{ prePrompt, postProcess }`. Makes future additions (e.g., RFCs, compliance docs) trivial.

• **Central Task Registry**: wrap tasks.json access in a small DAO to abstract tag & merging logic; shields rest of code from file-format changes.

• **Semantic Merge Layer**: consider storing SHA-256 of (title + description) to quickly identify duplicates before invoking heavier LLM dedupe.

• **Chunked LLM Calls**: expose a utility that splits very large docs, runs partial parsing, then merges sub-tasks—avoids token overflow and keeps costs predictable.

• **Unified CLI Verb Nomenclature**: move from `parse-prd` to generic `parse-doc`, but preserve aliases for backward compatibility.