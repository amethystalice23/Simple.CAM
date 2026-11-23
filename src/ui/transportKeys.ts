/**
 * The simulation transport's keyboard map (2026-11-23, Alice's ask):
 * space toggles play/pause, the cursor keys step one move at a time —
 * right forward, left back (the step-back the bar's button row still
 * deliberately omits; the left arrow reverses that drop for the keys
 * only, riding the same reset-and-re-carve commit the scrub bar uses).
 *
 * Pure logic, unit-pinned: the bar's keydown effect hands the event
 * here and acts on the verdict. Keys that are NOT the transport's to
 * take come back null —
 *   - typing: a focused input/textarea/select/contenteditable keeps
 *     its own space and arrows;
 *   - key repeats: a held key would storm the worker — every backward
 *     step behind the carved position queues a full stock reset +
 *     re-carve, so repeats are refused outright;
 *   - chords: Ctrl/Cmd/Alt + space or arrows stay the OS's and the
 *     app's, never the transport's.
 */

export type TransportKeyAction = 'togglePlay' | 'stepForward' | 'stepBack';

/** The subset of KeyboardEvent the map reads (plain fields, mockable). */
export interface TransportKeyEvent {
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

export function transportKeyAction(e: TransportKeyEvent): TransportKeyAction | null {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  const el = e.target as HTMLElement | null;
  if (
    el !== null &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
  ) {
    return null;
  }
  switch (e.key) {
    case ' ':
      return 'togglePlay';
    case 'ArrowRight':
      return 'stepForward';
    case 'ArrowLeft':
      return 'stepBack';
    default:
      return null;
  }
}
