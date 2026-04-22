import { describe, it, expect } from 'vitest'
import * as pkg from '../src/index.js'
import * as generatorPkg from '../src/generator/index.js'

describe('public entry points', () => {
  it('re-exports the generator, writer, and filter', () => {
    expect(typeof pkg.generateSkill).toBe('function')
    expect(typeof pkg.writeSkill).toBe('function')
    expect(typeof pkg.filterOperations).toBe('function')
  })

  it('generator barrel re-exports generateSkill and filterOperations', () => {
    expect(typeof generatorPkg.generateSkill).toBe('function')
    expect(typeof generatorPkg.filterOperations).toBe('function')
  })
})
