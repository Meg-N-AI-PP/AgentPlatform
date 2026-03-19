# SYSTEM CONTEXT

You are a senior backend architect and engineer.

Generate production-ready Node.js (TypeScript) code with clean architecture.

---

# PRODUCT VISION

We are building a **multi-tenant AI Agent Platform** similar to:

* OpenAI Assistants
* Copilot Studio
* LangChain Agents

Core idea:

* Agents are configured in Dataverse
* Agents use Azure AI Foundry (Azure OpenAI) as the model
* Agents support dynamic tools (skills + MCP)
* External systems can call agents via API
* External systems can extend agents at runtime

---

# WHAT WE HAVE DONE

We already created ALL Dataverse tables and relationships.

Tables:

* Agent
* AgentVersion
* Skill
* SkillVersion
* MCPServer
* MCPTool
* AgentSkill
* AgentMCP
* ApiKey
* Conversation
* Message
* ExecutionLog

⚠️ Tenant is NOT a table.
We use a simple **tenantId (string field)** inside records.

⚠️ Do NOT generate schema or migrations.

---

# WHAT WE WANT TO BUILD NOW

We want to build **Agent Runtime Service**

This service will:

1. Load agent configuration from Dataverse
2. Build agent dynamically at runtime
3. Connect to Azure AI Foundry (Azure OpenAI)
4. Execute tools (skills + MCP)
5. Support runtime overrides
6. Expose API for external systems

---

# CORE API

POST /api/agents/:agentId/invoke

Request:

{
"input": "user message",
"overrides": {
"extraSkills": [],
"extraMCPs": [],
"promptAppend": ""
}
}

Response:

{
"output": "...",
"traceId": "..."
}

---

# ARCHITECTURE

External System
→ API Gateway
→ Agent Runtime
→ Dataverse (config)
→ Azure AI Foundry (LLM)
→ Tool Executor (skills + MCP)

---

# KEY REQUIREMENTS

## 1. Dynamic Agent Composition

At runtime:

* Load AgentVersion
* Load Skills via AgentSkill → SkillVersion
* Load MCP via AgentMCP → MCPServer → MCPTool
* Merge runtime overrides

---

## 2. Multi-tenant (IMPORTANT)

* Each record contains tenantId (string)
* All Dataverse queries MUST filter by tenantId
* tenantId is passed via request header:

x-tenant-id: <tenantId>

---

## 3. Azure AI Foundry Integration

Use Azure OpenAI SDK.

* Use deployment name (NOT raw model name)
* Support tools (function calling)

---

## 4. Tool System

### Skill types:

* HTTP API
* (optional later: internal function)

### MCP:

* External tool provider
* Call via HTTP

---

## 5. Tool Calling Loop (MANDATORY)

* Send tools to LLM
* If LLM returns tool_calls:

  * execute tools
  * append results
  * call LLM again
* Repeat until final answer

---

## 6. Runtime Overrides

Support:

* extraSkills
* extraMCPs
* promptAppend

Final agent = base config + overrides

---

## 7. Security (basic)

* API key validation (ApiKey table)
* tenant isolation via tenantId
* Allowlist for MCP endpoints (placeholder)

---

## 8. Observability

* Generate traceId per request
* Log execution (ExecutionLog table – mock OK)

---

## 9. Memory (basic)

* Accept conversationId (optional)
* Store messages (mock OK)

---

# IMPLEMENTATION REQUIREMENTS

## Tech stack:

* Node.js
* TypeScript
* Express.js
* Axios

---

## PROJECT STRUCTURE

/src
/services
dataverseService.ts
openaiClient.ts
authService.ts
/runtime
agentRuntime.ts
toolExecutor.ts
toolRegistry.ts
/routes
agent.ts
/middlewares
authMiddleware.ts
/utils
logger.ts
trace.ts
app.ts

---

# COMPONENT DETAILS

## 1. dataverseService

Functions:

* getAgent(agentId, tenantId)
* getAgentVersion(versionId, tenantId)
* getSkillsByAgentVersion(versionId, tenantId)
* getMCPServersByAgentVersion(versionId, tenantId)
* getMCPTools(serverId, tenantId)
* validateApiKey(key, tenantId)

(MUST filter by tenantId)

---

## 2. openaiClient

* Azure OpenAI configuration
* Function: callLLM(messages, tools)

---

## 3. toolRegistry

* Convert skills + MCP tools to OpenAI tool format

---

## 4. toolExecutor

* Execute HTTP tools
* Execute MCP tools
* Use axios
* Handle timeout + errors

---

## 5. agentRuntime

Function:

invokeAgent(agentId, input, overrides, tenantId)

Steps:

1. Load config (with tenantId)
2. Merge overrides
3. Build tools
4. Build messages
5. Call LLM
6. Execute tool loop
7. Return final output

---

## 6. authMiddleware

* Read x-tenant-id header
* Validate API key
* Attach tenantId to request

---

## 7. Express Route

POST /api/agents/:agentId/invoke

---

# CODING STYLE

* Clean architecture
* Small reusable functions
* Proper error handling
* Use async/await
* Add comments

---

# OUTPUT EXPECTATION

Generate FULL WORKING CODE:

* All files
* Fully wired together
* Minimal but runnable
* Clear comments

---

# FUTURE EXTENSIONS (DO NOT IMPLEMENT YET)

* Streaming response
* Queue-based processing (RabbitMQ)
* Tool caching
* Evaluation system
* Multi-agent orchestration

---

# IMPORTANT

* DO NOT overcomplicate
* Focus on working runtime
* Code should be extensible
