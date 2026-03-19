# Dataverse Field Updates

Use this file to capture the **final Dataverse table fields, lookup columns, and important notes** before Phase 2 starts.

Once this is filled, the runtime mappings in the codebase can be updated safely with minimal rework.

---

## How to use this file
For each table:
- add the real table logical name
- add the primary key field
- add the `tenantId` field name
- add all important business fields
- add lookup field names exactly as Dataverse exposes them
- note anything special such as option sets, JSON text fields, or required fields

---

## Global notes

### Tenant field
- Final `tenantId` field name:
- Type:
- Present on all tables? Yes / No
- Notes:

### API key header decision
- Header name:
- Notes:

### Conversation ID decision
- Will `conversationId` be external, internal, or both?
- Notes:

---

## 1. Agent
- Table logical name:
- Primary key field:
- Tenant field:
- Name field:
- Instructions field:
- Active version lookup field:
- Status field (if any):
- Other important fields:
- Notes:

## 2. AgentVersion
- Table logical name:
- Primary key field:
- Tenant field:
- Agent lookup field:
- Name field:
- System prompt field:
- Version field / label field:
- Status field (if any):
- Other important fields:
- Notes:

## 3. AgentSkill
- Table logical name:
- Primary key field:
- Tenant field:
- AgentVersion lookup field:
- SkillVersion lookup field:
- Ordering / priority field (if any):
- Enabled field (if any):
- Other important fields:
- Notes:

## 4. Skill
- Table logical name:
- Primary key field:
- Tenant field:
- Name field:
- Other important fields:
- Notes:

## 5. SkillVersion
- Table logical name:
- Primary key field:
- Tenant field:
- Skill lookup field:
- Name field:
- Description field:
- Type field:
- URL field:
- HTTP method field:
- Headers field:
- Input schema field:
- Auth field(s) if any:
- Timeout field if any:
- Other important fields:
- Notes:

## 6. AgentMCP
- Table logical name:
- Primary key field:
- Tenant field:
- AgentVersion lookup field:
- MCPServer lookup field:
- Ordering / priority field (if any):
- Enabled field (if any):
- Other important fields:
- Notes:

## 7. MCPServer
- Table logical name:
- Primary key field:
- Tenant field:
- Name field:
- Endpoint field:
- Auth type field:
- Headers field:
- Enabled field (if any):
- Allowlist-related field(s) if any:
- Other important fields:
- Notes:

## 8. MCPTool
- Table logical name:
- Primary key field:
- Tenant field:
- MCPServer lookup field:
- Name field:
- Description field:
- Path field:
- HTTP method field:
- Input schema field:
- Enabled field (if any):
- Other important fields:
- Notes:

## 9. ApiKey
- Table logical name:
- Primary key field:
- Tenant field:
- Key field:
- Name / label field:
- IsActive field:
- Expiration field (if any):
- Client/app field (if any):
- Last used field (if any):
- Other important fields:
- Notes:

## 10. Conversation
- Table logical name:
- Primary key field:
- Tenant field:
- Agent lookup field:
- External conversationId field:
- Title / label field (if any):
- Status field (if any):
- Created by / source field (if any):
- Other important fields:
- Notes:

## 11. Message
- Table logical name:
- Primary key field:
- Tenant field:
- Conversation lookup field:
- Role field:
- Content field:
- TraceId field:
- Tool call ID field (if any):
- Tool name field (if any):
- Timestamp field:
- Other important fields:
- Notes:

## 12. ExecutionLog
- Table logical name:
- Primary key field:
- Tenant field:
- TraceId field:
- Agent lookup field:
- Status field:
- Details field:
- Error field (if any):
- Duration field (if any):
- Started at / completed at fields:
- Other important fields:
- Notes:

---

## Query and relationship notes

### Agent loading path
- Agent -> Active AgentVersion:
- Notes:

### Skill loading path
- AgentVersion -> AgentSkill -> SkillVersion:
- Notes:

### MCP loading path
- AgentVersion -> AgentMCP -> MCPServer -> MCPTool:
- Notes:

### API key validation path
- ApiKey query details:
- Notes:

### Conversation and message persistence path
- Conversation query details:
- Message query details:
- Notes:

---

## Final decisions needed before Phase 2
- Which fields are required for runtime only?
- Which fields are optional?
- Which fields contain JSON text?
- Which fields are lookups returned as `_fieldname_value`?
- Which tables need status filtering?
- Which records should be considered active/inactive?

---

## Handoff note
After this file is completed, update these code files:
- `src/config/dataverseMappings.ts`
- `src/services/dataverseService.ts`
- any related DTO or validation logic impacted by the final field names
