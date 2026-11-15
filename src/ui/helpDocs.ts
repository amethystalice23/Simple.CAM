/**
 * Pure helpers behind the in-app Help viewer (src/ui/HelpDialog.tsx):
 * frontmatter parsing, the docs-tree builder for the sidebar, and the
 * relative-path resolution that ties the markdown pages together. The
 * markdown itself is bundled at build time (import.meta.glob in
 * HelpDialog.tsx — no runtime fetches); this module only reshapes
 * strings, so it tests without React or the bundler.
 */

export interface HelpPageMeta {
  /** page id, relative to docs/help — e.g. "ops/pocket.md", "glossary.md" */
  path: string;
  /** sidebar label: frontmatter title, else the filename */
  title: string;
}

export interface HelpGroup {
  /** top-level directory under docs/help, null for root-level pages */
  dir: string | null;
  /** sidebar heading ("Operations", "Reference", …) — empty for root */
  label: string;
  pages: HelpPageMeta[];
}

export interface ParsedDoc {
  /** frontmatter `title:` value, null when the page carries none */
  title: string | null;
  /** the markdown body, frontmatter fence and HTML comments stripped */
  body: string;
}

/** Remove HTML comments. Pages carry CAPTURE comments for the
 * screenshot pipeline — they are authoring metadata, never content. */
function stripHtmlComments(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, '');
}

/** Strip a leading YAML frontmatter fence (`---` … `---`) and pull its
 * title. A page without frontmatter parses as no-title/whole-body. */
export function parseFrontmatter(raw: string): ParsedDoc {
  const fence = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!fence) return { title: null, body: stripHtmlComments(raw) };
  const line = /^title:\s*(.+?)\s*$/m.exec(fence[1]);
  const title = line ? line[1].replace(/^["']|["']$/g, '') : null;
  return { title, body: stripHtmlComments(raw.slice(fence[0].length)) };
}

/** Sidebar label: frontmatter title, else the filename minus extension. */
export function pageTitle(path: string, raw: string): string {
  return parseFrontmatter(raw).title ?? path.replace(/.*\//, '').replace(/\.md$/, '');
}

const GROUP_ORDER = ['getting-started', 'concepts', 'ops', 'reference', 'tutorials'];

/** The viewer's landing page: docs/help/index.md when the docs ship one. */
export const LANDING_PAGE = 'index.md';

/** The dictionary page glossary-term links pop out of. */
export const GLOSSARY_PAGE = 'glossary.md';

const GROUP_LABELS: Record<string, string> = {
  'getting-started': 'Getting started',
  concepts: 'Concepts',
  ops: 'Operations',
  reference: 'Reference',
  tutorials: 'Tutorials',
};

/** Sidebar heading for a top-level directory; unknown dirs just capitalize. */
export function groupLabel(dir: string): string {
  return GROUP_LABELS[dir] ?? dir.charAt(0).toUpperCase() + dir.slice(1);
}

/** Build the sidebar tree: the landing page (index.md, when the docs ship
 * one) first, then one group per top-level directory in the pinned order
 * above (unknown dirs trail, alphabetically), and the remaining root-level
 * pages (the glossary) LAST — after all the groups. Pages inside a group
 * sort by title, ties broken by path. */
export function buildDocsTree(pages: HelpPageMeta[]): HelpGroup[] {
  const byTitle = (a: HelpPageMeta, b: HelpPageMeta) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) ||
    a.path.localeCompare(b.path);
  const landing: HelpPageMeta[] = [];
  const root: HelpPageMeta[] = [];
  const byDir = new Map<string, HelpPageMeta[]>();
  for (const p of pages) {
    const slash = p.path.indexOf('/');
    if (slash < 0) {
      if (p.path === LANDING_PAGE) landing.push(p);
      else root.push(p);
    } else {
      const dir = p.path.slice(0, slash);
      const list = byDir.get(dir) ?? [];
      list.push(p);
      byDir.set(dir, list);
    }
  }
  const groups: HelpGroup[] = [];
  if (landing.length > 0) groups.push({ dir: null, label: '', pages: landing });
  const dirs = [...byDir.keys()].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a);
    const ib = GROUP_ORDER.indexOf(b);
    return (ia < 0 ? GROUP_ORDER.length : ia) - (ib < 0 ? GROUP_ORDER.length : ib) || a.localeCompare(b);
  });
  for (const dir of dirs) {
    const pages_ = (byDir.get(dir) ?? []).slice().sort(byTitle);
    groups.push({ dir, label: groupLabel(dir), pages: pages_ });
  }
  if (root.length > 0) groups.push({ dir: null, label: '', pages: root.slice().sort(byTitle) });
  return groups;
}

/** The page the viewer opens on: the landing page (index.md) when the
 * docs ship one — buildDocsTree hoists it to the tree's head — else the
 * first entry of the built sidebar tree. */
export function landingPageOf(tree: HelpGroup[]): string {
  return tree[0]?.pages[0]?.path ?? LANDING_PAGE;
}

/** GitHub-style heading slug, matching rehype-slug's default slugger:
 * lowercase, punctuation stripped (word characters, spaces, hyphens and
 * underscores survive), every space becomes a hyphen one-for-one — so
 * "Tips & pitfalls" slugs to "tips--pitfalls", like GitHub. */
export function githubSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

export interface GlossaryEntry {
  /** heading slug — what a `glossary.md#…` anchor points at */
  anchor: string;
  /** the raw heading text ("A axis") */
  title: string;
  /** the section's markdown, heading line included (the popup shows it) */
  md: string;
}

/** Split the glossary body into per-term sections at `### ` headings.
 * Each section keeps its heading (so the popup renders the term name)
 * and is keyed by the GitHub slug of that heading. */
export function splitGlossaryEntries(body: string): GlossaryEntry[] {
  const entries: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of body.split('\n')) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current) entries.push(current);
      current = { title: heading[1], lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) entries.push(current);
  return entries.map((e) => ({
    anchor: githubSlug(e.title),
    title: e.title,
    md: e.lines.join('\n').replace(/\s+$/, ''),
  }));
}

/** The entry a `glossary.md#anchor` link points at, or null when no
 * section matches (the caller falls back to opening the page). */
export function findGlossaryEntry(entries: GlossaryEntry[], anchor: string): GlossaryEntry | null {
  return entries.find((e) => e.anchor === anchor) ?? null;
}

/** Join a relative href against the current page's directory within the
 * docs tree, normalizing `.`/`..` — "ops/pocket.md" + "../glossary.md"
 * → "glossary.md". */
export function resolveDocPath(fromPage: string, href: string): string {
  const dir = fromPage.includes('/') ? fromPage.slice(0, fromPage.lastIndexOf('/') + 1) : '';
  const out: string[] = [];
  for (const part of (dir + href).split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

export interface ResolvedDocLink {
  page: string;
  /** heading anchor without the '#', null when the link targets the page */
  anchor: string | null;
}

/** Resolve an in-document markdown link. External URLs (http/https or any
 * other scheme, protocol-relative) return null — the caller opens those
 * in a new tab instead of swapping the pane. A bare `#anchor` targets
 * the current page. */
export function resolveDocLink(fromPage: string, href: string): ResolvedDocLink | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return null;
  const hash = href.indexOf('#');
  const raw = hash >= 0 ? href.slice(0, hash) : href;
  const anchor = hash >= 0 && href.length > hash + 1 ? href.slice(hash + 1) : null;
  if (raw === '') return { page: fromPage, anchor };
  return { page: resolveDocPath(fromPage, raw), anchor };
}

/** Map an import.meta.glob key to a page id: everything after "docs/help/". */
export function docKeyToPage(key: string, marker = 'docs/help/'): string {
  const i = key.indexOf(marker);
  return i >= 0 ? key.slice(i + marker.length) : key;
}
