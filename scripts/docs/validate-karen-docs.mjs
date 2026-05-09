// Karen docs validator. See docs/karen/conventions/docs-spec.md for the rules.
//
// Rules enforced:
//   1. Every Karen surface directory has a DOCUMENTATION.md.
//   2. Every Karen doc has valid frontmatter (archetype, optional karen-surface, status).
//   3. Each archetype has its required H2 headings present.
//   4. Every relative link in any Karen doc resolves to an existing path.
//   5. Every non-test, non-generated source file under a Karen surface is referenced
//      at least once in its module's DOCUMENTATION.md "Files" section.
//   6. KAREN.md lists every Karen DOCUMENTATION.md in its module map.
//
// Run: `bun run docs:validate:karen` (executes `node scripts/docs/validate-karen-docs.mjs`).

import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dirname, "..", "..")

const KAREN_SURFACES = [
  { dir: "packages/karen", surface: "cli" },
  { dir: "packages/web/server/lib/promptcourt", surface: "server" },
  { dir: "packages/ui/src/components/promptcourt", surface: "ui" },
  { dir: "convex", surface: "cloud" },
]

const TRACKED_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"])

const EXCLUDED_PATTERNS = [
  /(^|\/)_generated(\/|$)/,
  /\.test\.(js|mjs|ts|tsx|jsx)$/,
  /\.spec\.(js|mjs|ts|tsx|jsx)$/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)dist(\/|$)/,
  /(^|\/)build(\/|$)/,
]

const ARCHETYPES = {
  module: ["Agent TL;DR", "Purpose", "Files", "Contract", "Data flow", "Invariants", "Change rules", "Tests"],
  scope: ["Agent TL;DR", "In scope", "Out of scope", "How to add a new surface"],
  operations: ["Agent TL;DR", "Prerequisites", "Environment", "Steps", "Verify", "Rollback", "Failure modes"],
  brief: ["Purpose", "Audience", "Tone", "Anti-references", "Strategic principles"],
  decision: ["Context", "Decision", "Consequences", "Date", "Status"],
}

const VALID_SURFACES = new Set(["cli", "server", "ui", "cloud"])
const VALID_STATUSES = new Set(["active", "frozen", "deprecated"])

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const results = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return walk(full)
      return [full]
    }),
  )
  return results.flat()
}

function parseFrontmatter(body) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(body)
  if (!match) return null
  const fm = {}
  for (const line of match[1].split("\n")) {
    const m = /^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.+?)\s*$/.exec(line)
    if (!m) continue
    let value = m[2]
    const hashIndex = value.indexOf(" #")
    if (hashIndex !== -1) value = value.slice(0, hashIndex).trim()
    fm[m[1]] = value
  }
  return fm
}

function stripCodeAndFrontmatter(body) {
  return body.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/```[\s\S]*?```/g, "")
}

function findHeadings(body) {
  const stripped = stripCodeAndFrontmatter(body)
  const headings = []
  for (const line of stripped.split("\n")) {
    const m = /^##\s+(.+?)\s*$/.exec(line)
    if (m) headings.push(m[1])
  }
  return headings
}

function findRelativeLinks(body) {
  const stripped = stripCodeAndFrontmatter(body).replace(/`[^`\n]*`/g, "")
  const links = []
  const re = /\[([^\]]*)\]\(([^)]+)\)/g
  let m
  while ((m = re.exec(stripped)) !== null) {
    const url = m[2].trim()
    if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("mailto:") ||
      url.startsWith("#") ||
      url.startsWith("/")
    )
      continue
    links.push(url)
  }
  return links
}

function extractSection(body, heading) {
  const stripped = stripCodeAndFrontmatter(body)
  const lines = stripped.split("\n")
  const out = []
  let inSection = false
  const want = heading.trim()
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line)
    if (m) {
      if (m[1] === want) {
        inSection = true
        continue
      }
      if (inSection) break
    }
    if (inSection) out.push(line)
  }
  return out.join("\n")
}

async function collectKarenTreeDocs() {
  const root = path.join(repoRoot, "docs", "karen")
  if (!(await exists(root))) return []
  return (await walk(root)).filter((p) => p.endsWith(".md"))
}

async function validate() {
  const errors = []

  const moduleDocs = []
  for (const surface of KAREN_SURFACES) {
    const docPath = path.join(repoRoot, surface.dir, "DOCUMENTATION.md")
    if (!(await exists(docPath))) {
      errors.push(`[rule 1] missing module doc: ${path.relative(repoRoot, docPath)}`)
      continue
    }
    moduleDocs.push({ ...surface, docPath })
  }

  const karenMd = path.join(repoRoot, "KAREN.md")
  const karenMdExists = await exists(karenMd)
  if (!karenMdExists) errors.push(`[rule 6] KAREN.md missing at repo root`)

  const treeDocs = await collectKarenTreeDocs()
  const allDocs = [...treeDocs, ...moduleDocs.map((m) => m.docPath), ...(karenMdExists ? [karenMd] : [])]

  for (const docPath of allDocs) {
    const body = await readFile(docPath, "utf8")
    const rel = path.relative(repoRoot, docPath)

    const fm = parseFrontmatter(body)
    if (!fm) {
      errors.push(`[rule 2] ${rel}: missing frontmatter block`)
      continue
    }
    const archetype = fm.archetype
    if (!archetype || !ARCHETYPES[archetype]) {
      errors.push(`[rule 2] ${rel}: invalid or missing 'archetype' (got: ${archetype ?? "<none>"})`)
      continue
    }
    if (fm.status && !VALID_STATUSES.has(fm.status)) {
      errors.push(`[rule 2] ${rel}: invalid 'status' (got: ${fm.status})`)
    }
    const surface = fm["karen-surface"]
    if (surface && !VALID_SURFACES.has(surface)) {
      errors.push(`[rule 2] ${rel}: invalid 'karen-surface' (got: ${surface})`)
    }

    const headings = new Set(findHeadings(body))
    for (const required of ARCHETYPES[archetype]) {
      if (!headings.has(required)) {
        errors.push(`[rule 3] ${rel}: archetype '${archetype}' missing required H2 '${required}'`)
      }
    }

    const links = findRelativeLinks(body)
    for (const link of links) {
      const cleaned = link.split("#")[0].split("?")[0]
      if (!cleaned) continue
      const target = path.resolve(path.dirname(docPath), cleaned)
      if (!(await exists(target))) {
        errors.push(`[rule 4] ${rel}: relative link does not resolve: ${link}`)
      }
    }
  }

  for (const { dir, docPath } of moduleDocs) {
    const moduleRoot = path.join(repoRoot, dir)
    const moduleFiles = (await walk(moduleRoot)).filter((p) => {
      const ext = path.extname(p)
      if (!TRACKED_EXTENSIONS.has(ext)) return false
      const rel = path.relative(moduleRoot, p)
      return !EXCLUDED_PATTERNS.some((re) => re.test(rel))
    })

    const body = await readFile(docPath, "utf8")
    const filesSection = extractSection(body, "Files")

    for (const file of moduleFiles) {
      const rel = path.relative(moduleRoot, file)
      const baseName = path.basename(file)
      if (!filesSection.includes(rel) && !filesSection.includes(baseName)) {
        errors.push(`[rule 5] ${path.relative(repoRoot, docPath)}: 'Files' section missing reference to ${rel}`)
      }
    }
  }

  if (karenMdExists) {
    const body = await readFile(karenMd, "utf8")
    for (const { dir } of KAREN_SURFACES) {
      const target = `${dir}/DOCUMENTATION.md`
      if (!body.includes(target)) {
        errors.push(`[rule 6] KAREN.md module map missing entry for ${target}`)
      }
    }
  }

  if (errors.length > 0) {
    console.error("Karen docs validation FAILED:")
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  console.log(
    `Karen docs validation PASSED: ${allDocs.length} docs, ${moduleDocs.length} module surfaces, ${treeDocs.length} tree docs.`,
  )
}

validate().catch((err) => {
  console.error(err)
  process.exit(1)
})
