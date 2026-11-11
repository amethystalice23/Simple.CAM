/**
 * The suggest-ops popup (docs/PLAN.md "Suggest ops", round 1): what the
 * detector knows about ONE picked feature, and the operations it could
 * drive. Pure display over FeatureKnowledge from src/ui/opSuggest.ts —
 * the proposal sheet (round 2) extends this with checkboxes that create
 * the ops.
 */

import { useEffect } from 'react';
import type { JobOp } from '../core/types';
import { OP_KIND_COLORS } from './opColors';
import type { FeatureKnowledge } from './opSuggest';
import { OP_KINDS } from './jobGeneration';

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
  onClose,
  onPickAnother,
}: {
  knowledge: FeatureKnowledge;
  onClose: () => void;
  /** re-arm the picker for another feature (round 2: "suggest for this too") */
  onPickAnother: () => void;
}) {
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
            <p className="suggest-section-label">operations this could drive</p>
            <ul className="suggest-candidates">
              {knowledge.candidates.map((c, i) => (
                <li key={i} className="suggest-candidate">
                  <span className="suggest-cand-bar" style={{ background: OP_KIND_COLORS[c.kind] }} />
                  <span className="suggest-cand-name" style={{ color: OP_KIND_COLORS[c.kind] }}>
                    {opKindLabel(c.kind)}
                  </span>
                  <span className="suggest-cand-why">{c.why}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {knowledge.notes.map((n, i) => (
          <p key={i} className="suggest-note">
            ⚠ {n}
          </p>
        ))}

        <div className="suggest-actions">
          <button type="button" onClick={onPickAnother}>
            Pick another feature
          </button>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}