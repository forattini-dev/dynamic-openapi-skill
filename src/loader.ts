import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import type { OpenAPIV3 } from 'dynamic-openapi-tools/parser'
import { resolveSource } from 'dynamic-openapi-tools/parser'
import { fetchWithRetry } from 'dynamic-openapi-tools/utils'

/**
 * Result of loading a spec while preserving the original text and source label,
 * both required to emit the `Source:` and `Spec MD5:` lines in SKILL.md metadata.
 */
export interface LoadedSpec {
  doc: OpenAPIV3.Document
  text: string
  sourceLabel: string
}

/**
 * Loads a spec and also returns the raw text + source label used by the skill
 * generator to compute a stable MD5 hash and print the original input path.
 *
 * Delegates source-type discrimination to `dynamic-openapi-tools` but parses the
 * text locally so the raw bytes can flow into the metadata section unchanged.
 */
export async function loadSpecWithSource(
  source: string | OpenAPIV3.Document
): Promise<LoadedSpec> {
  const resolved = resolveSource(source)

  switch (resolved.type) {
    case 'url': {
      const res = await fetchWithRetry(resolved.value)
      if (!res.ok) {
        throw new Error(
          `Failed to fetch spec from ${resolved.value}: ${res.status} ${res.statusText}`
        )
      }
      const text = await res.text()
      return { doc: parseSpecText(text, resolved.value), text, sourceLabel: resolved.value }
    }

    case 'file': {
      let text: string
      try {
        text = await readFile(resolved.value, 'utf-8')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(`Failed to read spec file "${resolved.value}": ${msg}`)
      }
      return { doc: parseSpecText(text, resolved.value), text, sourceLabel: resolved.value }
    }

    case 'inline': {
      if (typeof resolved.value === 'string') {
        return {
          doc: parseSpecText(resolved.value, '(inline)'),
          text: resolved.value,
          sourceLabel: '(inline)',
        }
      }
      return {
        doc: resolved.value,
        text: JSON.stringify(resolved.value),
        sourceLabel: '(inline)',
      }
    }
  }
}

function parseSpecText(text: string, source: string): OpenAPIV3.Document {
  const trimmed = text.trim()

  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to parse JSON spec from ${source}: ${msg}`)
    }
  }

  try {
    return parseYaml(trimmed) as OpenAPIV3.Document
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to parse YAML spec from ${source}: ${msg}`)
  }
}
