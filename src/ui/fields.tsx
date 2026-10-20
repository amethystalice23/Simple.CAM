import { useEffect, useState } from 'react';

/** Labeled text field; commits on change. */
export function TextField(props: { label: string; value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(props.value);
  // keep the field in sync when the value is changed elsewhere
  useEffect(() => setText(props.value), [props.value]);
  return (
    <label className="field">
      <span>{props.label}</span>
      <input type="text" value={text} onChange={(e) => { setText(e.target.value); props.onCommit(e.target.value); }} />
    </label>
  );
}

/** Labeled numeric field; commits only when the text parses to `min` or above. */
export function NumberField(props: {
  label: string;
  value: number;
  min?: number;
  step?: number;
  /** extra classes on the wrapping label (e.g. layout tweaks) */
  className?: string;
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
    <label className={`field${props.className ? ` ${props.className}` : ''}`}>
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

/** Bare numeric input (no label) for compact axis rows. */
export function NumInput(props: {
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
    <input
      className="num-input"
      type="number"
      step={props.step ?? 1}
      value={text}
      onChange={(e) => commit(e.target.value)}
    />
  );
}

export function Segmented<T extends string>(props: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
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