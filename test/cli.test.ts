import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, buildFilters, main } from '../src/cli.js'

const petstore = './test/fixtures/petstore.yaml'

describe('parseArgs', () => {
  it('parses all short and long flags', () => {
    const args = parseArgs([
      'node',
      'cli',
      '-s',
      './spec.yaml',
      '-o',
      './out',
      '--name',
      'petstore',
      '--description',
      'Pet API',
      '-b',
      'https://api.example.com',
      '--server-index',
      '1',
      '--split-threshold',
      '15',
      '--no-examples',
      '--stdout',
    ])
    expect(args).toMatchObject({
      source: './spec.yaml',
      out: './out',
      name: 'petstore',
      description: 'Pet API',
      baseUrl: 'https://api.example.com',
      serverIndex: 1,
      splitThreshold: 15,
      noExamples: true,
      stdout: true,
    })
  })

  it('supports a positional source argument when -s is absent', () => {
    const args = parseArgs(['node', 'cli', './spec.yaml', '-o', './out'])
    expect(args.source).toBe('./spec.yaml')
    expect(args.out).toBe('./out')
  })

  it('accumulates include/exclude filter flags with CSV splitting and repetition', () => {
    const args = parseArgs([
      'node',
      'cli',
      '--include-tag',
      'pets,store',
      '--include-tag',
      'user',
      '--exclude-tag',
      'admin',
      '--include-operation',
      'listPets, getPetById',
      '--exclude-operation',
      'deletePet',
    ])
    expect(args.includeTags).toEqual(['pets', 'store', 'user'])
    expect(args.excludeTags).toEqual(['admin'])
    expect(args.includeOperations).toEqual(['listPets', 'getPetById'])
    expect(args.excludeOperations).toEqual(['deletePet'])
  })

  it('exits when --server-index is non-numeric', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`)
    }) as never)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => parseArgs(['node', 'cli', '--server-index', 'nope'])).toThrow('exit:1')
    expect(err).toHaveBeenCalledWith(expect.stringContaining('--server-index'))
    exit.mockRestore()
    err.mockRestore()
  })

  it('exits when --split-threshold is non-numeric', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`)
    }) as never)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => parseArgs(['node', 'cli', '--split-threshold', 'foo'])).toThrow('exit:1')
    exit.mockRestore()
    err.mockRestore()
  })

  it('prints help and exits with 0 on -h', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`)
    }) as never)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() => parseArgs(['node', 'cli', '-h'])).toThrow('exit:0')
    expect(log).toHaveBeenCalled()
    exit.mockRestore()
    log.mockRestore()
  })
})

describe('buildFilters', () => {
  it('returns undefined when nothing is configured', () => {
    const args = parseArgs(['node', 'cli'])
    expect(buildFilters(args)).toBeUndefined()
  })

  it('builds tag-only filters when only tag flags are set', () => {
    const args = parseArgs(['node', 'cli', '--include-tag', 'pets'])
    expect(buildFilters(args)).toEqual({ tags: { include: ['pets'] } })
  })

  it('builds operations-only filters when only operation flags are set', () => {
    const args = parseArgs(['node', 'cli', '--exclude-operation', 'debugDump'])
    expect(buildFilters(args)).toEqual({ operations: { exclude: ['debugDump'] } })
  })

  it('combines tag and operation filters', () => {
    const args = parseArgs([
      'node',
      'cli',
      '--include-tag',
      'pets',
      '--exclude-tag',
      'admin',
      '--include-operation',
      'listPets',
    ])
    expect(buildFilters(args)).toEqual({
      tags: { include: ['pets'], exclude: ['admin'] },
      operations: { include: ['listPets'] },
    })
  })
})

describe('main (integration)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'skill-cli-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes a SKILL.md to the output directory', async () => {
    const out = join(tmpDir, 'skill')
    await main(['node', 'cli', '-s', petstore, '-o', out])
    const content = readFileSync(join(out, 'SKILL.md'), 'utf-8')
    expect(content).toContain('---')
    expect(content).toContain('## Spec metadata')
  })

  it('prints SKILL.md to stdout when --stdout is passed', async () => {
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk))
      return true
    }) as never)
    await main(['node', 'cli', '-s', petstore, '--stdout'])
    spy.mockRestore()
    expect(writes.join('')).toContain('name: ')
  })

  it('exits when no source is provided', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`)
    }) as never)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const prev = process.env['OPENAPI_SOURCE']
    delete process.env['OPENAPI_SOURCE']
    try {
      await expect(main(['node', 'cli'])).rejects.toThrow('exit:1')
      expect(err).toHaveBeenCalledWith(expect.stringContaining('No OpenAPI source'))
    } finally {
      if (prev !== undefined) process.env['OPENAPI_SOURCE'] = prev
      exit.mockRestore()
      err.mockRestore()
    }
  })

  it('reads source from OPENAPI_SOURCE env var', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never)
    const prev = process.env['OPENAPI_SOURCE']
    process.env['OPENAPI_SOURCE'] = petstore
    try {
      await main(['node', 'cli', '--stdout'])
      expect(spy).toHaveBeenCalled()
    } finally {
      if (prev === undefined) delete process.env['OPENAPI_SOURCE']
      else process.env['OPENAPI_SOURCE'] = prev
      spy.mockRestore()
    }
  })

  it('applies OPENAPI_SERVER_INDEX env var when set', async () => {
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk))
      return true
    }) as never)
    const prev = process.env['OPENAPI_SERVER_INDEX']
    process.env['OPENAPI_SERVER_INDEX'] = '0'
    try {
      await main(['node', 'cli', '-s', petstore, '--stdout'])
      expect(writes.join('')).toContain('name:')
    } finally {
      if (prev === undefined) delete process.env['OPENAPI_SERVER_INDEX']
      else process.env['OPENAPI_SERVER_INDEX'] = prev
      spy.mockRestore()
    }
  })

  it('exits when neither --out nor --stdout is provided', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`)
    }) as never)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(main(['node', 'cli', '-s', petstore])).rejects.toThrow('exit:1')
    expect(err).toHaveBeenCalledWith(expect.stringContaining('--out <dir>'))
    exit.mockRestore()
    err.mockRestore()
  })

  it('surfaces generator errors to stderr and exits', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`)
    }) as never)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as never)
    await expect(
      main(['node', 'cli', '-s', '/does/not/exist.yaml', '--stdout'])
    ).rejects.toThrow('exit:1')
    expect(stderr).toHaveBeenCalled()
    exit.mockRestore()
    stderr.mockRestore()
  })
})
