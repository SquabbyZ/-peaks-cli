import { describe, expect, test } from 'vitest';
import { resolveCapabilityAvailability } from '../../src/services/recommendations/capability-availability.js';
import type { CapabilityItem } from '../../src/services/recommendations/recommendation-types.js';

const codeReviewAgent: CapabilityItem = {
  capabilityId: 'everything-claude-code.code-review-agent',
  sourceId: 'everything-claude-code',
  name: 'Code Review Agent',
  itemType: 'agent',
  category: 'code-review',
  workflows: ['code-refactor'],
  audience: ['engineer'],
  riskLevel: 'low',
  fallback: {
    mode: 'built-in-review-checklist',
    qualityImpact: 'lower'
  },
  presentation: {
    displayName: { en: 'Code Review Agent', 'zh-CN': '代码评审代理' },
    description: { en: 'Reviews changes.', 'zh-CN': '检查代码改动。' }
  }
};

const docsLookup: CapabilityItem = {
  capabilityId: 'context7.docs-lookup',
  sourceId: 'context7',
  name: 'Context7 Docs Lookup',
  itemType: 'mcp',
  category: 'docs-lookup',
  workflows: ['code-refactor'],
  audience: ['engineer'],
  riskLevel: 'low',
  fallback: {
    mode: 'manual-docs-input',
    qualityImpact: 'lower'
  },
  presentation: {
    displayName: { en: 'Documentation Lookup', 'zh-CN': '文档查询能力' },
    description: { en: 'Looks up docs.', 'zh-CN': '查询文档。' }
  }
};

describe('resolveCapabilityAvailability', () => {
  test('marks locally installed capabilities as available', () => {
    const availability = resolveCapabilityAvailability([codeReviewAgent], {
      installedCapabilityIds: ['everything-claude-code.code-review-agent']
    });

    expect(availability[0]).toMatchObject({
      capabilityId: 'everything-claude-code.code-review-agent',
      status: 'available',
      type: 'agent'
    });
  });

  test('marks missing MCP capabilities as installable with fallback', () => {
    const availability = resolveCapabilityAvailability([docsLookup], {
      installedCapabilityIds: []
    });

    expect(availability[0]).toMatchObject({
      capabilityId: 'context7.docs-lookup',
      status: 'installable',
      type: 'mcp',
      fallback: {
        mode: 'manual-docs-input'
      }
    });
    expect(availability[0]?.installPlan?.requiresApproval).toBe(true);
  });
});
