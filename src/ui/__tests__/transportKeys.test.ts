/**
 * Pins for the transport keyboard map (2026-11-23): space toggles
 * play/pause, cursor keys step one move — and the refusals: typing,
 * key repeats (a backward step behind the carved cursor costs a full
 * stock reset + re-carve), and modifier chords.
 */
import { describe, expect, it } from 'vitest';
import { transportKeyAction, type TransportKeyEvent } from '../transportKeys';

const bodyEvent = (over: Partial<TransportKeyEvent> = {}): TransportKeyEvent => ({
  key: '',
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  target: null,
  ...over,
});

const field = (tag: string): EventTarget => ({ tagName: tag } as unknown as EventTarget);

describe('transportKeyAction — the keys the transport takes', () => {
  it('space toggles play/pause, cursor keys step one move', () => {
    expect(transportKeyAction(bodyEvent({ key: ' ' }))).toBe('togglePlay');
    expect(transportKeyAction(bodyEvent({ key: 'ArrowRight' }))).toBe('stepForward');
    expect(transportKeyAction(bodyEvent({ key: 'ArrowLeft' }))).toBe('stepBack');
  });

  it('unknown keys are none of the transport business', () => {
    expect(transportKeyAction(bodyEvent({ key: 'Enter' }))).toBeNull();
    expect(transportKeyAction(bodyEvent({ key: 'a' }))).toBeNull();
    expect(transportKeyAction(bodyEvent({ key: 'ArrowUp' }))).toBeNull();
  });

  it('a focused field keeps its own keys — typing is never hijacked', () => {
    expect(transportKeyAction(bodyEvent({ key: ' ', target: field('INPUT') }))).toBeNull();
    expect(transportKeyAction(bodyEvent({ key: 'ArrowLeft', target: field('TEXTAREA') }))).toBeNull();
    expect(transportKeyAction(bodyEvent({ key: ' ', target: field('SELECT') }))).toBeNull();
    expect(transportKeyAction(bodyEvent({ key: ' ', target: { isContentEditable: true } as unknown as EventTarget }))).toBeNull();
  });

  it('key repeats are refused — a held arrow would storm the worker', () => {
    expect(transportKeyAction(bodyEvent({ key: 'ArrowLeft', repeat: true }))).toBeNull();
    expect(transportKeyAction(bodyEvent({ key: 'ArrowRight', repeat: true }))).toBeNull();
    expect(transportKeyAction(bodyEvent({ key: ' ', repeat: true }))).toBeNull();
  });

  it('modifier chords stay the OS and the app', () => {
    expect(transportKeyAction(bodyEvent({ key: ' ', ctrlKey: true }))).toBeNull();
    expect(transportKeyAction(bodyEvent({ key: 'ArrowRight', metaKey: true }))).toBeNull();
    expect(transportKeyAction(bodyEvent({ key: ' ', altKey: true }))).toBeNull();
  });
});
