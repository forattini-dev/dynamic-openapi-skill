export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function toTitleCase(text: string): string {
  return text
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

export function firstLine(text: string | undefined, max = 160): string {
  if (!text) return ''
  const line = text.split('\n')[0]?.trim() ?? ''
  if (line.length <= max) return line
  return line.slice(0, max - 1).trimEnd() + '…'
}
