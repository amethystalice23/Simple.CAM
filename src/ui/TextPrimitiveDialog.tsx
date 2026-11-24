/**
 * The "+ Text" dialog (2026-11-24): typed lettering as a first-class
 * primitive. Every field here is CONTENT — text, font, cap height,
 * tracking, wrap — never dimensions: the primitive's width/height derive
 * from the layout (layoutTextPaths) and the readout shows what will land.
 */

import { useEffect, useMemo, useState } from 'react';
import { TEXT_FONT_IDS, textFontLabel } from '../core/textLayout';
import { NumberField } from './fields';
import { DEFAULT_TEXT_FONT_ID, layoutTextPaths, type TextSpec } from './textPrimitive';

export function TextPrimitiveDialog(props: {
  onCreate: (spec: TextSpec) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('Hello');
  const [fontId, setFontId] = useState(DEFAULT_TEXT_FONT_ID);
  const [size, setSize] = useState(5);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [wrapWidth, setWrapWidth] = useState(0);
  // Escape closes — like the other dialogs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onClose]);

  const spec: TextSpec = { text, fontId, size, letterSpacing, wrapWidth };
  const layout = useMemo(() => {
    try {
      return layoutTextPaths(spec);
    } catch {
      return null; // an unsupported character or font — the button gates
    }
  }, [text, fontId, size, letterSpacing, wrapWidth]); // eslint-disable-line react-hooks/exhaustive-deps
  const empty = !layout || layout.paths.length === 0 || layout.width <= 0;

  return (
    <div className="modal-overlay">
      <div className="modal cal-modal" role="dialog" aria-modal="true" aria-label="Add text">
        <h2>
          Add text
          <button type="button" className="icon-btn" title="Close (Esc)" onClick={props.onClose}>
            ✕
          </button>
        </h2>
        <p className="cal-intro">
          Single-stroke lettering laid out as engrave-ready paths. Size it by{' '}
          <strong>cap height</strong> — the width and height derive from the layout, you never
          type dimensions. Pick an <strong>Engrave</strong> op and select the strokes to cut.
        </p>
        <label className="field">
          <span>Text</span>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="one line per row"
          />
        </label>
        <label className="field">
          <span>Font</span>
          <select value={fontId} onChange={(e) => setFontId(e.target.value)}>
            {TEXT_FONT_IDS.map((id) => (
              <option key={id} value={id}>
                {textFontLabel(id)}
              </option>
            ))}
          </select>
        </label>
        <div className="cal-axes">
          <NumberField
            label="Cap height (mm)"
            value={size}
            min={0.5}
            step={0.5}
            title="the letter height, mm — the layout derives width and height from it"
            onCommit={setSize}
          />
          <NumberField
            label="Letter spacing (mm)"
            value={letterSpacing}
            step={0.1}
            title="extra gap between characters, mm — negative tightens"
            onCommit={setLetterSpacing}
          />
          <NumberField
            label="Wrap width (mm)"
            value={wrapWidth}
            min={0}
            step={1}
            title="0 = no wrap — lines run as typed. Above 0, lines longer than this many mm wrap to the next row"
            onCommit={setWrapWidth}
          />
        </div>
        {layout && !empty && (
          <p className="hint">
            lands as {layout.width.toFixed(1)} × {layout.height.toFixed(1)} mm,{' '}
            {layout.paths.length} stroke path{layout.paths.length === 1 ? '' : 's'}
          </p>
        )}
        {empty && text.trim() !== '' && (
          <p className="hint warn">nothing lays out from this text — check the font and characters</p>
        )}
        <div className="dialog-buttons">
          <button type="button" className="secondary" onClick={props.onClose}>
            Cancel
          </button>
          <button type="button" disabled={empty} onClick={() => props.onCreate(spec)}>
            Add Text
          </button>
        </div>
      </div>
    </div>
  );
}
