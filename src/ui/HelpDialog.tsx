/**
 * The Help viewer (top-bar "Help" button): a large overlay dialog with a
 * sidebar tree of the bundled user-doc pages (docs/help/**, STYLE.md
 * excluded) and a scrollable content pane rendering the current page as
 * markdown (GFM tables, heading anchors via rehype-slug).
 *
 * The markdown is bundled at build time via import.meta.glob (?raw) and
 * the screenshots via (?url) — nothing fetches at runtime, dev server
 * and production build behave identically. Internal links swap the
 * content pane (sidebar clicks, cross-page links, #heading anchors);
 * external http(s) links open a new tab. Doc screenshots pop out into a
 * lightbox at full resolution (click to enlarge). Glossary-term links
 * pop a dictionary-style popup with just that term's definition — the
 * page behind never moves; links inside the popup swap the popup.
 * Escape closes innermost-first (lightbox → glossary popup → dialog).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import {
  buildDocsTree,
  docKeyToPage,
  findGlossaryEntry,
  GLOSSARY_PAGE,
  landingPageOf,
  pageTitle,
  parseFrontmatter,
  resolveDocLink,
  resolveDocPath,
  splitGlossaryEntries,
  type AxesTag,
  type HelpPageMeta,
} from './helpDocs';

/** every help page, bundled raw at build time (STYLE.md is contributor
 * meta-doc, not user help) */
const mdSources = import.meta.glob('/docs/help/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** every help screenshot, as a build-time asset URL */
const imageUrls = import.meta.glob('/docs/help/images/**/*.png', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** chips an `axes:` tag renders as. A 4-axis-only subject doesn't get a
 * plain "4-axis" chip — it reads "requires 4th axis", amber, because
 * that's a requirement, not an option */
const AXES_CHIPS: Record<AxesTag, { label: string; required?: boolean }[]> = {
  '3': [{ label: '3-axis' }],
  '4': [{ label: 'requires 4th axis', required: true }],
  '3+4': [{ label: '3-axis' }, { label: '4-axis' }],
};

/** page id → raw markdown, frontmatter stripped */
const pages = new Map<string, HelpPageMeta & { body: string; axes: AxesTag | null }>();
for (const [key, raw] of Object.entries(mdSources)) {
  const path = docKeyToPage(key);
  if (path === '' || path === 'STYLE.md') continue;
  const parsed = parseFrontmatter(raw);
  pages.set(path, { path, title: pageTitle(path, raw), body: parsed.body, axes: parsed.axes });
}

/** resolved image URL by its docs-tree-relative path ("images/ops/…") */
const imageUrlByPath = new Map<string, string>();
for (const [key, url] of Object.entries(imageUrls)) {
  imageUrlByPath.set(docKeyToPage(key), url);
}

/** the glossary parsed into per-term sections — dictionary popups draw
 * from this, never the whole page */
const glossaryEntries = splitGlossaryEntries(pages.get(GLOSSARY_PAGE)?.body ?? '');

/** the sidebar tree, stable — computed once from the bundled set */
const tree = buildDocsTree([...pages.values()]);

/** first page shown when the viewer opens: the landing page when the
 * docs ship one, else the first tree entry */
const defaultPage = landingPageOf(tree);

interface Props {
  onClose: () => void;
}

/** Markdown element overrides for one render context: rewrite in-doc
 * links and images against `fromPage`'s location in the docs tree.
 * Glossary-term links (`glossary.md#…`) pop the term's definition via
 * `onGlossaryTerm` when given (and the section exists) instead of
 * navigating; every other link goes through `onNavigate`; screenshots
 * pop out via `onImage`. */
function makeComponents(
  fromPage: string,
  onGlossaryTerm: ((anchor: string) => void) | null,
  onNavigate: (page: string, anchor: string | null) => void,
  onImage: (src: string, alt: string) => void,
): Components {
  return {
    a({ href, children }) {
      const target = href ?? '';
      if (/^(https?:)?\/\//i.test(target) || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
        return (
          <a href={target} target="_blank" rel="noreferrer">
            {children}
          </a>
        );
      }
      const resolved = resolveDocLink(fromPage, target);
      if (!resolved) return <a>{children}</a>;
      if (
        resolved.page === GLOSSARY_PAGE &&
        resolved.anchor !== null &&
        onGlossaryTerm &&
        findGlossaryEntry(glossaryEntries, resolved.anchor)
      ) {
        const anchor = resolved.anchor;
        return (
          <a
            href={target} // keeps the browser's status line honest; clicks are intercepted
            onClick={(e) => {
              e.preventDefault();
              onGlossaryTerm(anchor);
            }}
          >
            {children}
          </a>
        );
      }
      return (
        <a
          href={target} // keeps the browser's status line honest; clicks are intercepted
          onClick={(e) => {
            e.preventDefault();
            onNavigate(resolved.page, resolved.anchor);
          }}
        >
          {children}
        </a>
      );
    },
    img({ src, alt }) {
      const url = typeof src === 'string' ? imageUrlByPath.get(resolveDocPath(fromPage, src)) : undefined;
      if (!url) return <span className="help-missing-image">{alt}</span>;
      // screenshots are 1600px+ — click pops the full-resolution asset
      // into the lightbox (the reading column only shows a fit)
      return (
        <span
          className="help-image"
          role="button"
          aria-label="Enlarge screenshot"
          onClick={() => onImage(url, alt ?? '')}
        >
          <img src={url} alt={alt ?? ''} loading="lazy" />
        </span>
      );
    },
  };
}

export function HelpDialog(props: Props) {
  const [pagePath, setPagePath] = useState(defaultPage);
  const [anchor, setAnchor] = useState<string | null>(null);
  /** the lightboxed screenshot: its asset URL + alt, null when closed */
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  /** the open dictionary popup's glossary anchor, null when closed */
  const [term, setTerm] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /** Swap the content pane (sidebar click or in-doc link). An anchor
   * scroll follows once the new markdown is mounted. */
  const navigate = (page: string, anchor: string | null) => {
    setPagePath(pages.has(page) ? page : defaultPage);
    setAnchor(anchor);
  };

  /** scroll to the anchor after render, else reset to the top */
  useEffect(() => {
    const pane = contentRef.current;
    if (!pane) return;
    const el = anchor ? pane.querySelector(`#${CSS.escape(anchor)}`) : null;
    if (el) el.scrollIntoView({ block: 'start' });
    else pane.scrollTop = 0;
  }, [pagePath, anchor]);

  /** Escape closes innermost-first: the lightbox, then the glossary
   * popup, then the dialog (plus the ✕) — like the other dialogs */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lightbox) setLightbox(null);
      else if (term) setTerm(null);
      else props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, term, props.onClose]);

  /** markdown element overrides for the content pane: glossary-term
   * links pop the term's dictionary popup (missing sections fall back
   * to opening the glossary page in the pane) */
  const components = useMemo<Components>(
    () =>
      makeComponents(
        pagePath,
        (anchor) => setTerm(anchor),
        navigate,
        (src, alt) => setLightbox({ src, alt }),
      ),
    // navigate is stable enough for the pane's lifetime (it only sets state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pagePath],
  );

  /** and for the dictionary popup: glossary-term links swap the popup
   * (dictionary browsing), anything else falls through to the pane and
   * dismisses the popup — the page behind never moves for a term */
  const termComponents = useMemo<Components>(
    () =>
      makeComponents(
        GLOSSARY_PAGE,
        (anchor) => setTerm(anchor),
        (page_, anchor_) => {
          setTerm(null);
          navigate(page_, anchor_);
        },
        (src, alt) => setLightbox({ src, alt }),
      ),
    // navigate is stable enough (it only sets state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const activeTerm = term ? findGlossaryEntry(glossaryEntries, term) : null;
  const page = pages.get(pagePath) ?? pages.get(defaultPage);

  return (
    <>
      <div className="modal-overlay">
        <div className="modal help-modal" role="dialog" aria-modal="true" aria-label="Help">
          <h2>
            Help
            <button
              type="button"
              className="icon-btn"
              title="Close (Esc)"
              onClick={props.onClose}
            >
              ✕
            </button>
          </h2>
          <div className="help-body">
            <nav className="help-sidebar">
              {tree.map((group, gi) => (
                // two groups can share dir=null (landing page / trailing
                // root pages) — key on position, the tree is static
                <div key={`${group.dir ?? 'root'}-${gi}`} className="help-group">
                  {group.dir !== null && <div className="help-group-label">{group.label}</div>}
                  {group.pages.map((p) => (
                    <button
                      key={p.path}
                      type="button"
                      className={`help-page-btn${p.path === pagePath ? ' active' : ''}`}
                      onClick={() => navigate(p.path, null)}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <div className="help-content" ref={contentRef}>
              {page && (
                <article className="help-doc" key={page.path}>
                  {page.axes && (
                    <div className="help-axes">
                      {AXES_CHIPS[page.axes].map((chip) => (
                        <span
                          key={chip.label}
                          className={`axis-chip${chip.required ? ' required' : ''}`}
                        >
                          {chip.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSlug]}
                    components={components}
                  >
                    {page.body}
                  </ReactMarkdown>
                </article>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* the screenshot lightbox: full-resolution asset over everything,
       * scrollable when bigger than the viewport, click anywhere dismisses */}
      {lightbox && (
        <div
          className="help-lightbox"
          role="button"
          aria-label="Close enlarged screenshot"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox.src} alt={lightbox.alt} />
        </div>
      )}
      {/* the dictionary popup: ONE glossary term's definition over the
       * unchanged page; backdrop click dismisses, ✕ top-right, term links
       * inside swap the popup (dictionary browsing) */}
      {term && activeTerm && (
        <div
          className="help-lightbox help-term-overlay"
          role="button"
          aria-label="Close definition"
          onClick={() => setTerm(null)}
        >
          <div
            className="modal help-term"
            role="dialog"
            aria-modal="true"
            aria-label={activeTerm.title}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>
              {activeTerm.title}
              <button
                type="button"
                className="icon-btn"
                title="Close (Esc)"
                onClick={() => setTerm(null)}
              >
                ✕
              </button>
            </h2>
            <div className="help-doc help-term-doc">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSlug]}
                components={termComponents}
              >
                {activeTerm.md}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
