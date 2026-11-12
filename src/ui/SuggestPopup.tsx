/**
 * The suggest-ops popup (docs/PLAN.md "Suggest ops", round 1): what the
 * detector knows about ONE picked feature, and the operations it could
 * drive. Pure display over FeatureKnowledge from src/ui/opSuggest.ts —
 * the proposal sheet (round 2) extends this with checkboxes that create
 * the ops.
 */

import { useEffect, useState } from 'react';
import type { JobOp, Tool } from '../core/types';
import { OP_KIND_COLORS } from './opColors';
import type { FeatureKnowledge, SuggestCandidate } from './opSuggest';
import { OP_KINDS } from './jobGeneration';

/** one candidate's tool: what it would run with + the T number the new op
 *  would carry (inUse = the tool keeps its existing assignment) */
export interface SuggestToolInfo {
  tool: Tool;
  inUse: boolean;
  tNum: number;
}

/** compact chip label: cutting Ø for mills, the tip angle for V-bits */
function toolChip(t: Tool): string {
  return t.type === 'vbit' ? `${t.vAngle ?? 60}° vbit` : `Ø${t.diameter} ${t.type}`;
}

/** per-kind accents for the popup title chip (feature kinds, not ops) */
const KIND_COLORS: Record<FeatureKnowledge['kind'], string> = {
  plane: '#54c8e8', // cyan
  circle: '#4ecf7a', // green
  edge: '#8d99a3', // gray
  path: '#b48cff', // lavender
  radialChain: '#35d0ba', // teal
};

const KIND_LABELS: Record<FeatureKnowledge['kind'], string> = {
  plane: 'Face',
  circle: 'Circle',
  edge: 'Edge',
  path: 'Artwork',
  radialChain: 'Curved edge',
};

export function opKindLabel(kind: JobOp['kind']): string {
  return OP_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

export function SuggestPopup({
  knowledge,
  toolInfo,
  onClose,
  onPickAnother,
  onAdd,
}: {
  knowledge: FeatureKnowledge;
  /** per-candidate tool suggestion (parallel to knowledge.candidates),
   *  null entries keep the default tool silently */
  toolInfo?: (SuggestToolInfo | null)[] | null;
  onClose: () => void;
  /** re-arm the picker for another feature (round 2: "suggest for this too") */
  onPickAnother: () => void;
  /** add the CHECKED suggestions as real ops (round 2) — App creates them
   *  in list order (any Index op first) and closes the popup */
  onAdd: (checked: SuggestCandidate[]) => void;
}) {
  /** every suggestion checked by default (Alice's sheet ruling: the
   *  obvious ones are one Add away; untick what you don't want) */
  const [checked, setChecked] = useState<Set<number>>(
    () => new Set(knowledge.candidates.map((_, i) => i)),
  );
  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const checkedList = knowledge.candidates.filter((_, i) => checked.has(i));

  /** which notes have their "why?" detail expanded (each opens alone —
   * the sheet reads as short guidance first, geometry on request) */
  const [openNotes, setOpenNotes] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay">
      <div
        className="modal suggest-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${knowledge.title} — what the detector knows`}
      >
        <h2>
          <span className="suggest-title">
            <span className="suggest-kind-chip" style={{ background: KIND_COLORS[knowledge.kind] }}>
              {KIND_LABELS[knowledge.kind]}
            </span>
            {knowledge.title}
          </span>
          <button type="button" className="icon-btn" title="Close (Esc)" onClick={onClose}>
            ✕
          </button>
        </h2>

        <p className="suggest-section-label">what the detector measured</p>
        <div className="suggest-facts">
          {knowledge.facts.map((f, i) => (
            <div key={i} className="suggest-fact">
              <span className="suggest-fact-label">{f.label}</span>
              <span className="suggest-fact-value">{f.value}</span>
            </div>
          ))}
        </div>

        {knowledge.candidates.length > 0 && (
          <>
            <p className="suggest-section-label">suggested toolpaths — untick any you don’t want</p>
            <ul className="suggest-candidates">
              {knowledge.candidates.map((c, i) => (
                <li key={i}>
                  <label className="suggest-cand">
                    <input
                      type="checkbox"
                      checked={checked.has(i)}
                      onChange={() => toggle(i)}
                      style={{ accentColor: OP_KIND_COLORS[c.kind] }}
                    />
                    <span
                      className="suggest-cand-bar"
                      style={{ background: OP_KIND_COLORS[c.kind] }}
                    />
                    <span className="suggest-cand-name" style={{ color: OP_KIND_COLORS[c.kind] }}>
                      {opKindLabel(c.kind)}
                    </span>
                    <span className="suggest-cand-why">{c.why}</span>
                    {toolInfo?.[i] && (
                      <span
                        className={`suggest-cand-tool${toolInfo[i]!.inUse ? '' : ' new'}`}
                        title={`${toolInfo[i]!.tool.name} — ${
                          toolInfo[i]!.inUse
                            ? 'already in use by this job'
                            : 'a new tool for this job'
                        }`}
                      >
                        T{toolInfo[i]!.tNum} · {toolChip(toolInfo[i]!.tool)}
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        {knowledge.notes.map((n, i) => (
          <p key={i} className="suggest-note">
            ⚠ {n.text}
            {n.detail && (
              <>
                {' '}
                <button
                  type="button"
                  className="suggest-note-why"
                  aria-expanded={openNotes.has(i)}
                  onClick={() =>
                    setOpenNotes((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                >
                  {openNotes.has(i) ? 'hide why' : 'why?'}
                </button>
                {openNotes.has(i) && <span className="suggest-note-detail"> {n.detail}</span>}
              </>
            )}
          </p>
        ))}

        {/* accept on the LEFT edge, decline on the RIGHT (Alice,
            2026-11-12): a clear visual separation — the two right-hand
            buttons mean "not accepting the suggestions"; Done is
            relabelled Cancel, as a dismiss is a no-op */}
        <div className="suggest-actions">
          {checkedList.length > 0 && (
            <button type="button" className="suggest-add" onClick={() => onAdd(checkedList)}>
              + Add {checkedList.length} op{checkedList.length === 1 ? '' : 's'}
            </button>
          )}
          <div className="suggest-actions-decline">
            <button type="button" onClick={onPickAnother}>
              Pick another feature
            </button>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}