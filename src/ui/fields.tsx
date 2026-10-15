import { useEffect, useState } from 'react';
import type { OriginEdge } from '../core/types';

/** Labeled numeric field; commits only when the text parses to `min` or above. */
export function NumberField(props: {
  label: string;
  value: number;
  min?: number;
  step?: number;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(props.value));
  // keep the field in sync when the value is changed elsewhere (e.g. a snap)
  useEffect(() => setText(String(props.value)), [props.value]);
  const commit = (s: string) => {
    setText(s);
    const v = parseFloat(s);
    if (Number.isFinite(v) && (props.min === undefined || v >= props.min)) props.onCommit(v);
  };
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="number"
        step={props.step ?? 1}
        value={text}
        onChange={(e) => commit(e.target.value)}
      />
    </label>
  );
}

export function Segmented(props: {
  options: readonly OriginEdge[];
  value: OriginEdge;
  onChange: (v: OriginEdge) => void;
}) {
  return (
    <div className="segmented">
      {props.options.map((o) => (
        <button
          key={o}
          type="button"
          className={o === props.value ? 'active' : ''}
          onClick={() => props.onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}