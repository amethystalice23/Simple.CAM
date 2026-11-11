/**
 * The tool picker (Alice, 2026-11-11): a custom popup replacing the native
 * <select> — options cannot carry colored chips or a second info line, and
 * the tool choice is the panel's most consequential field. Layout per her
 * ruling: the T-number chip sits LEFT of the name in a fixed slot, so tool
 * names align in one column whether or not a tool is numbered. Sections:
 * "In use" (every tool the ops carry, T-numbered, ordered T1→Tn) at the
 * top, then the usual subtype groups — a tool appears in BOTH places. The
 * meta line carries what matters when selecting: type, Ø, cutting length,
 * cutting angle, shank (toolMetaLine — rates are the ⚡ popup's business).
 */

import { useEffect, useRef, useState } from 'react';
import type { Tool } from '../core/types';
import { groupToolsBySubtype, shortToolName, toolMetaLine, toolOptionLabel } from './toolNames';

export interface ToolInUse {
  tool: Tool;
  n: number;
}

interface Props {
  tools: Tool[];
  currentId: string;
  /** tools the ops already carry, T-numbered, in T order */
  inUse: ToolInUse[];
  onChange: (toolId: string) => void;
}

export function ToolPicker(props: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const current = props.tools.find((t) => t.id === props.currentId);
  const numOf = new Map(props.inUse.map(({ tool, n }) => [tool.id, n]));

  const row = (t: Tool) => {
    const n = numOf.get(t.id);
    const inUse = n !== undefined;
    return (
      <button
        type="button"
        role="option"
        aria-selected={t.id === props.currentId}
        key={t.id + (n !== undefined ? `:${n}` : '')}
        className={`tool-row${t.id === props.currentId ? ' current' : ''}`}
        onClick={() => {
          props.onChange(t.id);
          setOpen(false);
        }}
      >
        {/* fixed chip slot: numbers stay left of the aligned name column */}
        <span className="tool-chip-slot">
          {inUse ? <span className="tool-chip">{`T${n}`}</span> : null}
        </span>
        <span className={`tool-dot tool-dot-${t.type}`} title={t.type} />
        <span className="tool-row-name" title={toolOptionLabel(t)}>
          {shortToolName(t)}
        </span>
        <span className="tool-row-meta">{toolMetaLine(t)}</span>
        {t.id === props.currentId && <span className="tool-row-check">✓</span>}
      </button>
    );
  };

  return (
    <div className="tool-picker" ref={rootRef}>
      <button
        type="button"
        className="tool-picker-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {current && (
          <>
            <span className="tool-chip-slot">
              {numOf.has(current.id) ? (
                <span className="tool-chip">{`T${numOf.get(current.id)}`}</span>
              ) : null}
            </span>
            <span className={`tool-dot tool-dot-${current.type}`} title={current.type} />
            <span className="tool-picker-name">{shortToolName(current)}</span>
            <span className="tool-picker-meta">
              {`Ø${current.diameter}${current.shaftDiameter !== undefined ? ` · shank ${current.shaftDiameter}` : ''}`}
            </span>
          </>
        )}
        <span className="tool-picker-caret">▾</span>
      </button>
      {open && (
        <div className="tool-popup" role="listbox" aria-label="Tools">
          {props.inUse.length > 0 && (
            <div className="tool-popup-head in-use">
              In use — assigned to operations
            </div>
          )}
          {props.inUse.map(({ tool }) => row(tool))}
          {groupToolsBySubtype(props.tools).map((g) => (
            <div key={g.label} className="tool-group">
              <div className="tool-popup-head">{g.label}</div>
              {g.tools.map(row)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
