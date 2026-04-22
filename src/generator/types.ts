import type { OpenAPIV3 } from 'openapi-types'
import type { ParsedSpec } from '../parser/types.js'

export interface GenerateSkillOptions {
  source: string | OpenAPIV3.Document
  name?: string
  description?: string
  baseUrl?: string
  serverIndex?: number
  splitThreshold?: number
  includeExamples?: boolean
}

export interface SkillFile {
  path: string
  content: string
}

export interface SpecMetadata {
  apiVersion: string
  source: string
  md5: string
  generatorVersion: string
}

export interface GeneratedSkill {
  name: string
  description: string
  spec: ParsedSpec
  files: SkillFile[]
  metadata: SpecMetadata
}
