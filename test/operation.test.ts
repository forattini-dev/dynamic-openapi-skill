import { describe, it, expect } from 'vitest'
import { renderOperation } from '../src/generator/operation.js'
import { buildCurlExample } from '../src/generator/curl.js'
import type { ParsedOperation } from 'dynamic-openapi-tools/parser'

function baseOp(overrides: Partial<ParsedOperation> = {}): ParsedOperation {
  return {
    operationId: 'doThing',
    path: '/things',
    method: 'GET',
    tags: [],
    parameters: [],
    responses: {},
    security: [],
    ...overrides,
  }
}

describe('renderOperation', () => {
  it('renders a minimal operation', () => {
    const rendered = renderOperation(baseOp({ summary: 'Do a thing' }), {
      baseUrl: 'https://api.example.com',
      securitySchemes: {},
      includeExamples: false,
      headingLevel: 3,
    })
    expect(rendered).toContain('### `doThing`')
    expect(rendered).toContain('**`GET /things`**')
    expect(rendered).toContain('Do a thing')
  })

  it('marks deprecated operations and shows description separately from summary', () => {
    const rendered = renderOperation(
      baseOp({
        deprecated: true,
        summary: 'Old',
        description: 'Long explanation',
        tags: ['pets'],
      }),
      { baseUrl: '', securitySchemes: {}, includeExamples: false, headingLevel: 2 }
    )
    expect(rendered).toContain('_deprecated_')
    expect(rendered).toContain('Long explanation')
  })

  it('renders parameters, request body, responses, security, and example', () => {
    const op = baseOp({
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'ID' },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer' },
          description: 'Limit',
          deprecated: true,
        },
      ],
      requestBody: {
        required: true,
        description: 'body',
        content: {
          'application/json': {
            schema: { type: 'object', properties: { name: { type: 'string' } } },
          },
        },
      },
      responses: {
        '200': {
          description: 'ok',
          mediaType: 'application/json',
          schema: { type: 'object' },
          content: {
            'application/json': { schema: { type: 'object' } },
          },
        },
      },
      security: [{ bearer: [] }],
    })
    const rendered = renderOperation(op, {
      baseUrl: 'https://api.example.com',
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer' } as never,
      },
      includeExamples: true,
      headingLevel: 4,
    })
    expect(rendered).toContain('#### `doThing`')
    expect(rendered).toContain('**Parameters**')
    expect(rendered).toContain('**Request body**')
    expect(rendered).toContain('**Response**')
    expect(rendered).toContain('**Example**')
    expect(rendered).toContain('Auth: `bearer`')
    expect(rendered).toContain('```bash')
  })

  it('uses a Responses table only when multiple status codes exist', () => {
    const rendered = renderOperation(
      baseOp({
        responses: {
          '200': { description: 'ok', mediaType: 'application/json', schema: { type: 'object' }, content: {} },
          '404': { description: 'not found', mediaType: 'application/json', schema: { type: 'object' }, content: {} },
        },
      }),
      { baseUrl: '', securitySchemes: {}, includeExamples: false, headingLevel: 3 }
    )
    expect(rendered).toContain('**Responses**')
    expect(rendered).toContain('| Status | Description | Media type | Type |')
  })

  it('renders externalDocs link when available', () => {
    const rendered = renderOperation(
      baseOp({ externalDocs: { url: 'https://example.com/docs', description: 'Docs' } }),
      { baseUrl: '', securitySchemes: {}, includeExamples: false, headingLevel: 3 }
    )
    expect(rendered).toContain('See also: [Docs](https://example.com/docs)')
  })
})

describe('buildCurlExample', () => {
  it('builds a curl with bearer header', () => {
    const curl = buildCurlExample(
      baseOp({
        security: [{ bearer: [] }],
      }),
      {
        baseUrl: 'https://api.example.com',
        securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } as never },
      }
    )
    expect(curl).toContain("curl -X GET 'https://api.example.com/things'")
    expect(curl).toContain("Authorization: Bearer $TOKEN")
  })

  it('substitutes required path params and required query params', () => {
    const curl = buildCurlExample(
      baseOp({
        path: '/pets/{id}',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'optional', in: 'query', required: false, schema: { type: 'string' } },
        ],
      }),
      { baseUrl: 'https://api.example.com/', securitySchemes: {} }
    )
    expect(curl).toContain('/pets/string?limit=0')
    expect(curl).not.toContain('optional=')
  })

  it('adds header parameters', () => {
    const curl = buildCurlExample(
      baseOp({
        parameters: [
          { name: 'X-Trace', in: 'header', required: true, schema: { type: 'string' } },
          { name: 'X-Blank', in: 'header', required: false, schema: {} as never },
        ],
      }),
      { baseUrl: 'https://api.example.com', securitySchemes: {} }
    )
    expect(curl).toContain("X-Trace: string")
    expect(curl).toContain("X-Blank: <X-Blank>")
  })

  it('supports basic and apiKey-header security', () => {
    const curl = buildCurlExample(
      baseOp({
        security: [{ basic: [], header: [], oauth: [] }],
      }),
      {
        baseUrl: 'https://api.example.com',
        securitySchemes: {
          basic: { type: 'http', scheme: 'basic' } as never,
          header: { type: 'apiKey', in: 'header', name: 'X-Api-Key' } as never,
          oauth: { type: 'oauth2', flows: {} } as never,
        },
      }
    )
    expect(curl).toContain('-u "$USER:$PASSWORD"')
    expect(curl).toContain("X-Api-Key: $API_KEY")
    expect(curl).toContain('Authorization: Bearer $TOKEN')
  })

  it('skips unknown security references', () => {
    const curl = buildCurlExample(
      baseOp({ security: [{ ghost: [] }] }),
      { baseUrl: 'https://api.example.com', securitySchemes: {} }
    )
    expect(curl).not.toContain('ghost')
  })

  it('emits JSON bodies with proper escaping', () => {
    const curl = buildCurlExample(
      baseOp({
        method: 'POST',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string' } } },
              example: { name: "it's fine" },
            },
          },
        },
      }),
      { baseUrl: 'https://api.example.com', securitySchemes: {} }
    )
    expect(curl).toContain("Content-Type: application/json")
    expect(curl).toContain("it'\\''s fine")
  })

  it('emits form-urlencoded bodies', () => {
    const curl = buildCurlExample(
      baseOp({
        method: 'POST',
        requestBody: {
          required: false,
          content: {
            'application/x-www-form-urlencoded': {
              schema: { type: 'object', properties: { a: { type: 'string' } } },
              example: { a: 'b c' },
            },
          },
        },
      }),
      { baseUrl: 'https://api.example.com', securitySchemes: {} }
    )
    expect(curl).toContain('--data-urlencode')
    expect(curl).toContain('a=b%20c')
  })

  it('emits multipart and binary bodies', () => {
    const multipart = buildCurlExample(
      baseOp({
        method: 'POST',
        requestBody: {
          required: false,
          content: { 'multipart/form-data': { schema: { type: 'object' } } },
        },
      }),
      { baseUrl: 'https://api.example.com', securitySchemes: {} }
    )
    expect(multipart).toContain('-F')

    const binary = buildCurlExample(
      baseOp({
        method: 'POST',
        requestBody: {
          required: false,
          content: { 'application/octet-stream': { schema: { type: 'string' } } },
        },
      }),
      { baseUrl: 'https://api.example.com', securitySchemes: {} }
    )
    expect(binary).toContain('--data-binary')
  })

  it('omits body when content map is empty and falls back to the last trailing backslash', () => {
    const curl = buildCurlExample(
      baseOp({
        method: 'POST',
        requestBody: { required: false, content: {} },
      }),
      { baseUrl: 'https://api.example.com', securitySchemes: {} }
    )
    expect(curl.endsWith('\\')).toBe(false)
  })

  it('handles an empty base URL', () => {
    const curl = buildCurlExample(baseOp({ path: '/things' }), {
      baseUrl: '',
      securitySchemes: {},
    })
    expect(curl).toContain("curl -X GET '/things'")
  })
})
