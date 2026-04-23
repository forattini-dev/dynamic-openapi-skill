import type { OpenAPIV3 } from 'dynamic-openapi-tools/parser'
import type { OperationFilters, ParsedSpec } from 'dynamic-openapi-tools/parser'

export interface GenerateSkillOptions {
  source: string | OpenAPIV3.Document
  name?: string
  description?: string
  baseUrl?: string
  serverIndex?: number
  splitThreshold?: number
  includeExamples?: boolean
  /** Filter which operations land in the generated SKILL.md. `x-hidden: true` on the operation is always honored. */
  filters?: OperationFilters
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
