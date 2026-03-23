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

### 5.6 (Optional) Create an MCP Server for testing

Use this if you want to test MCP-style tool execution instead of a direct HTTP Skill.

The runtime now supports **two MCP execution modes**:

1. **Custom HTTP mode** for your own MCP adapter/gateway
2. **JSON-RPC MCP mode** for public or standards-style HTTP MCP endpoints

You choose the mode through `meg_authconfig` on the `meg_mcpserver` record.

#### Mode A — Custom HTTP mode

Use this when your MCP endpoint is your own adapter or gateway and expects a simplified payload.

The runtime sends a `POST` request with this JSON body:

```json
{
  "tool": "Your Tool Name",
  "arguments": {
    "content": "hello"
  }
}
```

This means your MCP server should expose a simple HTTP endpoint or gateway that can receive that shape and return JSON.

Use this JSON for `meg_authconfig`:

```json
{
  "mode": "custom-http"
}
```

#### Mode B — JSON-RPC MCP mode

Use this when the MCP endpoint is a public or standards-style HTTP MCP server.

The runtime sends JSON-RPC requests like:

```json
{
  "jsonrpc": "2.0",
  "id": "tool-123",
  "method": "tools/call",
  "params": {
    "name": "Your Tool Name",
    "arguments": {
      "content": "hello"
    }
  }
}
```

The runtime can also send an `initialize` call before the tool call.

Use this JSON for `meg_authconfig`:

```json
{
  "mode": "mcp-jsonrpc"
}
```

Optional JSON-RPC settings:

```json
{
  "mode": "mcp-jsonrpc",
  "rpcMethod": "tools/call",
  "protocolVersion": "2024-11-05",
  "initialize": true
}
```

If you are not sure which style the server uses, you can try:

```json
{
  "mode": "auto"
}
```

In `auto` mode, the runtime tries JSON-RPC first and then falls back to the custom HTTP payload.

#### Public MCP server test

Use this option when the endpoint does not require authentication headers.

##### Example Dataverse values for a public MCP server

Use these as a ready-made example and replace only the endpoint/tool names with your real server values.

**Example `meg_mcpserver` record**

| Field | Example value |
|---|---|
| `meg_name` | Public MCP Server |
| `meg_tenantid` | `tenant-001` |
| `meg_endpoint` | `https://your-public-mcp-host.example.com/mcp` |
| `meg_authconfig` | `{"mode":"mcp-jsonrpc"}` |

**Example `meg_mcptool` record**

| Field | Example value |
|---|---|
| `meg_name` | Echo Tool |
| `meg_mcpserver` | (lookup to Public MCP Server) |
| `meg_description` | `Echoes the provided content.` |
| `meg_inputschemas` | `{"type":"object","properties":{"content":{"type":"string"}},"required":["content"]}` |
| `meg_outputschemas` | optional |

**Example `meg_agentmcp` record**

| Field | Example value |
|---|---|
| `meg_name` | Public MCP Link |
| `meg_agentinformation` | (lookup to your active AgentVersion) |
| `meg_mcpserver` | (lookup to Public MCP Server) |

##### Create the MCPServer (`meg_mcpserver`)

| Field | Value |
|---|---|
| `meg_name` | Public MCP Server |
| `meg_tenantid` | `tenant-001` |
| `meg_endpoint` | `https://your-public-mcp-host.example.com/tools` |
| `meg_authconfig` | `{"mode":"mcp-jsonrpc"}` |

##### Create the MCPTool (`meg_mcptool`)

| Field | Value |
|---|---|
| `meg_name` | Echo Tool |
| `meg_mcpserver` | (lookup to Public MCP Server) |
| `meg_description` | `Echoes or transforms the input content.` |
| `meg_inputschemas` | see JSON below |

Use this JSON for `meg_inputschemas`:

```json
{
  "type": "object",
  "properties": {
    "content": {
      "type": "string"
    }
  },
  "required": ["content"]
}
```

##### Create the AgentMCP (`meg_agentmcp`)

| Field | Value |
|---|---|
| `meg_name` | Public MCP Link |
| `meg_agentinformation` | (lookup to your AgentVersion) |
| `meg_mcpserver` | (lookup to Public MCP Server) |

#### MCP server with auth config

Use this option when the MCP endpoint requires headers such as an API key or bearer token.

The current runtime supports:
- static auth headers
- OAuth client credentials flow for MCP endpoints

That means these work today:
- fixed `Authorization: Bearer ...` header stored in `meg_authconfig`
- fixed `x-api-key` or similar header stored in `meg_authconfig`
- OAuth token acquisition from a token endpoint before calling the MCP server
- automatic token refresh based on token expiry

##### Example Dataverse values for a secured public MCP server

Use these as a ready-made example and replace the token, key, and endpoint with your real values.

**Example `meg_mcpserver` record**

| Field | Example value |
|---|---|
| `meg_name` | Secured MCP Server |
| `meg_tenantid` | `tenant-001` |
| `meg_endpoint` | `https://your-secured-mcp-host.example.com/mcp` |
| `meg_authconfig` | `{"mode":"mcp-jsonrpc","headers":{"Authorization":"Bearer YOUR_TOKEN_HERE","x-api-key":"YOUR_API_KEY_HERE"}}` |

**Example `meg_mcptool` record**

| Field | Example value |
|---|---|
| `meg_name` | Search Tool |
| `meg_mcpserver` | (lookup to Secured MCP Server) |
| `meg_description` | `Searches the MCP server with the provided query.` |
| `meg_inputschemas` | `{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}` |
| `meg_outputschemas` | optional |

**Example `meg_agentmcp` record**

| Field | Example value |
|---|---|
| `meg_name` | Secured MCP Link |
| `meg_agentinformation` | (lookup to your active AgentVersion) |
| `meg_mcpserver` | (lookup to Secured MCP Server) |

##### Create the MCPServer (`meg_mcpserver`)

| Field | Value |
|---|---|
| `meg_name` | Secured MCP Server |
| `meg_tenantid` | `tenant-001` |
| `meg_endpoint` | `https://your-secured-mcp-host.example.com/tools` |
| `meg_authconfig` | see JSON below |

Use this JSON for `meg_authconfig`:

```json
{
  "mode": "mcp-jsonrpc",
  "headers": {
    "Authorization": "Bearer YOUR_TOKEN_HERE",
    "x-api-key": "YOUR_API_KEY_HERE"
  }
}
```

If your Dataverse form stores auth config as a flat object instead of nested `headers`, this also works:

```json
{
  "mode": "mcp-jsonrpc",
  "Authorization": "Bearer YOUR_TOKEN_HERE",
  "x-api-key": "YOUR_API_KEY_HERE"
}
```

#### OAuth-protected MCP endpoint

If your MCP endpoint requires the runtime to first request an OAuth token, the current runtime now supports **OAuth client credentials flow**.

For example, if the MCP flow is:

1. call token endpoint
2. receive access token
3. call MCP endpoint with `Authorization: Bearer <token>`

that is supported in the current backend.

##### Example OAuth client-credentials config

Use this JSON for `meg_authconfig` when your MCP server needs client credentials:

```json
{
  "mode": "mcp-jsonrpc",
  "authType": "oauth-client-credentials",
  "tokenUrl": "https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token",
  "clientId": "YOUR_CLIENT_ID",
  "clientSecret": "YOUR_CLIENT_SECRET",
  "scope": "api://YOUR_MCP_APP/.default"
}
```

The runtime will:

1. call the token endpoint
2. cache the returned access token
3. refresh the token when needed
4. call the MCP endpoint with `Authorization: Bearer <token>`

##### Example using the runtime's Dataverse app identity

If you want to reuse the same app registration already configured in `.env`, you can use:

```json
{
  "mode": "mcp-jsonrpc",
  "authType": "oauth-client-credentials",
  "useRuntimeDataverseIdentity": true,
  "scope": "api://YOUR_MCP_APP/.default"
}
```

This reuses:
- `AAD_TENANT_ID`
- `DATAVERSE_CLIENT_ID`
- `DATAVERSE_CLIENT_SECRET`

from your runtime environment.

##### What still does not work automatically

The runtime still does **not** implement advanced OAuth patterns such as:

- authorization code flow
- interactive user login
- device code flow
- custom browser-based auth negotiation
- per-user delegated tokens

##### Static token testing still works too

If you already have a valid bearer token and it is long-lived enough for testing, you can store it directly in `meg_authconfig`.

Example:

```json
{
  "mode": "mcp-jsonrpc",
  "headers": {
    "Authorization": "Bearer YOUR_TEMP_ACCESS_TOKEN"
  }
}
```

This is acceptable for a short manual test.

##### Recommended production pattern for complex enterprise auth

For Dataverse or other OAuth-protected MCP integrations with more complex auth requirements, the recommended approach can still be:

1. create an MCP gateway or proxy
2. let the gateway handle OAuth token acquisition and refresh
3. let the Agent Runtime call that gateway using:
   - no auth
   - static API key
   - static bearer token

In other words:

`Agent Runtime -> MCP Gateway -> OAuth Token Request -> Real MCP Server`

This is still useful when you do not want OAuth client secrets stored in Dataverse records.

#### How to create Dataverse config data for an authenticated MCP server

If your endpoint requires authentication, create these Dataverse records:

##### 1. `meg_mcpserver`

| Field | What to put |
|---|---|
| `meg_name` | Friendly MCP server name |
| `meg_tenantid` | Tenant string, e.g. `tenant-001` |
| `meg_endpoint` | The MCP HTTP endpoint URL |
| `meg_authconfig` | JSON config with mode and headers |

Example for static bearer token:

```json
{
  "mode": "mcp-jsonrpc",
  "headers": {
    "Authorization": "Bearer YOUR_TEMP_ACCESS_TOKEN"
  }
}
```

Example for static API key:

```json
{
  "mode": "mcp-jsonrpc",
  "headers": {
    "x-api-key": "YOUR_API_KEY_HERE"
  }
}
```

Example for gateway pattern:

```json
{
  "mode": "mcp-jsonrpc",
  "headers": {
    "x-api-key": "YOUR_GATEWAY_KEY"
  }
}
```

Example for OAuth client credentials:

```json
{
  "mode": "mcp-jsonrpc",
  "authType": "oauth-client-credentials",
  "tokenUrl": "https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token",
  "clientId": "YOUR_CLIENT_ID",
  "clientSecret": "YOUR_CLIENT_SECRET",
  "scope": "api://YOUR_MCP_APP/.default"
}
```

Example using the runtime Dataverse app credentials:

```json
{
  "mode": "mcp-jsonrpc",
  "authType": "oauth-client-credentials",
  "useRuntimeDataverseIdentity": true,
  "scope": "api://YOUR_MCP_APP/.default"
}
```

##### 2. `meg_mcptool`

| Field | What to put |
|---|---|
| `meg_name` | The tool name exposed by the MCP server |
| `meg_mcpserver` | Lookup to the MCP server |
| `meg_description` | Clear description for the model |
| `meg_inputschemas` | JSON schema for tool arguments |
| `meg_outputschemas` | Optional |

Example `meg_inputschemas` for a search tool:

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string"
    }
  },
  "required": ["query"]
}
```

##### 3. `meg_agentmcp`

| Field | What to put |
|---|---|
| `meg_name` | Friendly link name |
| `meg_agentinformation` | Lookup to the active AgentVersion |
| `meg_mcpserver` | Lookup to the MCPServer |

#### How to create Dataverse config data for a Dataverse MCP gateway

If the real target is Dataverse but it needs OAuth, the best setup is a gateway.

You can also call an OAuth-protected MCP endpoint directly now if it supports client credentials and you can provide the token configuration in `meg_authconfig`.

##### Example `meg_mcpserver`

| Field | Example value |
|---|---|
| `meg_name` | Dataverse MCP Gateway |
| `meg_tenantid` | `tenant-001` |
| `meg_endpoint` | `https://your-gateway.example.com/mcp` |
| `meg_authconfig` | `{"mode":"mcp-jsonrpc","headers":{"x-api-key":"YOUR_GATEWAY_KEY"}}` |

In this setup:
- your Agent Runtime calls the gateway
- the gateway handles Entra ID / OAuth token requests to Dataverse or the protected backend
- your runtime does not need to manage token refresh itself

##### Example direct OAuth-protected MCP config

If you do want the Agent Runtime to fetch the token itself, use a config like this:

| Field | Example value |
|---|---|
| `meg_name` | Dataverse Protected MCP |
| `meg_tenantid` | `tenant-001` |
| `meg_endpoint` | `https://your-protected-mcp.example.com/mcp` |
| `meg_authconfig` | `{"mode":"mcp-jsonrpc","authType":"oauth-client-credentials","tokenUrl":"https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token","clientId":"YOUR_CLIENT_ID","clientSecret":"YOUR_CLIENT_SECRET","scope":"api://YOUR_MCP_APP/.default"}` |

#### Important: allow the MCP host in `.env`

If `MCP_ALLOWED_HOSTS` is not empty, the MCP server host must be present in that list or the runtime will block the call.

Example:

```dotenv
MCP_ALLOWED_HOSTS=your-public-mcp-host.example.com,your-secured-mcp-host.example.com
```

If you change `.env`, restart the backend.

#### Directly test the MCP endpoint before using the agent

Before testing through the LLM, verify that the MCP endpoint works by calling it directly.

##### Public MCP endpoint example

```powershell
$body = @{
  jsonrpc = "2.0"
  id = "test-1"
  method = "tools/call"
  params = @{
    name = "Echo Tool"
    arguments = @{
      content = "hello from direct MCP test"
    }
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "https://your-public-mcp-host.example.com/tools" -Method POST -ContentType "application/json" -Body $body
```

##### Authenticated MCP endpoint example

```powershell
$headers = @{
  "Authorization" = "Bearer YOUR_TOKEN_HERE"
  "x-api-key" = "YOUR_API_KEY_HERE"
}

$body = @{
  jsonrpc = "2.0"
  id = "test-2"
  method = "tools/call"
  params = @{
    name = "Echo Tool"
    arguments = @{
      content = "hello from direct secured MCP test"
    }
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "https://your-secured-mcp-host.example.com/tools" -Method POST -Headers $headers -ContentType "application/json" -Body $body
```

##### Custom HTTP MCP endpoint example

If your MCP server is your own adapter and uses the simplified payload, test it like this:

```powershell
$body = @{
  tool = "Echo Tool"
  arguments = @{
    content = "hello from direct custom MCP test"
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "https://your-custom-mcp-host.example.com/tools" -Method POST -ContentType "application/json" -Body $body
```

##### Example Dataverse values for your custom MCP adapter

Use this if your MCP server is not standards-based and instead expects the simple `tool` + `arguments` payload.

**Example `meg_mcpserver` record**

| Field | Example value |
|---|---|
| `meg_name` | Custom MCP Adapter |
| `meg_tenantid` | `tenant-001` |
| `meg_endpoint` | `https://your-custom-mcp-host.example.com/tools` |
| `meg_authconfig` | `{"mode":"custom-http"}` |

**Example secured custom adapter**

| Field | Example value |
|---|---|
| `meg_name` | Custom MCP Adapter Secured |
| `meg_tenantid` | `tenant-001` |
| `meg_endpoint` | `https://your-custom-mcp-host.example.com/tools` |
| `meg_authconfig` | `{"mode":"custom-http","headers":{"x-api-key":"YOUR_API_KEY_HERE","Authorization":"Bearer YOUR_TOKEN_HERE"}}` |

**Example `meg_mcptool` record**

| Field | Example value |
|---|---|
| `meg_name` | Echo Tool |
| `meg_mcpserver` | (lookup to Custom MCP Adapter) |
| `meg_description` | `Sends content to the custom adapter and returns its response.` |
| `meg_inputschemas` | `{"type":"object","properties":{"content":{"type":"string"}},"required":["content"]}` |
| `meg_outputschemas` | optional |

**Example `meg_agentmcp` record**

| Field | Example value |
|---|---|
| `meg_name` | Custom MCP Link |
| `meg_agentinformation` | (lookup to your active AgentVersion) |
| `meg_mcpserver` | (lookup to Custom MCP Adapter) |

#### Suggested prompts for testing each MCP mode

Use prompts like these so the model is more likely to call the MCP tool:

**Custom adapter prompt**

```text
Use the Echo Tool from the MCP server and send this content: hello from the custom MCP adapter test.
```

**Public JSON-RPC MCP prompt**

```text
Use the Echo Tool from the MCP server and send this content: hello from the public MCP JSON-RPC test.
```

**Secured public MCP prompt**

```text
Use the Search Tool from the MCP server and search for: latest order status for customer 1001.
```

Expected behavior:

1. The endpoint returns `200 OK`
2. The response body is valid JSON
3. The returned JSON contains the result you expect for the selected tool

#### Important: update the agent system prompt for MCP

To help the model use the MCP tool reliably, make the AgentVersion system prompt explicit. Example:

```text
You are a helpful assistant.
When the user asks to use the Echo Tool or use the MCP server, you must call the Echo Tool.
When you call the Echo Tool, pass the user's text into the `content` field.
Do not answer from your own knowledge if the user is explicitly asking to use the MCP tool.
```

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

### Test tool calling with an MCP server

After creating the MCPServer, MCPTool, and AgentMCP records, send a prompt that strongly encourages MCP usage.

```powershell
$headers = @{
  "Content-Type" = "application/json"
  "x-tenant-id"  = "tenant-001"
  "x-api-key"    = "test-api-key-123"
}

$body = @{
  input = "Use the Echo Tool from the MCP server and send this content: hello from the MCP test. Then tell me exactly what the MCP server returned."
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/agents/YOUR_AGENT_GUID/invoke" -Method POST -Headers $headers -Body $body
```

Expected behavior:

1. The model sees the registered MCP tool
2. The runtime sends a request to the MCP server endpoint
3. The request body uses either JSON-RPC or custom HTTP format based on `meg_authconfig`
4. The tool result is appended back into the chat loop
5. The final answer mentions the data returned by the MCP server

If you want to test from the chat UI instead, use a message like:

```text
Use the Echo Tool from the MCP server and send this content: hello from the UI MCP test.
```

### How to confirm the MCP tool was actually used

Use these checks:

| Check | What to look for |
|---|---|
| Final answer | It should mention the MCP server result, not just a normal chat reply |
| Execution log | A new `meg_executionlog` row should be created |
| AgentMCP configuration | `meg_agentmcp` must point to the active AgentVersion and the correct MCPServer |
| MCPTool configuration | `meg_mcptool` must be linked to the MCPServer and contain valid input schema |
| MCP allowlist | The endpoint host must exist in `MCP_ALLOWED_HOSTS` if that setting is not empty |
| Direct endpoint test | The direct PowerShell test above should return `200 OK` |
| OAuth config | If OAuth is enabled, `tokenUrl`, `clientId`, `clientSecret`, and `scope` or `resource` must be correct |

### If the model does not call the MCP tool

Try these fixes:

1. Make the system prompt more explicit about when to use the MCP tool
2. Ask the user prompt to explicitly say `use the Echo Tool`
3. Confirm the AgentVersion used by the agent is the active one
4. Confirm `meg_inputschemas` contains valid JSON
5. Confirm the MCP endpoint returns `200 OK` when called directly
6. Confirm `meg_authconfig` contains the correct auth headers if the MCP endpoint is secured
7. Confirm the MCP host is included in `MCP_ALLOWED_HOSTS`
8. If using OAuth, confirm the token endpoint, scope, and client credentials are correct

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
| MCP endpoint requires OAuth token request | Supported for client credentials flow; verify `tokenUrl`, `clientId`, `clientSecret`, and `scope`/`resource` in `meg_authconfig` |

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
- [x] MCP tool execution via custom HTTP or JSON-RPC over HTTP
- [x] OAuth client credentials flow for MCP endpoints
- [x] API key validation (key + tenant match)
- [x] Tool-calling loop with max iteration limit

## Remaining items (not yet implemented)

- [ ] Confirm `statecode` values for `meg_agentversion` in your environment
- [ ] Add status/expiration fields to `meg_agentkey` if security hardening is needed
- [ ] Decide on external vs internal `conversationId` strategy
- [ ] Advanced OAuth flows for MCP endpoints (interactive or delegated)
- [ ] Streaming responses
- [ ] Queue-based processing (RabbitMQ)
- [ ] Tool result caching
- [ ] Multi-agent orchestration
- [ ] Full test suite
