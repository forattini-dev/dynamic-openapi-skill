import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeSkill } from '../src/writer.js'
import type { GeneratedSkill } from '../src/generator/types.js'

describe('writeSkill', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'skill-writer-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes SKILL.md and reference files, creating subdirectories as needed', async () => {
    const skill: GeneratedSkill = {
      name: 'petstore',
      description: 'Call the Petstore API.',
      spec: {
        title: 'Petstore',
        version: '1.0.0',
        description: undefined,
        servers: [],
        tags: [],
        operations: [],
        securitySchemes: {},
      },
      files: [
        { path: 'SKILL.md', content: '# top-level\n' },
        { path: 'references/pets.md', content: '# pets\n' },
        { path: 'references/store.md', content: '# store\n' },
      ],
      metadata: {
        apiVersion: '1.0.0',
        source: 'inline',
        md5: '0'.repeat(32),
        generatorVersion: '0.0.0-dev',
      },
    }

    const written = await writeSkill(skill, tmpDir)

    expect(written).toHaveLength(3)
    expect(existsSync(join(tmpDir, 'SKILL.md'))).toBe(true)
    expect(existsSync(join(tmpDir, 'references', 'pets.md'))).toBe(true)
    expect(readFileSync(join(tmpDir, 'SKILL.md'), 'utf-8')).toBe('# top-level\n')
    expect(readFileSync(join(tmpDir, 'references', 'pets.md'), 'utf-8')).toBe('# pets\n')
  })
})
