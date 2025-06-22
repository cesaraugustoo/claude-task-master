# 🧠 Claude Task Master – Multi-Document Support Plan

Expanding the task orchestration system to support multiple document types (PRD, SDD, UX, etc.) and derive structured, LLM-enhanced tasks from each.

---

## 🔧 Task Tree & Status

Each task includes: ID, title, dependencies (✅), and LLM-assistance potential.

---

### 1. Parsing Enhancements

#### ✅ 1.1 Extend task schema
- **Status:** ✅ Done
- **Description:** Extend the existing Zod task schema to support optional doc-type-specific fields: `layer`, `screen`, `component`, etc.
- **File:** `scripts/modules/task-manager/schemas/task.ts`
- **LLM Help:** Recommended for schema propagation and TS type safety

---

#### ✅ 1.2 Add pluggable document adapters
- **Status:** ✅ Done
- **Description:** Create a folder `document-adapters/` where each adapter (e.g., `prds.js`, `sdds.js`, `ux-spec.js`) exports:
  - `getPrePrompt(document: string): string`
  - `postProcessTasks(tasks: Task[]): Task[]`
  - `defaultTaskCountEstimate(document: string): number`
- **Affected Files:**  
  - `scripts/modules/task-manager/parse-prd.js` (rename to `parse-doc.js`)  
  - Add `document-adapters/` to repo root or `task-manager/`
- **LLM Help:** Yes, use for boilerplate adapter template

---

#### 🔜 1.3 Adapter Loader Integration
- **Description:** Modify `parseDocumentAndGenerateTasks` to:
  - Load adapter based on `documentType`
  - Use it to customize LLM prompts and task post-processing
- **Depends on:** ✅ 1.2
- **LLM Help:** Yes — ask Cursor to refactor parser to plugin-style

---

### 2. Document Classification

#### 🔜 2.1 Create document classifier
- **Description:** Add utility `classifyDocument(documentText: string)` that returns a document type + confidence.
  - Use LLM fallback (zero-shot + keyword heuristics)
- **File Suggestion:** `scripts/modules/utils/classify-document.ts`
- **LLM Help:** Definitely

---

### 3. Task Merging & Prioritization

#### 🔜 3.1 Task merger and deduper
- **Description:** Build `mergeTasks(existingTasks, newTasks)` with:
  - Title similarity check (Jaccard or cosine)
  - Optional LLM-based semantic deduplication
  - Re-indexing of IDs
- **Target File:** `scripts/modules/task-manager/merge-tasks.ts`
- **LLM Help:** Yes — useful for merge heuristics and diffing

---

### 4. Validation & Auditing

#### 🔜 4.1 Cross-document dependency validator
- **Description:** Extend current dependency checker to:
  - Detect cycles across `sourceDocumentId`s
  - Validate that all required inputs are present
- **File Suggestion:** `scripts/modules/validators/dependency-check.ts`

---

### 5. CLI / UX

#### 🔜 5.1 Add `process-docs` command
- **Description:** Wrap `process-document-hierarchy` in CLI command:
    `task-master process-docs --tag release --merge`
- **File:** `scripts/cli/commands/process-docs.ts`

---

### 6. Telemetry & Cost Control

#### 🔜 6.1 Track adapter usage
- **Description:** Enhance `generateObjectService` telemetry by adding `documentType` + adapter name in request metadata.
- **File:** `scripts/modules/ai-services-unified.js`

---

### 7. Tests & Fixtures

#### 🔜 7.1 Add fixture documents
- **Description:** Add minimal example PRD, SDD, UX specs under:
- `tests/fixtures/prd.md`
- `tests/fixtures/sdd.md`
- `tests/fixtures/ux.md`

#### 🔜 7.2 Integration test
- **Description:** Parse the hierarchy of fixtures, then assert:
- Number of tasks
- Proper sourceDocumentType tagging
- Cross-document dependencies

---

## 📦 Optional Refactors

- Rename `parse-prd.js` → `parse-doc.js`
- Wrap task JSON access behind a `taskRegistry` DAO
- Add `task-hash` field for SHA256-style dedupe tracking

---

## 📌 Status Legend

| Status       | Symbol |
|--------------|--------|
| Not started  | 🔜     |
| In progress  | ⏳     |
| Done         | ✅     |