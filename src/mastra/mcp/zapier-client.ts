import { MCPClient } from '@mastra/mcp';

const mcp = new MCPClient({
  id: 'zapier-mcp-client',
  servers: {
    zapier: {
      url: new URL(process.env.ZAPIER_MCP_URL || ''),
    },
  },
});

export const mcpTools = await mcp.listTools();
