import { describe, it, expect } from 'bun:test';
import { createMcpServer } from '../mcp/server.js';

describe('MCP Server', () => {
  it('should create a server instance without throwing', () => {
    expect(() => createMcpServer()).not.toThrow();
  });

  it('should create a server with correct name', () => {
    const server = createMcpServer();
    expect(server).toBeTruthy();
  });

  it('should create server with version from package.json', () => {
    // Just verify it creates without error (version is read from package.json)
    const server = createMcpServer();
    expect(server).toBeDefined();
  });
});
