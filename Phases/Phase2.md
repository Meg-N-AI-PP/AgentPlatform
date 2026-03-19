# Phase 2 — Hardening, Config Alignment, and Extensibility

## Goal
Take the Phase 1 runtime and make it reliable, maintainable, and ready for broader tenant onboarding after Dataverse field definitions are finalized.

This phase does **not** change the product direction. It strengthens the runtime you already built in Phase 1.

---

## Phase 2 scope

### 1. Dataverse field alignment
- Update all Dataverse service mappings based on the final table field names.
- Replace temporary/mock mapping assumptions from Phase 1.
- Validate joins and lookups for:
  - Agent → AgentVersion
  - AgentVersion → AgentSkill → SkillVersion
  - AgentVersion → AgentMCP → MCPServer → MCPTool
  - ApiKey, Conversation, Message, ExecutionLog
- Add clear mapping helpers so future field changes stay localized.

### 2. Persistence completion
Replace mock hooks with real persistence where needed:
- Store execution logs to `ExecutionLog`.
- Persist conversations to `Conversation`.
- Persist user/assistant/tool messages to `Message`.
- Load conversation history when `conversationId` is provided.

### 3. Security hardening
- Strengthen API key validation rules.
- Add key status/expiration checks if fields exist.
- Enforce MCP endpoint allowlist from configuration.
- Add outbound request validation for skill and MCP calls.
- Sanitize tool inputs and protect against unsafe payload forwarding.

### 4. Reliability improvements
- Add retry strategy for transient outbound HTTP failures.
- Add consistent timeout defaults.
- Add per-tool error normalization.
- Prevent infinite tool-call loops with max-iteration limits.
- Add fallback behavior when tools fail but the LLM can still answer.

### 5. Better runtime controls
- Add configurable limits for:
  - max tool calls per request
  - request timeout
  - message history length
  - tool execution timeout
- Add environment-driven feature flags for optional behavior.

### 6. Observability improvements
- Improve structured logs with tenantId, agentId, versionId, and traceId.
- Add execution timing for:
  - Dataverse loading
  - LLM calls
  - tool execution
  - total runtime
- Standardize log events for success, failure, and security rejection cases.

### 7. Validation and API quality
- Add request validation for route body and headers.
- Standardize API error model.
- Document expected headers and body contract.
- Add health/readiness endpoints if needed.

### 8. Test coverage
Add focused tests for the most important behavior:
- auth middleware
- tenant isolation rules
- Dataverse filtering behavior
- override merging
- tool registry generation
- tool execution error handling
- tool-calling loop termination
- route-level invoke success/failure cases

### 9. Deployment readiness
- Finalize environment variable contract.
- Add startup validation for required configuration.
- Add production-friendly npm scripts.
- Add concise deployment/run documentation.

---

## Deliverables
- Updated Dataverse integration aligned with final fields
- Real persistence for logs and conversations where required
- Hardened security and runtime safeguards
- Test coverage for core runtime flows
- Improved configuration and deployment documentation

---

## Acceptance criteria
- Runtime works correctly against the final Dataverse field structure.
- Conversation history can be stored and reloaded by `conversationId`.
- Execution logs are written consistently.
- Tool execution is bounded by timeouts and loop limits.
- Security checks reject invalid tenant/API key/MCP endpoint scenarios.
- Core runtime behavior is covered by tests.

---

## Explicitly deferred beyond Phase 2
Keep these for later roadmap phases unless priorities change:
- streaming responses
- queue-based processing with RabbitMQ
- tool result caching
- evaluation/scoring system
- multi-agent orchestration

---

## Recommended execution order inside Phase 2
1. Finalize Dataverse field mapping
2. Replace logging/message mocks with real persistence
3. Add security hardening and loop/tool limits
4. Add tests around the stabilized runtime
5. Finalize docs and deployment readiness

This order minimizes rework and ensures tests are written against the final data model.