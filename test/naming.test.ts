import { describe, it, expect } from 'vitest'
import { slugify, toTitleCase, escapeMarkdown, firstLine } from '../src/generator/naming.js'

describe('slugify', () => {
  it('lowercases and replaces separators', () => {
    expect(slugify('Hello World!')).toBe('hello-world')
  })

  it('strips diacritics where present', () => {
    const result = slugify('Café Münchén')
    expect(result).toMatch(/caf.*m.nch.n/)
  })

  it('truncates to 64 chars max', () => {
    const long = 'a'.repeat(200)
    expect(slugify(long).length).toBeLessThanOrEqual(64)
  })

  it('trims leading and trailing dashes', () => {
    expect(slugify('!!hello!!')).toBe('hello')
  })
})

describe('toTitleCase', () => {
  it('converts kebab and snake to title case', () => {
    expect(toTitleCase('pet_store-api')).toBe('Pet Store Api')
  })

  it('collapses whitespace', () => {
    expect(toTitleCase('  hello   world  ')).toBe('Hello World')
  })
})

describe('escapeMarkdown', () => {
  it('escapes pipes and collapses newlines', () => {
    expect(escapeMarkdown('a|b\nc')).toBe('a\\|b c')
  })
})

describe('firstLine', () => {
  it('returns empty string for undefined', () => {
    expect(firstLine(undefined)).toBe('')
  })

  it('returns the first trimmed line', () => {
    expect(firstLine('  hello\nworld')).toBe('hello')
  })

  it('truncates with an ellipsis when longer than max', () => {
    const result = firstLine('x'.repeat(200), 10)
    expect(result).toHaveLength(10)
    expect(result.endsWith('…')).toBe(true)
  })
})
