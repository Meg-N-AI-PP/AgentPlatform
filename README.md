# Agent Runtime Service

Phase 1 implementation for a multi-tenant AI Agent Runtime using Node.js, TypeScript, Express, Axios, Dataverse, and Azure OpenAI.

## Setup
1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`
3. Update Dataverse field mappings in `src/config/dataverseMappings.ts`
4. Start in development: `npm run dev`
5. Build: `npm run build`
6. Start production build: `npm run start`

## API
`POST /api/agents/:agentId/invoke`

Required headers:
- `x-tenant-id`
- `x-api-key`

Example body:

```json
{
  "input": "Summarize the latest order status.",
  "conversationId": "optional-conversation-id",
  "overrides": {
    "promptAppend": "Be concise.",
    "extraSkills": [],
    "extraMCPs": []
  }
}
```

## Important
The Dataverse tables already exist, but field names will be updated later. To minimize rework, all entity names and field mappings are isolated in `src/config/dataverseMappings.ts`.
