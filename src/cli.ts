import { generateSkill } from './generator/skill.js'
import { writeSkill } from './writer.js'

interface CliArgs {
  source?: string
  out?: string
  name?: string
  description?: string
  baseUrl?: string
  serverIndex?: number
  splitThreshold?: number
  noExamples?: boolean
  stdout?: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {}

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]

    if ((arg === '-s' || arg === '--source') && next) {
      args.source = next
      i++
    } else if ((arg === '-o' || arg === '--out') && next) {
      args.out = next
      i++
    } else if (arg === '--name' && next) {
      args.name = next
      i++
    } else if (arg === '--description' && next) {
      args.description = next
      i++
    } else if ((arg === '-b' || arg === '--base-url') && next) {
      args.baseUrl = next
      i++
    } else if (arg === '--server-index' && next) {
      const parsed = parseInt(next, 10)
      if (isNaN(parsed) || parsed < 0) {
        console.error(`Error: --server-index must be a non-negative integer, got "${next}"`)
        process.exit(1)
      }
      args.serverIndex = parsed
      i++
    } else if (arg === '--split-threshold' && next) {
      const parsed = parseInt(next, 10)
      if (isNaN(parsed) || parsed < 0) {
        console.error(`Error: --split-threshold must be a non-negative integer, got "${next}"`)
        process.exit(1)
      }
      args.splitThreshold = parsed
      i++
    } else if (arg === '--no-examples') {
      args.noExamples = true
    } else if (arg === '--stdout') {
      args.stdout = true
    } else if (arg === '-h' || arg === '--help') {
      printHelp()
      process.exit(0)
    } else if (arg && !arg.startsWith('-') && !args.source) {
      args.source = arg
    }
  }

  return args
}

function printHelp(): void {
  console.log(`
dynamic-openapi-skill - Generate a Claude Code skill from any OpenAPI v3 spec

Usage:
  dynamic-openapi-skill -s <spec> -o <out-dir> [options]

Options:
  -s, --source <url|file>     OpenAPI spec URL or file path
  -o, --out <dir>             Output directory for the generated skill (required unless --stdout)
      --name <name>           Skill name (default: derived from spec title)
      --description <text>    Skill description (default: derived from spec)
  -b, --base-url <url>        Override the base URL from the spec
      --server-index <n>      Use the Nth server from the spec (0-based, default: 0)
      --split-threshold <n>   Split into references/<tag>.md when operations exceed N (default: 20)
      --no-examples           Omit curl examples from each operation
      --stdout                Print SKILL.md to stdout instead of writing files
  -h, --help                  Show this help

Environment variables:
  OPENAPI_SOURCE              Spec URL or file path (alternative to -s)
  OPENAPI_BASE_URL            Override base URL
  OPENAPI_SERVER_INDEX        Server index (0-based)

Examples:
  dynamic-openapi-skill -s ./spec.yaml -o ./my-api-skill
  dynamic-openapi-skill -s https://petstore3.swagger.io/api/v3/openapi.json -o ./petstore
  dynamic-openapi-skill -s ./spec.yaml --stdout > SKILL.md
`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  const source = args.source ?? process.env['OPENAPI_SOURCE']

  if (!source) {
    console.error('Error: No OpenAPI source specified. Use -s <url|file> or set OPENAPI_SOURCE.')
    console.error('Run dynamic-openapi-skill --help for usage information.')
    process.exit(1)
  }

  const baseUrl = args.baseUrl ?? process.env['OPENAPI_BASE_URL']
  let serverIndex = args.serverIndex
  if (serverIndex === undefined && process.env['OPENAPI_SERVER_INDEX']) {
    const parsed = parseInt(process.env['OPENAPI_SERVER_INDEX'], 10)
    if (!isNaN(parsed) && parsed >= 0) serverIndex = parsed
  }

  try {
    const skill = await generateSkill({
      source,
      name: args.name,
      description: args.description,
      baseUrl,
      serverIndex,
      splitThreshold: args.splitThreshold,
      includeExamples: !args.noExamples,
    })

    if (args.stdout) {
      const skillMd = skill.files.find((f) => f.path === 'SKILL.md')
      if (!skillMd) {
        process.stderr.write('dynamic-openapi-skill: no SKILL.md generated\n')
        process.exit(1)
      }
      process.stdout.write(skillMd.content)
      return
    }

    if (!args.out) {
      console.error('Error: --out <dir> is required (or use --stdout).')
      process.exit(1)
    }

    const written = await writeSkill(skill, args.out)
    process.stderr.write(
      `dynamic-openapi-skill: generated "${skill.name}" — ${skill.spec.operations.length} operations, ${written.length} file${written.length === 1 ? '' : 's'}\n`
    )
    for (const f of written) process.stderr.write(`  ${f}\n`)
  } catch (error) {
    if (error instanceof Error) {
      process.stderr.write(`dynamic-openapi-skill: ${error.message}\n`)
      if (error.stack) process.stderr.write(`${error.stack}\n`)
    } else {
      process.stderr.write(`dynamic-openapi-skill: ${String(error)}\n`)
    }
    process.exit(1)
  }
}

main()
