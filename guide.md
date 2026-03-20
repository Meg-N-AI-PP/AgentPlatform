# Agent Runtime Service — Setup & Run Guide

This guide walks you through getting the Phase 2 Agent Runtime Service working end-to-end.

---

## Prerequisites

| Requirement | Minimum version | Notes |
|---|---|---|
| Node.js | v18+ | https://nodejs.org — install the LTS version |
| npm | v9+ | Comes with Node.js |
| Azure OpenAI resource | — | Must have a deployed model (e.g. gpt-4o) |
| Dataverse environment | — | With all `meg_*` tables already created |
| Entra ID (Azure AD) app registration | — | With Dataverse API permissions |

---

## Step 1 — Install Node.js

Download and install from https://nodejs.org/en/download

After installing, **restart your terminal** and verify:

```powershell
node -v
npm -v
```

Both commands should print a version number.

---

## Step 2 — Install dependencies

Open a terminal in the project root folder and run:

```powershell
cd "c:\Users\ADMIN\OneDrive\Desktop\AGTPP"
npm install
```

This installs Express, Axios, OpenAI SDK, TypeScript, and all other dependencies.

---

## Step 3 — Configure environment variables

1. Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

2. Open `.env` and fill in your real values:

```dotenv
# ---- Server ----
PORT=3000
NODE_ENV=development

# ---- Azure OpenAI ----
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_API_VERSION=2024-10-21
AZURE_OPENAI_DEPLOYMENT=your-deployment-name

# ---- Dataverse ----
DATAVERSE_BASE_URL=https://YOUR-ORG.crm.dynamics.com
DATAVERSE_API_VERSION=v9.2
AAD_TENANT_ID=your-entra-tenant-id
DATAVERSE_CLIENT_ID=your-app-registration-client-id
DATAVERSE_CLIENT_SECRET=your-app-registration-client-secret

# ---- Runtime settings ----
HTTP_TOOL_TIMEOUT_MS=15000
MAX_TOOL_ITERATIONS=5
MCP_ALLOWED_HOSTS=
```

### Where to get each value

| Variable | Where to find it |
|---|---|
| `AZURE_OPENAI_ENDPOINT` | Azure Portal → your OpenAI resource → Keys and Endpoint |
| `AZURE_OPENAI_API_KEY` | Same page → Key 1 or Key 2 |
| `AZURE_OPENAI_DEPLOYMENT` | Azure AI Foundry → Deployments → your deployment name |
| `DATAVERSE_BASE_URL` | Power Platform admin center → Environments → your environment URL (e.g. `https://org12345.crm.dynamics.com`) |
| `AAD_TENANT_ID` | Azure Portal → Entra ID → Overview → Tenant ID |
| `DATAVERSE_CLIENT_ID` | Azure Portal → App registrations → your app → Application (client) ID |
| `DATAVERSE_CLIENT_SECRET` | Azure Portal → App registrations → your app → Certificates & secrets → your secret value |

### Entra ID app registration setup

Your app registration must have:
1. **API permissions**: Dynamics CRM → `user_impersonation` (or Application permission if using client credentials flow)
2. **A client secret** created under Certificates & secrets
3. **The app user** must be registered in Dataverse with a security role that can read/write the `meg_*` tables

---

## Step 4 — Verify Dataverse tables exist

Ensure these tables are created in your Dataverse environment:

| # | Table | Logical name |
|---|---|---|
| 1 | Agent | `meg_magent` |
| 2 | AgentVersion | `meg_agentversion` |
| 3 | AgentSkill | `meg_agentskill` |
| 4 | Skill | `meg_magentskill` |
| 5 | SkillVersion | `meg_skillinformation` |
| 6 | AgentMCP | `meg_agentmcp` |
| 7 | MCPServer | `meg_mcpserver` |
| 8 | MCPTool | `meg_mcptool` |
| 9 | ApiKey | `meg_agentkey` |
| 10 | Conversation | `meg_conversation` |
| 11 | Message | `meg_message` |
| 12 | ExecutionLog | `meg_executionlog` |

---

## Step 5 — Create test data in Dataverse

You need at minimum these records to test the runtime:

### 5.1 Create an Agent

| Field | Value |
|---|---|
| `meg_name` | My Test Agent |
| `meg_tenantid` | `tenant-001` (any string you choose) |
| `meg_status` | `862070001` (Active) |

Note the `meg_magentid` (GUID) — you'll use it in API calls.

### 5.2 Create an AgentVersion

| Field | Value |
|---|---|
| `meg_name` | v1 |
| `meg_magent` | (lookup to the Agent you just created) |
| `meg_tenantid` | `tenant-001` (same as the agent) |
| `meg_systemprompt` | `You are a helpful assistant.` |
| `meg_model` | (your Azure OpenAI deployment name, or leave empty to use env default) |
| `statecode` | `0` (Active) |

### 5.3 Create an API Key

| Field | Value |
|---|---|
| `meg_name` | Test Key |
| `meg_key` | `test-api-key-123` (any string) |
| `meg_tenantid` | `tenant-001` |

### 5.4 (Optional) Create a Skill

If you want to test tool calling, create:

1. A **Skill** (`meg_magentskill`) record with `meg_tenantid = tenant-001`
2. A **SkillVersion** (`meg_skillinformation`) record linked to that skill, with `meg_endpoint`, `meg_method`, and `meg_inputschemas`
3. An **AgentSkill** (`meg_agentskill`) record linking your AgentVersion to that SkillVersion

### 5.5 Example: create a Power Automate flow skill

If your skill is a Power Automate flow HTTP trigger, use the values below.

#### Create the Skill (`meg_magentskill`)

| Field | Value |
|---|---|
| `meg_name` | Flow Skill |
| `meg_tenantid` | `tenant-001` |
| `meg_description` | `Calls a Power Automate flow and sends the user content to it.` |
| `meg_type` | `HTTP API` or the option value that maps to HTTP |

#### Create the SkillVersion (`meg_skillinformation`)

Link it to the Skill above, then use these values:

| Field | Value |
|---|---|
| `meg_name` | Flow Skill v1 |
| `meg_magentskill` | (lookup to Flow Skill) |
| `meg_endpoint` | `https://default7884ae45f31243978fa38c499afb24.b2.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/22a69f6c001a455eace1650b1a6d9628/triggers/manual/paths/invoke/SE?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=NmHs8ZdBwpFX-FXIsU2UqNEaUtCl_dirzPUrDWgLOaY` |
| `meg_method` | `POST` |
| `meg_authconfig` | see JSON below |
| `meg_inputschemas` | see JSON below |
| `meg_outputschemas` | optional |

Use this JSON for `meg_authconfig`:

```json
{
  "headers": {
    "x-api-key": "445544",
    "Content-Type": "application/json"
  }
}
```

If your Dataverse form stores auth config as a flat object instead of nested `headers`, this also works:

```json
{
  "x-api-key": "445544",
  "Content-Type": "application/json"
}
```

Use this JSON for `meg_inputschemas`:

```json
{
  "type": "object",
  "properties": {
    "content": {
      "type": "string"
    }
  }
}
```

#### Create the AgentSkill (`meg_agentskill`)

| Field | Value |
|---|---|
| `meg_name` | Flow Skill Link |
| `meg_agentinformation` | (lookup to your AgentVersion) |
| `meg_skill` | (lookup to Flow Skill v1) |
| `meg_order` | `1` |
| `meg_isrequired` | `No` |

#### Important: update the agent system prompt

To help the model decide to call the tool, make the AgentVersion system prompt explicit. Example:

```text
You are a helpful assistant.
When the user asks you to send content to the flow, summarize text with the flow, or run the flow skill, you must call the Flow Skill.
When you call the Flow Skill, pass the user's text into the `content` field.
Do not answer from your own knowledge if the user is explicitly asking to use the flow.
```

Without this instruction, the model may answer directly and never call the skill.

#### Do you need to restart the backend after adding a skill?

No, not for Dataverse data changes.

- If you create or update `Skill`, `SkillVersion`, `AgentSkill`, `Agent`, or `AgentVersion` records in Dataverse, the runtime reads them again on each new invoke request.
- You only need to restart the backend if you changed application code or changed `.env` values.
- If the chat UI is already open, you can usually just send a new message and test the skill immediately.

---

## Step 6 — Start the server

### Development mode (hot reload)

```powershell
npm run dev
```

### Production mode

```powershell
npm run build
npm run start
```

You should see output like:

```
{"timestamp":"...","level":"info","message":"Agent Runtime Service started","metadata":{"port":3000,"nodeEnv":"development"}}
```

---

## Step 7 — Test the API

### Health check

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health" -Method GET
```

Expected: `{ "status": "ok" }`

### Invoke an agent

```powershell
$headers = @{
    "Content-Type"  = "application/json"
    "x-tenant-id"   = "tenant-001"
    "x-api-key"     = "test-api-key-123"
}

$body = @{
    input = "Hello, what can you do?"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/agents/YOUR_AGENT_GUID/invoke" -Method POST -Headers $headers -Body $body
```

Replace `YOUR_AGENT_GUID` with the `meg_magentid` from Step 5.1.

Expected response:

```json
{
  "output": "Hello! I'm a helpful assistant...",
  "traceId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

### Invoke with conversation memory

```powershell
$body = @{
    input = "Remember my name is Alex"
    conversationId = "YOUR_CONVERSATION_GUID"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/agents/YOUR_AGENT_GUID/invoke" -Method POST -Headers $headers -Body $body
```

If you omit `conversationId`, each call is stateless. If you provide one, messages are persisted in Dataverse and loaded on subsequent calls.

### Test tool calling with the skill

After creating the Skill, SkillVersion, and AgentSkill records, send a prompt that strongly encourages tool usage.

```powershell
$headers = @{
  "Content-Type" = "application/json"
  "x-tenant-id"  = "tenant-001"
  "x-api-key"    = "test-api-key-123"
}

$body = @{
  input = "Use the Flow Skill and send this content: hello from the flow skill test. Then tell me exactly what the flow returned."
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/agents/YOUR_AGENT_GUID/invoke" -Method POST -Headers $headers -Body $body
```

Expected behavior:

1. The model sees the registered tool
2. The runtime executes the HTTP request to your Power Automate flow URL
3. The tool result is appended back into the chat loop
4. The final response mentions the data returned by the flow

If you want to test from the chat UI instead, use a message like:

```text
Use the Flow Skill and send this content: hello from the UI flow test.
```

### How to confirm the skill was actually used

Use these checks:

| Check | What to look for |
|---|---|
| Final answer | It should mention the flow result, not just a normal chat reply |
| Execution log | A new `meg_executionlog` row should be created |
| Skill configuration | `meg_agentskill` must point to the active AgentVersion and the correct SkillVersion |
| Input schema | Must be valid JSON schema; invalid JSON can prevent tool registration |
| Endpoint | `meg_endpoint` must be reachable from the backend machine |

### If the model does not call the skill

Try these fixes:

1. Make the system prompt more explicit about when to use the skill
2. Ask the user prompt to explicitly say `use the Flow Skill`
3. Confirm the AgentVersion used by the agent is the active one
4. Confirm `meg_inputschemas` contains valid JSON
5. Confirm the flow URL returns `200 OK`
6. Confirm `meg_authconfig` contains the exact `x-api-key` value required by the flow

---

## Step 8 — Verify it works

Check these to confirm everything is wired correctly:

| Check | How |
|---|---|
| API key validation | Use a wrong key → should get 401 |
| Tenant isolation | Use a different tenant ID → should get 401 |
| Agent not found | Use a random GUID → should get 404 |
| Agent not active | Set agent status to Draft (862070000) → should get 400 |
| Execution logs | Check `meg_executionlog` table in Dataverse for new records |
| Conversation persistence | Check `meg_conversation` and `meg_message` tables after using `conversationId` |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `npm` not found | Install Node.js and restart your terminal |
| `Missing required environment variable: X` | Check your `.env` file — all Azure OpenAI and Dataverse variables are required |
| 401 from Dataverse | Verify your app registration has Dataverse permissions and the client secret is correct |
| 401 from the API | Ensure your `x-api-key` and `x-tenant-id` headers match a record in `meg_agentkey` |
| No active agent version | Ensure `meg_agentversion` has `statecode = 0` and its `meg_magent` lookup points to your agent |
| Azure OpenAI errors | Verify your deployment exists and the endpoint / API key are correct |

---

## Project structure

```
src/
  config/
    dataverseMappings.ts   ← all meg_* table and field names
    env.ts                 ← environment variable loading
  services/
    dataverseService.ts    ← Dataverse queries with tenant isolation
    openaiClient.ts        ← Azure OpenAI integration
    authService.ts         ← API key validation
  runtime/
    agentRuntime.ts        ← main invoke flow
    toolRegistry.ts        ← converts skills/MCP to OpenAI function format
    toolExecutor.ts        ← executes HTTP skills and MCP tools
  routes/
    agent.ts               ← POST /api/agents/:agentId/invoke
  middlewares/
    authMiddleware.ts      ← reads x-tenant-id and x-api-key headers
    errorMiddleware.ts     ← centralized error handling
  utils/
    logger.ts              ← structured JSON logging
    trace.ts               ← traceId generation
    httpError.ts           ← typed HTTP errors
  types/
    index.ts               ← all shared TypeScript interfaces
    express.d.ts           ← Express request augmentation
  app.ts                   ← Express app entry point
```

---

## What's implemented (Phase 2)

- [x] Real `meg_*` Dataverse field mappings
- [x] Active version resolution (query by `statecode = 0`, no lookup field needed)
- [x] Relation-based tenant isolation where `meg_tenantid` is missing
- [x] Real persistence for Conversation, Message, and ExecutionLog
- [x] Per-agent model/temperature/maxTokens from AgentVersion
- [x] Skill loading with order and parent-skill tenant validation
- [x] MCP tool execution via POST to server endpoint
- [x] API key validation (key + tenant match)
- [x] Tool-calling loop with max iteration limit

## Remaining items (not yet implemented)

- [ ] Confirm `statecode` values for `meg_agentversion` in your environment
- [ ] Add status/expiration fields to `meg_agentkey` if security hardening is needed
- [ ] Decide on external vs internal `conversationId` strategy
- [ ] Streaming responses
- [ ] Queue-based processing (RabbitMQ)
- [ ] Tool result caching
- [ ] Multi-agent orchestration
- [ ] Full test suite
