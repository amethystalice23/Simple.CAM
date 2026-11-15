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
 * lightbox at full resolution (click to enlarge). Escape closes the
 * lightbox first, then the dialog.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import {
  buildDocsTree,
  docKeyToPage,
  landingPageOf,
  pageTitle,
  parseFrontmatter,
  resolveDocLink,
  resolveDocPath,
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

/** page id → raw markdown, frontmatter stripped */
const pages = new Map<string, HelpPageMeta & { body: string }>();
for (const [key, raw] of Object.entries(mdSources)) {
  const path = docKeyToPage(key);
  if (path === '' || path === 'STYLE.md') continue;
  const parsed = parseFrontmatter(raw);
  pages.set(path, { path, title: pageTitle(path, raw), body: parsed.body });
}

/** resolved image URL by its docs-tree-relative path ("images/ops/…") */
const imageUrlByPath = new Map<string, string>();
for (const [key, url] of Object.entries(imageUrls)) {
  imageUrlByPath.set(docKeyToPage(key), url);
}

/** the sidebar tree, stable — computed once from the bundled set */
const tree = buildDocsTree([...pages.values()]);

/** first page shown when the viewer opens: the landing page when the
 * docs ship one, else the first tree entry */
const defaultPage = landingPageOf(tree);

interface Props {
  onClose: () => void;
}

export function HelpDialog(props: Props) {
  const [pagePath, setPagePath] = useState(defaultPage);
  const [anchor, setAnchor] = useState<string | null>(null);
  /** the lightboxed screenshot: its asset URL + alt, null when closed */
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
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

  /** Escape closes the lightbox first, then the dialog (plus the ✕) —
   * like the other dialogs */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lightbox) setLightbox(null);
      else props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, props.onClose]);

  /** markdown element overrides: rewrite in-doc links and images against
   * the CURRENT page's location in the docs tree */
  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        const target = href ?? '';
        if (/^(https?:)?\/\//i.test(target) || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
          return (
            <a href={target} target="_blank" rel="noreferrer">
              {children}
            </a>
          );
        }
        const resolved = resolveDocLink(pagePath, target);
        if (!resolved) return <a>{children}</a>;
        return (
          <a
            href={target} // keeps the browser's status line honest; clicks are intercepted
            onClick={(e) => {
              e.preventDefault();
              navigate(resolved.page, resolved.anchor);
            }}
          >
            {children}
          </a>
        );
      },
      img({ src, alt }) {
        const url = typeof src === 'string' ? imageUrlByPath.get(resolveDocPath(pagePath, src)) : undefined;
        if (!url) return <span className="help-missing-image">{alt}</span>;
        // screenshots are 1600px+ — click pops the full-resolution asset
        // into the lightbox (the reading column only shows a fit)
        return (
          <span
            className="help-image"
            role="button"
            aria-label="Enlarge screenshot"
            onClick={() => setLightbox({ src: url, alt: alt ?? '' })}
          >
            <img src={url} alt={alt ?? ''} loading="lazy" />
          </span>
        );
      },
    }),
    // navigate is stable enough for the pane's lifetime (it only sets state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pagePath],
  );

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
    </>
  );
}
