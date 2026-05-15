import type { CapabilityItem, CapabilitySource } from './recommendation-types.js';

export const seedCapabilitySources: CapabilitySource[] = [
  {
    sourceId: 'everything-claude-code',
    sourceType: 'repo',
    title: 'everything-claude-code',
    url: 'https://github.com/affaan-m/everything-claude-code',
    trustSignals: {
      sourceReputation: 'hackathon-winning Claude Code resource collection',
      notes: ['Treat as a source bundle; deep indexing is required before broad automatic use.']
    },
    discoveryStatus: 'indexed',
    items: ['everything-claude-code.code-review-agent', 'everything-claude-code.security-review-agent']
  },
  {
    sourceId: 'context7',
    sourceType: 'repo',
    title: 'Context7',
    url: 'https://github.com/upstash/context7',
    trustSignals: {
      sourceReputation: 'commonly used docs lookup MCP capability'
    },
    discoveryStatus: 'indexed',
    items: ['context7.docs-lookup']
  },
  {
    sourceId: 'modelcontextprotocol-servers',
    sourceType: 'mcp-collection',
    title: 'Model Context Protocol Servers',
    url: 'https://github.com/modelcontextprotocol/servers',
    trustSignals: {
      sourceReputation: 'official MCP server collection'
    },
    discoveryStatus: 'unscanned',
    items: []
  }
];

export const seedCapabilityItems: CapabilityItem[] = [
  {
    capabilityId: 'everything-claude-code.code-review-agent',
    sourceId: 'everything-claude-code',
    name: 'Code Review Agent',
    itemType: 'agent',
    category: 'code-review',
    workflows: ['code-refactor', 'development-complete'],
    audience: ['engineer'],
    riskLevel: 'low',
    inputContract: 'git-diff or changed-file summary',
    outputContract: 'review-report',
    fallback: {
      mode: 'built-in-review-checklist',
      qualityImpact: 'lower',
      nextAction: 'Use Peaks built-in code review checklist if the external agent is unavailable.'
    },
    presentation: {
      displayName: {
        en: 'Code Review Agent',
        'zh-CN': '代码评审代理'
      },
      description: {
        en: 'Reviews code changes for quality, maintainability, tests, and risks.',
        'zh-CN': '用于在代码改动后检查质量、可维护性、测试和风险。'
      }
    }
  },
  {
    capabilityId: 'everything-claude-code.security-review-agent',
    sourceId: 'everything-claude-code',
    name: 'Security Review Agent',
    itemType: 'agent',
    category: 'security-review',
    workflows: ['code-refactor', 'development-complete'],
    audience: ['engineer'],
    riskLevel: 'medium',
    inputContract: 'git-diff or changed-file summary',
    outputContract: 'security-review-report',
    fallback: {
      mode: 'built-in-security-checklist',
      qualityImpact: 'lower',
      nextAction: 'Use Peaks built-in security checklist if the external agent is unavailable.'
    },
    presentation: {
      displayName: {
        en: 'Security Review Agent',
        'zh-CN': '安全评审代理'
      },
      description: {
        en: 'Checks auth, user input, filesystem, external calls, and secret-handling risks.',
        'zh-CN': '检查认证、用户输入、文件系统、外部调用和密钥处理风险。'
      }
    }
  },
  {
    capabilityId: 'context7.docs-lookup',
    sourceId: 'context7',
    name: 'Context7 Docs Lookup',
    itemType: 'mcp',
    category: 'docs-lookup',
    workflows: ['code-refactor', 'product-refactor', 'frontend-design'],
    audience: ['engineer', 'product'],
    riskLevel: 'low',
    inputContract: 'library or API documentation request',
    outputContract: 'documentation-summary',
    fallback: {
      mode: 'manual-docs-input',
      qualityImpact: 'lower',
      nextAction: 'Ask the user to provide the relevant documentation link or pasted excerpt.'
    },
    presentation: {
      displayName: {
        en: 'Documentation Lookup',
        'zh-CN': '文档查询能力'
      },
      description: {
        en: 'Fetches current library and API documentation for implementation planning.',
        'zh-CN': '用于获取当前库和 API 文档，辅助实现规划。'
      }
    }
  }
];
