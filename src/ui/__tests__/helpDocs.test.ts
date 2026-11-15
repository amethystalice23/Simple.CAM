import { describe, expect, it } from 'vitest';
import {
  buildDocsTree,
  docKeyToPage,
  landingPageOf,
  pageTitle,
  parseFrontmatter,
  resolveDocLink,
  resolveDocPath,
} from '../helpDocs';

describe('parseFrontmatter', () => {
  it('strips a title fence and returns the body without it', () => {
    const parsed = parseFrontmatter('---\ntitle: Pocket\n---\n# Pocket\n\nBody text.');
    expect(parsed.title).toBe('Pocket');
    expect(parsed.body).toBe('# Pocket\n\nBody text.');
  });

  it('tolerates blank lines and other keys inside the fence', () => {
    const parsed = parseFrontmatter('---\n\ntitle:  A axis \norder: 2\n---\nBody');
    expect(parsed.title).toBe('A axis');
    expect(parsed.body).toBe('Body');
  });

  it('unquotes a quoted title', () => {
    expect(parseFrontmatter('---\ntitle: "Glossary"\n---\n…').title).toBe('Glossary');
  });

  it('passes through a page without frontmatter (reference pages carry none)', () => {
    const parsed = parseFrontmatter('# Fields every operation shares\n\nMost operations…');
    expect(parsed.title).toBeNull();
    expect(parsed.body).toBe('# Fields every operation shares\n\nMost operations…');
  });

  it('does not strip a mid-document --- rule', () => {
    const raw = '# Page\n\n---\n\nmore';
    expect(parseFrontmatter(raw).body).toBe(raw);
  });

  it('strips HTML comments (CAPTURE metadata must not render)', () => {
    const raw = '---\ntitle: Pocket\n---\nIntro.\n\n<!-- CAPTURE: demo state -->\n![fig](../images/ops/pocket-01-select.png)\n';
    expect(parseFrontmatter(raw).body).toBe('Intro.\n\n\n![fig](../images/ops/pocket-01-select.png)\n');
  });

  it('strips HTML comments on pages without frontmatter too', () => {
    expect(parseFrontmatter('Text\n\n<!-- note -->\nmore').body).toBe('Text\n\n\nmore');
  });
});

describe('pageTitle', () => {
  it('prefers the frontmatter title', () => {
    expect(pageTitle('ops/pocket.md', '---\ntitle: Pocket\n---\n…')).toBe('Pocket');
  });
  it('falls back to the filename without extension', () => {
    expect(pageTitle('reference/keyboard-shortcuts.md', '# Keyboard shortcuts')).toBe(
      'keyboard-shortcuts',
    );
    expect(pageTitle('glossary.md', '# Glossary')).toBe('glossary');
  });
});

describe('buildDocsTree', () => {
  it('groups pages by top-level directory, root pages last', () => {
    const tree = buildDocsTree([
      { path: 'reference/fields.md', title: 'Fields' },
      { path: 'ops/pocket.md', title: 'Pocket' },
      { path: 'glossary.md', title: 'Glossary' },
    ]);
    expect(tree.map((g) => g.dir)).toEqual(['ops', 'reference', null]);
    expect(tree[0].label).toBe('Operations');
    expect(tree[1].label).toBe('Reference');
    expect(tree[2].pages.map((p) => p.title)).toEqual(['Glossary']);
    expect(tree[2].label).toBe('');
  });

  it('puts the landing page (index.md) first, before every group', () => {
    const tree = buildDocsTree([
      { path: 'glossary.md', title: 'Glossary' },
      { path: 'ops/pocket.md', title: 'Pocket' },
      { path: 'index.md', title: 'Welcome to simple.cam' },
    ]);
    expect(tree.map((g) => g.dir)).toEqual([null, 'ops', null]);
    expect(tree[0].pages.map((p) => p.path)).toEqual(['index.md']);
    expect(tree[1].pages.map((p) => p.path)).toEqual(['ops/pocket.md']);
    expect(tree[2].pages.map((p) => p.path)).toEqual(['glossary.md']);
  });

  it('sorts pages inside a group by title', () => {
    const tree = buildDocsTree([
      { path: 'ops/pocket.md', title: 'Pocket' },
      { path: 'ops/engrave.md', title: 'Engrave' },
    ]);
    expect(tree[0].pages.map((p) => p.path)).toEqual(['ops/engrave.md', 'ops/pocket.md']);
  });

  it('trails unknown directories after the pinned ones, alphabetically', () => {
    const tree = buildDocsTree([
      { path: 'tutorials/t1.md', title: 'T1' },
      { path: 'getting-started/first.md', title: 'First' },
      { path: 'advanced/cool.md', title: 'Cool' },
      { path: 'ops/pocket.md', title: 'Pocket' },
    ]);
    expect(tree.map((g) => g.dir)).toEqual(['getting-started', 'ops', 'tutorials', 'advanced']);
    expect(tree[3].label).toBe('Advanced');
  });
});

describe('landingPageOf', () => {
  it('opens on index.md when the docs ship one (the tree hoists it to the head)', () => {
    const tree = buildDocsTree([
      { path: 'glossary.md', title: 'Glossary' },
      { path: 'ops/pocket.md', title: 'Pocket' },
      { path: 'index.md', title: 'Welcome to simple.cam' },
    ]);
    expect(landingPageOf(tree)).toBe('index.md');
  });

  it('falls back to the first tree entry without index.md', () => {
    const tree = buildDocsTree([
      { path: 'glossary.md', title: 'Glossary' },
      { path: 'ops/engrave.md', title: 'Engrave' },
    ]);
    expect(landingPageOf(tree)).toBe('ops/engrave.md');
  });
});

describe('resolveDocLink', () => {
  it('resolves ../glossary.md#step-over from an ops page', () => {
    expect(resolveDocLink('ops/pocket.md', '../glossary.md#step-over')).toEqual({
      page: 'glossary.md',
      anchor: 'step-over',
    });
  });

  it('resolves cross-page links without anchors', () => {
    expect(resolveDocLink('ops/pocket.md', '../reference/fields.md')).toEqual({
      page: 'reference/fields.md',
      anchor: null,
    });
  });

  it('resolves a bare #anchor against the current page', () => {
    expect(resolveDocLink('glossary.md', '#indexing')).toEqual({
      page: 'glossary.md',
      anchor: 'indexing',
    });
  });

  it('resolves sibling links from a root page', () => {
    expect(resolveDocLink('glossary.md', 'ops/pocket.md')).toEqual({
      page: 'ops/pocket.md',
      anchor: null,
    });
  });

  it('rejects external http(s) links (the viewer opens those in a tab)', () => {
    expect(resolveDocLink('glossary.md', 'https://example.com')).toBeNull();
    expect(resolveDocLink('glossary.md', '//example.com/x.md')).toBeNull();
  });

  it('climbs more than one level', () => {
    expect(resolveDocLink('reference/sub/deep.md', '../../glossary.md#step-over')).toEqual({
      page: 'glossary.md',
      anchor: 'step-over',
    });
  });
});

describe('resolveDocPath (images)', () => {
  it('resolves the ops screenshot path against the page directory', () => {
    expect(resolveDocPath('ops/pocket.md', '../images/ops/pocket-01-select.png')).toBe(
      'images/ops/pocket-01-select.png',
    );
  });
  it('resolves same-directory references', () => {
    expect(resolveDocPath('reference/fields.md', './table.png')).toBe('reference/table.png');
  });
});

describe('docKeyToPage', () => {
  it('maps a glob key to the docs-tree-relative page id', () => {
    expect(docKeyToPage('/proj/src/ui/../../../docs/help/ops/pocket.md')).toBe('ops/pocket.md');
    expect(docKeyToPage('/proj/src/ui/../../../docs/help/glossary.md')).toBe('glossary.md');
    expect(docKeyToPage('/proj/src/ui/../../../docs/help/images/ops/x.png')).toBe(
      'images/ops/x.png',
    );
  });
  it('leaves keys without the marker untouched', () => {
    expect(docKeyToPage('glossary.md')).toBe('glossary.md');
  });
});
