import { describe, expect, test } from 'vitest';
import { seedCapabilityItems, seedCapabilitySources } from '../../src/services/recommendations/seed-capability-catalog.js';

describe('seed capability catalog', () => {
  test('models everything-claude-code as a source with item-level capabilities', () => {
    const source = seedCapabilitySources.find((candidate) => candidate.sourceId === 'everything-claude-code');
    const reviewAgent = seedCapabilityItems.find((candidate) => candidate.capabilityId === 'everything-claude-code.code-review-agent');

    expect(source?.sourceType).toBe('repo');
    expect(source?.items).toContain('everything-claude-code.code-review-agent');
    expect(reviewAgent?.sourceId).toBe('everything-claude-code');
    expect(reviewAgent?.category).toBe('code-review');
  });

  test('models MCP collections as sources and concrete MCPs as items', () => {
    const source = seedCapabilitySources.find((candidate) => candidate.sourceId === 'modelcontextprotocol-servers');
    const context7 = seedCapabilityItems.find((candidate) => candidate.capabilityId === 'context7.docs-lookup');

    expect(source?.sourceType).toBe('mcp-collection');
    expect(context7?.itemType).toBe('mcp');
    expect(context7?.workflows).toContain('code-refactor');
  });
});
