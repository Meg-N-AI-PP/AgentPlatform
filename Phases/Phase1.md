# Phase 1 — MVP Agent Runtime

## Goal
Deliver a minimal but production-structured **Agent Runtime Service** that works end-to-end for a multi-tenant agent invocation flow.

This phase focuses on getting the core runtime operational using the Dataverse tables that already exist, without changing schema or generating migrations.

---

## What is already done
- Dataverse tables and relationships already exist.
- Tenant isolation model is already defined via `tenantId` field on records.
- Core product direction and required runtime behavior are already defined in `Initial.md`.

---

## Phase 1 scope
Build the first working version of the runtime with these capabilities:

### 1. Project foundation
- Create the Node.js + TypeScript + Express project structure under `/src`.
- Add environment-based configuration for Dataverse, Azure OpenAI, and runtime settings.
- Add shared typing for agents, versions, tools, messages, overrides, and responses.

### 2. API and request pipeline
- Implement `POST /api/agents/:agentId/invoke`.
- Accept:
  - `input`
  - `conversationId` (optional)
  - `overrides.extraSkills`
  - `overrides.extraMCPs`
  - `overrides.promptAppend`
- Return:
  - `output`
  - `traceId`

### 3. Authentication and tenant context
- Read `x-tenant-id` from request headers.
- Read API key from request headers.
- Validate API key against Dataverse.
- Reject requests with missing or invalid tenant/API key.
- Attach `tenantId` and auth context to the request.

### 4. Dataverse configuration loading
Implement the following service methods with mandatory `tenantId` filtering:
- `getAgent(agentId, tenantId)`
- `getAgentVersion(versionId, tenantId)`
- `getSkillsByAgentVersion(versionId, tenantId)`
- `getMCPServersByAgentVersion(versionId, tenantId)`
- `getMCPTools(serverId, tenantId)`
- `validateApiKey(key, tenantId)`

### 5. Dynamic agent composition
At runtime:
- Load the agent and active version.
- Load linked skills.
- Load linked MCP servers and tools.
- Merge runtime overrides into the final tool set.
- Append `promptAppend` to the final system instructions.

### 6. Azure AI Foundry integration
- Configure Azure OpenAI client using deployment name.
- Implement a reusable `callLLM(messages, tools)` function.
- Support tool/function calling payloads.

### 7. Tool registry and execution
- Convert Skill + MCP definitions into OpenAI tool format.
- Support HTTP skill execution with Axios.
- Support MCP HTTP execution with Axios.
- Add timeout handling and structured error responses.
- Add a simple MCP endpoint allowlist placeholder.

### 8. Mandatory tool-calling loop
Implement the runtime loop:
1. Send messages + tools to the LLM.
2. If tool calls are returned:
   - execute tools
   - append tool results to messages
   - call the LLM again
3. Repeat until a final answer is produced.

### 9. Basic observability and memory
- Generate a `traceId` per request.
- Add structured logger utility.
- Add mock/non-blocking execution logging for `ExecutionLog`.
- Accept optional `conversationId`.
- Add mock/non-blocking storage hooks for conversation messages.

### 10. Error handling and readiness
- Add centralized Express error handling.
- Return safe API errors with trace IDs.
- Keep code modular and easy to extend.

---

## Deliverables
- Runnable TypeScript service under `/src`
- Express app wired with auth middleware and agent route
- Runtime services:
  - `dataverseService.ts`
  - `openaiClient.ts`
  - `authService.ts`
  - `agentRuntime.ts`
  - `toolExecutor.ts`
  - `toolRegistry.ts`
- Utility modules for logging and tracing
- `.env.example`
- Short setup/run instructions

---

## Acceptance criteria
- A request with valid `x-tenant-id` and API key can invoke an agent successfully.
- Every Dataverse lookup filters by `tenantId`.
- Base tools + runtime overrides are merged into one executable tool list.
- Azure OpenAI tool calling works in a loop until a final answer is returned.
- The response contains `output` and `traceId`.
- Basic execution logging and conversation hooks exist, even if mocked initially.

---

## Out of scope for Phase 1
- Streaming responses
- RabbitMQ / async queue processing
- Tool caching
- Evaluation framework
- Multi-agent orchestration
- Advanced retry/circuit-breaker patterns
- Full persistence implementation beyond simple hooks/mocks

---

## Important note for later field updates
Because you will update the Dataverse table fields later:
- implement clear repository/service mapping layers
- avoid hard-coding business logic deep inside controllers
- isolate Dataverse field names in one place where possible
- keep DTOs separate from external API contracts

This will reduce rework when field names and table payload shapes are finalized.
