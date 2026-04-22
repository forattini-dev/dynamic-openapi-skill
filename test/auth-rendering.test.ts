import { describe, it, expect } from 'vitest'
import { generateSkill } from '../src/generator/skill.js'

describe('auth + yamlString edge cases', () => {
  it('renders OAuth2 with scopes, openIdConnect, and scheme descriptions', async () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Secured', version: '1.0.0' },
      paths: {
        '/a': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
      components: {
        securitySchemes: {
          oauth: {
            type: 'oauth2',
            description: 'oauth description here',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://example.com/auth',
                tokenUrl: 'https://example.com/token',
                refreshUrl: 'https://example.com/refresh',
                scopes: { 'read:things': 'read things', 'write:things': 'write things' },
              },
            },
          },
          oidc: {
            type: 'openIdConnect',
            openIdConnectUrl: 'https://example.com/.well-known',
            description: 'openid description',
          },
        },
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const skill = await generateSkill({ source: doc as any })
    const content = skill.files[0]!.content
    expect(content).toContain('- Flow `authorizationCode`:')
    expect(content).toContain('- Token URL: https://example.com/token')
    expect(content).toContain('- Authorization URL: https://example.com/auth')
    expect(content).toContain('- Refresh URL: https://example.com/refresh')
    expect(content).toContain('- Scopes:')
    expect(content).toContain('`read:things` — read things')
    expect(content).toContain('- Type: OpenID Connect')
    expect(content).toContain('- Discovery URL: https://example.com/.well-known')
    expect(content).toContain('oauth description here')
    expect(content).toContain('openid description')
  })

  it('JSON-encodes the yaml description when it contains special characters', async () => {
    const doc = {
      openapi: '3.0.0',
      info: {
        title: 'Fancy',
        version: '1.0.0',
        description: 'desc: with colon\nand newline',
      },
      paths: { '/a': { get: { responses: { '200': { description: 'ok' } } } } },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const skill = await generateSkill({ source: doc as any })
    const head = skill.files[0]!.content.split('\n').slice(0, 5).join('\n')
    // The description is wrapped in JSON.stringify when it has special chars.
    expect(head).toMatch(/^description: "/m)
  })

  it('renders a helpful notice when no servers are declared', async () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'NoServers', version: '1.0.0' },
      paths: { '/a': { get: { responses: { '200': { description: 'ok' } } } } },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const skill = await generateSkill({ source: doc as any })
    expect(skill.files[0]!.content).toContain('_No servers declared in the spec.')
  })
})
