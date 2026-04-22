import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { GeneratedSkill } from './generator/types.js'

export async function writeSkill(skill: GeneratedSkill, outDir: string): Promise<string[]> {
  const written: string[] = []
  for (const file of skill.files) {
    const full = join(outDir, file.path)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, file.content, 'utf-8')
    written.push(full)
  }
  return written
}
