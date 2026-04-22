<div align="center">

# dynamic-openapi-skill

### Any OpenAPI spec. Instant Claude skill.

Point it at a spec — every endpoint becomes a documented operation inside a `SKILL.md` that Claude Code loads on demand.
<br>
**OpenAPI v3** • **JSON & YAML** • **curl examples** • **Zero runtime**

[![npm version](https://img.shields.io/npm/v/dynamic-openapi-skill.svg?style=flat-square&color=F5A623)](https://www.npmjs.com/package/dynamic-openapi-skill)
[![npm downloads](https://img.shields.io/npm/dm/dynamic-openapi-skill.svg?style=flat-square&color=34C759)](https://www.npmjs.com/package/dynamic-openapi-skill)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/npm/l/dynamic-openapi-skill.svg?style=flat-square&color=007AFF)](./LICENSE)

[Quick Start](#quick-start) · [What you get](#what-you-get) · [Install the skill](#install-the-generated-skill) · [Programmatic API](#programmatic-usage) · [CLI](#cli-reference)

</div>

---

## Quick Start

```bash
npx dynamic-openapi-skill -s https://petstore3.swagger.io/api/v3/openapi.json -o ./petstore
```

That's it. 60 seconds later, Claude Code knows your API.

```
petstore/
└── SKILL.md          # ready to drop into ~/.claude/skills/petstore/
```

Next time the user says *"list available pets on staging"*, Claude loads the skill, builds the right `curl` call, and returns real data — **no MCP server, no CLI binary, no runtime dependency**.

---

## Table of Contents

- [The family](#the-family)
- [What is a skill?](#what-is-a-skill)
- [What you get](#what-you-get)
- [Install the generated skill](#install-the-generated-skill)
- [Sample output](#sample-output)
- [CLI Reference](#cli-reference)
- [Filtering operations](#filtering-operations)
- [Programmatic Usage](#programmatic-usage)
- [How the mapping works](#how-the-mapping-works)
- [Splitting large specs](#splitting-large-specs)
- [Authentication section](#authentication-section)
- [Drift detection](#drift-detection)
- [Tips](#tips-for-the-perfect-skill)
- [License](#license)

---

## The family

Three projects, one spec, three output surfaces — pick the one that fits the use case:

| Sibling | Output | Runs when | Best when |
|:--------|:-------|:----------|:----------|
| [`dynamic-openapi-mcp`](https://github.com/forattini-dev/dynamic-openapi-mcp) | Live MCP server (stdio) | Every tool call spins the server | You want real-time introspection, auto-refreshed OAuth tokens, typed tool I/O |
| [`dynamic-openapi-cli`](https://github.com/forattini-dev/dynamic-openapi-cli) | Bash CLI (optionally bundled) | Humans and scripts invoke it | You want a commit-friendly shim humans and CI can run |
| [`dynamic-openapi-skill`](#) | **Static `SKILL.md`** | Claude loads it on demand | You want zero runtime, diff-friendly docs, and model-driven calls via `curl` / `fetch` |

> All three share the same parser. Switching between them is a matter of pointing them at the same spec.

---

## What is a skill?

A **Claude Code skill** is a plain markdown file with YAML frontmatter. Claude reads the frontmatter's `description` to decide when the skill is relevant, then loads the body on demand:

```markdown
---
name: petstore
description: Call the Petstore API. Use when the user wants to list, create, or update pets.
---

# Petstore
...
```

No daemon. No HTTP. The skill lives at `~/.claude/skills/<name>/SKILL.md` (user) or `.claude/skills/<name>/SKILL.md` (project). When the description matches the conversation, Claude pulls in the body and starts calling the API with its built-in tools.

`dynamic-openapi-skill` turns an OpenAPI v3 spec into exactly this file, ready to drop in.

---

## What you get

A single `SKILL.md` with every section Claude needs to call the API correctly:

| Section | Source in OpenAPI |
|:--------|:------------------|
| **YAML frontmatter** (`name`, `description`) | `info.title` + `info.description` (overridable) |
| **Base URL table** | `servers[]`, with `{variables}` resolved to their defaults |
| **Authentication** | `components.securitySchemes` — bearer / API key / OAuth2 / OpenID |
| **Tag overview** | `tags[]` with descriptions |
| **Operations** | Every `paths.*.{get,post,…}` with params, request body schema, responses, security, and a runnable curl example |
| **External docs** | `externalDocs` links trailing the document |

For big specs (default >20 operations), each tag is broken into `references/<tag>.md` so Claude loads only the area it needs. See [Splitting large specs](#splitting-large-specs).

---

## Install the generated skill

### Claude Code — user-level

```bash
npx dynamic-openapi-skill -s ./spec.yaml -o ~/.claude/skills/petstore
```

Now **every** Claude Code session on this machine has access to `petstore`. The skill stays dormant until the user mentions something that matches the `description`.

### Claude Code — project-level (recommended for teams)

```bash
npx dynamic-openapi-skill -s ./spec.yaml -o ./.claude/skills/petstore
git add .claude/skills/petstore
git commit -m "docs(skills): add petstore API skill"
```

Now the skill ships with the repo. Every teammate's Claude instance learns the API on clone — no MCP config, no tokens, no setup.

### Claude.ai projects

Upload the generated `SKILL.md` (and the `references/` directory if it exists) as project knowledge. Same effect, different delivery mechanism.

---

## Sample output

Feed it the classic Petstore spec…

```bash
npx dynamic-openapi-skill -s ./petstore.yaml -o ./petstore
```

…and the top of the generated `SKILL.md` looks like this:

````markdown
---
name: petstore
description: A sample API that uses a petstore as an example. Use when the user wants to interact with Petstore.
---

# Petstore

A sample API that uses a petstore as an example

## When to use

Load this skill when the user needs to call **Petstore** (v1.0.0).
Each operation below maps to a single HTTP request — build the URL from the
base URL plus the operation path, substituting path parameters, then send
the request with the HTTP client of your choice (`curl`, `fetch`, `httpx`, etc).

## Base URL

| URL                                       | Description        |
|-------------------------------------------|--------------------|
| `https://petstore.example.com/v1`         | Production         |
| `https://sandbox.petstore.example.com/v1` | Sandbox            |

Default: `https://petstore.example.com/v1`

## Authentication

### `bearerAuth`
- Type: HTTP bearer
- Send: `Authorization: Bearer <token>`
````

Each operation gets a full drill-down:

````markdown
#### `listPets`

**`GET /pets`**

List all pets

Tags: `pets`

##### Parameters

| Name      | In    | Required | Type                                          | Description              |
|-----------|-------|----------|-----------------------------------------------|--------------------------|
| `limit`   | query | no       | integer(int32)                                | How many items to return |
| `status`  | query | no       | enum("available" \| "pending" \| "sold")      | Filter by status         |

##### Responses

| Status | Description    | Media type         | Type            |
|--------|----------------|--------------------|-----------------|
| `200`  | A list of pets | `application/json` | array<object>   |

##### Security

`bearerAuth`

##### Example

```bash
curl -X GET 'https://petstore.example.com/v1/pets' \
  -H 'Authorization: Bearer $TOKEN'
```
````

And for `POST` / `PUT` / `PATCH` it renders the request body schema as a compact YAML tree so Claude can build the payload without ever reading raw JSON Schema:

````markdown
##### Request body

Required: yes

`application/json`

```yaml
type: object
required: [name]
properties:
  name:
    type: string
  tag:
    type: string
  status:
    type: string
    enum: ["available", "pending", "sold"]
```
````

---

## CLI Reference

```
dynamic-openapi-skill [options] [source]

Options:
  -s, --source <url|file>       OpenAPI spec URL or file path
  -o, --out <dir>               Output directory for the generated skill
      --name <name>             Skill name (default: slug of spec title)
      --description <text>      Frontmatter description
  -b, --base-url <url>          Override the base URL from the spec
      --server-index <n>        Use the Nth server entry (default: 0)
      --split-threshold <n>     Split into references/<tag>.md when ops > N (default: 20)
      --include-tag <name>      Only include operations with this tag (repeatable, comma-separated)
      --exclude-tag <name>      Exclude operations with this tag (repeatable, comma-separated)
      --include-operation <id>  Only include these operationIds (repeatable, comma-separated)
      --exclude-operation <id>  Exclude these operationIds (repeatable, comma-separated)
      --no-examples             Omit curl snippets
      --stdout                  Print SKILL.md to stdout instead of writing files
  -h, --help                    Show help
```

| Environment variable   | Purpose                                    |
|:-----------------------|:-------------------------------------------|
| `OPENAPI_SOURCE`       | Spec URL or file (alternative to `-s`)     |
| `OPENAPI_BASE_URL`     | Override base URL                          |
| `OPENAPI_SERVER_INDEX` | Select server entry (0-based)              |

### Recipes

```bash
# pipe the skill directly into a file (great in CI)
npx dynamic-openapi-skill -s ./spec.yaml --stdout > SKILL.md

# use a custom name and pin to the sandbox server
npx dynamic-openapi-skill -s ./spec.yaml -o ./sandbox-skill \
  --name petstore-sandbox --server-index 1

# giant API — split earlier than the default
npx dynamic-openapi-skill -s ./stripe.json -o ./stripe-skill --split-threshold 10

# strip curl examples (smaller skill, Claude figures out the requests)
npx dynamic-openapi-skill -s ./spec.yaml -o ./lean-skill --no-examples

# read-only skill: only the `pets` tag makes it to SKILL.md
npx dynamic-openapi-skill -s ./spec.yaml -o ./pets-skill --include-tag pets

# hide admin endpoints and a noisy op
npx dynamic-openapi-skill -s ./spec.yaml -o ./user-skill \
  --exclude-tag admin --exclude-operation debugDump
```

---

## Filtering operations

Not every endpoint should land in the generated `SKILL.md`. Two ways to slice:

### Flags (and programmatic `filters`)

Flags accept repeated values or comma-separated lists:

```bash
# allowlist by tag
dynamic-openapi-skill -s ./spec.yaml -o ./skill --include-tag pets --include-tag store

# denylist by tag
dynamic-openapi-skill -s ./spec.yaml -o ./skill --exclude-tag admin

# allowlist by operationId
dynamic-openapi-skill -s ./spec.yaml -o ./skill --include-operation listPets,getPetById

# allowlist a whole tag, minus one op
dynamic-openapi-skill -s ./spec.yaml -o ./skill --include-tag pets --exclude-operation deletePet
```

Programmatic equivalent:

```typescript
const skill = await generateSkill({
  source: './spec.yaml',
  filters: {
    tags: { include: ['pets'], exclude: ['admin'] },
    operations: { include: ['healthCheck'], exclude: ['debugDump'] },
  },
})
```

**Precedence** (first match wins): `x-hidden` → `operations.exclude` → `operations.include` → `tags.exclude` → includes as allowlist. `operations.include` escapes a matching `tags.exclude`, but `operations.exclude` wins over everything except `x-hidden`.

### `x-hidden` vendor extension

Hide an endpoint at the spec level — applies to every consumer in the family (skill, CLI, MCP):

```yaml
paths:
  /admin/reset:
    post:
      operationId: adminReset
      x-hidden: true        # always removed, regardless of filter flags
```

Good for endpoints that ship in the spec for completeness but shouldn't be surfaced to AI agents, CLI users, or skill consumers.

---

## Programmatic Usage

```bash
pnpm add dynamic-openapi-skill
```

```typescript
import { generateSkill, writeSkill } from 'dynamic-openapi-skill'

const skill = await generateSkill({
  source: './spec.yaml',
  name: 'billing',
  description: 'Call the internal Billing API — invoices, payments, refunds.',
  baseUrl: 'https://api.example.com',
  splitThreshold: 15,
  includeExamples: true,
})

await writeSkill(skill, './.claude/skills/billing')

console.log(`Generated ${skill.files.length} file(s) from ${skill.spec.operations.length} operations`)
```

### Keep the output in memory

```typescript
const skill = await generateSkill({ source: './spec.yaml' })

for (const file of skill.files) {
  console.log(file.path, file.content.length, 'bytes')
}
```

### Drive it from an inline spec

```typescript
const skill = await generateSkill({
  source: {
    openapi: '3.0.3',
    info: { title: 'Hello', version: '1.0.0' },
    servers: [{ url: 'https://api.hello.dev' }],
    paths: {
      '/hello': {
        get: {
          operationId: 'sayHello',
          summary: 'Say hello',
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  },
})
```

### Inspect the parsed spec

```typescript
console.log(skill.spec.title)        // "Billing API"
console.log(skill.spec.operations)   // ParsedOperation[]
console.log(skill.spec.schemas.Pet)  // dereferenced schema
```

---

## How the mapping works

### Operations → Markdown sections

| OpenAPI                                | Rendered as                                                |
|:---------------------------------------|:-----------------------------------------------------------|
| `operationId: listPets`                | `#### \`listPets\`` — stable anchor for Claude to cite     |
| `GET /pets/{petId}` (no operationId)   | `get_pets_by_petId` (same fallback as the MCP sibling)     |
| `summary` / `description`              | Paragraphs under the heading                               |
| Path + query + header params           | Parameters table with type, required, and description     |
| `parameter.schema.enum`                | Collapsed to `enum("a" \| "b")` inline                     |
| Request body (`application/json`, …)   | Media-type block with YAML schema tree                     |
| Responses                              | Table with status, description, media type, type          |
| `security`                             | Scheme list (`OR` between entries, `+` between schemes)   |
| `externalDocs`                         | Trailing "See also" link                                   |

### Curl examples

For every operation (unless `--no-examples`), a runnable `curl` snippet is included:

- **Path params** — filled from `schema.example` → `default` → `enum[0]` → primitive fallback.
- **Required query params** — appended to the URL, percent-encoded.
- **Auth headers** — reflect the operation's `security`:
  - `http bearer` / `oauth2` → `Authorization: Bearer $TOKEN`
  - `http basic` → `-u "$USER:$PASSWORD"`
  - `apiKey` in `header` → `X-Your-Header: $API_KEY`
- **Body shape** — JSON pretty-printed, form-urlencoded via `--data-urlencode`, multipart via `-F`, octet-stream via `--data-binary`.

Claude reads the snippet as a template — it substitutes the real placeholders when the user provides them, then executes with its built-in shell tool.

### Schemas

Schemas come out as compact YAML rather than raw JSON Schema:

```yaml
type: object
required: [id, name]
properties:
  id:
    type: integer
    format: int64
  name:
    type: string
  tags:
    type: array
    items:
      type: string
```

`allOf` / `oneOf` / `anyOf`, `$ref`s (already dereferenced), enums, formats, min/max, pattern, and defaults all come through. The goal is shape over ceremony — enough for the model to construct a correct payload without parsing a JSON Schema validator.

---

## Splitting large specs

When `spec.operations.length > splitThreshold` (default **20**), the generator splits:

```
my-api/
├── SKILL.md            # overview, auth, base URLs, tag index
└── references/
    ├── pets.md         # every op tagged `pets`
    ├── users.md        # every op tagged `users`
    └── orders.md       # every op tagged `orders`
```

The top-level `SKILL.md` keeps a one-line index so Claude only loads the tag area that matches the user's intent — matches the progressive-disclosure pattern Claude Code skills are designed for.

Adjust or disable it:

```bash
# split earlier
--split-threshold 10

# never split (single SKILL.md even for 500 ops)
--split-threshold 100000
```

---

## Authentication section

The `Authentication` block is rendered from `components.securitySchemes`:

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
    apiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
    oauth:
      type: oauth2
      flows:
        clientCredentials:
          tokenUrl: https://auth.example.com/oauth/token
          scopes:
            pets:read: Read pets
            pets:write: Write pets
```

…becomes:

```markdown
### `bearerAuth`
- Type: HTTP bearer
- Send: `Authorization: Bearer <token>`

### `apiKeyAuth`
- Type: API key
- Location: header
- Name: `X-API-Key`

### `oauth`
- Type: OAuth 2.0
- Flow `clientCredentials`:
  - Token URL: https://auth.example.com/oauth/token
  - Scopes:
    - `pets:read` — Read pets
    - `pets:write` — Write pets
```

The skill **does not** embed tokens. It tells Claude *what* to send — the actual token comes from the environment at call time, just like a human operator would handle it.

---

## Drift detection

Every generated `SKILL.md` ends with a `## Spec metadata` block:

```markdown
## Spec metadata

<!-- dynamic-openapi-skill: do not edit by hand — regenerate from the spec -->

- API version: `1.0.0`
- Source: `https://petstore3.swagger.io/api/v3/openapi.json`
- Spec MD5: `402cfcce6024227c862296f0937d00f2`
- Generated by `dynamic-openapi-skill@0.1.0`
```

The MD5 is taken from the **raw spec text**, so `md5sum spec.yaml` from a human matches the committed value byte-for-byte. Two ways to use it:

```bash
# quick local check — is the committed skill still in sync with the spec?
grep 'Spec MD5:' .claude/skills/petstore/SKILL.md
#   - Spec MD5: `402cfcce6024227c862296f0937d00f2`
md5sum ./openapi.yaml
#   402cfcce6024227c862296f0937d00f2  ./openapi.yaml
```

```yaml
# CI drift check — fail the build if upstream drifted
- name: Regenerate skill and diff
  run: |
    npx dynamic-openapi-skill -s $SPEC_URL -o /tmp/fresh
    diff .claude/skills/petstore/SKILL.md /tmp/fresh/SKILL.md
```

The metadata block is also available programmatically on the result:

```typescript
const skill = await generateSkill({ source: './spec.yaml' })
console.log(skill.metadata)
// { apiVersion: '1.0.0', source: './spec.yaml', md5: '402cfcce…', generatorVersion: '0.1.0' }
```

---

## Tips for the perfect skill

- **Write a sharp `--description`.** The frontmatter description is the only thing Claude sees until the skill loads. Lead with the verb the user is likely to say ("list invoices", "refund a payment"), not the vendor name.
- **Pin the base URL to the right environment.** `--server-index 1` (sandbox) during onboarding; `--server-index 0` (production) for the shipped skill. Or pass `--base-url` to override entirely.
- **Commit the skill next to the code it documents.** Project-level skills win over user-level skills for teams — the whole repo gets the same guidance.
- **Regenerate on CI.** See [Drift detection](#drift-detection) — the `Spec metadata` block makes it one `diff` away.
- **Split aggressively on huge APIs.** A 500-operation SKILL.md is a context-window hazard. `--split-threshold 10` turns it into a thin index + one file per tag.

---

## License

MIT
