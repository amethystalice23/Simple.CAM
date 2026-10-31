/**
 * The bitmap-import dialogue (drop a PNG/JPEG/…): one image, two
 * destinations. "Heightmap" builds a relief MODEL carved down from the
 * stock crown (the model slot); "Artwork / Halftone" screens the image
 * into dot line work for the engrave pipeline (an artwork primitive).
 * Alice's 2026-10-31 rulings: the second tab is "Artwork / Halftone";
 * the dot pitch field is "Dot spacing", not "period" ("period is an odd
 * name for it, perhaps something sized related"); rotary depth defaults
 * to r/2 ("maybe r/2"). The geometry choice is BY STOCK — box stock
 * yields a flat relief, cylinder stock one wrapped on the rotation axis.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BufferGeometry } from 'three';
import type { GrayBitmap } from '../core/bitmapImport';
import { heightmapBoxGeometry, heightmapCylinderGeometry } from '../core/heightmap';
import { halftoneArtwork } from '../core/halftone';
import { rotaryCalibrationOf, type Stock } from '../core/types';
import type { ImportedArtwork } from '../core/vectorImport';
import { NumberField } from './fields';

export type BitmapImportResult =
  | { kind: 'heightmap'; geometry: BufferGeometry; name: string }
  | { kind: 'halftone'; art: ImportedArtwork; name: string };

interface Props {
  name: string;
  gray: GrayBitmap;
  stock: Stock;
  onConfirm: (result: BitmapImportResult) => void;
  onCancel: () => void;
}

type Tab = 'heightmap' | 'halftone';

/** depth > 0 always; a box defaults to its own thickness (Alice,
 * 2026-10-31: "the stock thickness for boxes") and never carves THROUGH
 * the bottom face (max = sizeZ — beyond it the top pokes out the underside);
 * a cylinder defaults to r/2 ("maybe r/2"), capped below the radius. */
function depthBounds(stock: Stock): { min: number; max: number; def: number } {
  if (stock.kind === 'box') {
    return { min: 0.05, max: Math.max(stock.sizeZ, 0.1), def: stock.sizeZ };
  }
  const r = rotaryCalibrationOf(stock).effectiveRadius;
  return { min: 0.05, max: Math.max(r - 0.05, 0.1), def: r / 2 };
}

/** Halftone face (mm): 4-axis wraps the image around the stock (full
 * circumference × axial span — the artworkFromSvg wrap convention);
 * flat stock uses its XY footprint. */
function halftoneFace(stock: Stock): { faceWidth: number; faceHeight: number } {
  if (stock.axisMode === '4-axis') {
    const r = rotaryCalibrationOf(stock).effectiveRadius;
    const len =
      stock.kind === 'cylinder' ? stock.length : stock.sizeX;
    return { faceWidth: 2 * Math.PI * r, faceHeight: len };
  }
  if (stock.kind === 'box') return { faceWidth: stock.sizeX, faceHeight: stock.sizeY };
  const r = stock.calibration.effectiveRadius;
  return { faceWidth: 2 * r, faceHeight: 2 * r }; // standing cylinder: crown circle
}

/** The source greyscale as a canvas — ImageData once, then a scaled
 * drawImage per redraw (a 2000×2000 image must never draw per pixel). */
function useGrayCanvas(gray: GrayBitmap): HTMLCanvasElement {
  return useMemo(() => {
    const w = Math.max(gray.width, 1);
    const h = Math.max(gray.height, 1);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < gray.data.length && i < w * h; i++) {
      const l = gray.data[i];
      img.data[i * 4] = l;
      img.data[i * 4 + 1] = l;
      img.data[i * 4 + 2] = l;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }, [gray]);
}

/** One dot on the preview: centroid + mean radius of its artwork path. */
interface PreviewDot {
  x: number;
  y: number;
  r: number;
}

function dotsOf(art: ImportedArtwork): PreviewDot[] {
  const out: PreviewDot[] = [];
  for (const path of art.paths) {
    if (path.length === 0) continue;
    let cx = 0;
    let cy = 0;
    for (const p of path) {
      cx += p.x;
      cy += p.y;
    }
    cx /= path.length;
    cy /= path.length;
    let r = 0;
    for (const p of path) r += Math.hypot(p.x - cx, p.y - cy);
    r /= path.length;
    out.push({ x: cx, y: cy, r });
  }
  return out;
}

/** The live preview canvas: the greyscale (fitted to ~240px), plus the
 * halftone screen's dots as filled circles when given. Synchronous and
 * bounded — the source is downsampled by drawImage, never per-pixel. */
function GrayPreview(props: {
  gray: GrayBitmap;
  src: HTMLCanvasElement;
  dots?: PreviewDot[];
  faceWidth?: number;
  faceHeight?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = props.gray;
    const scale = Math.min(240 / Math.max(g.width, 1), 240 / Math.max(g.height, 1));
    const w = Math.max(1, Math.round(g.width * scale));
    const h = Math.max(1, Math.round(g.height * scale));
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(props.src, 0, 0, w, h);
    if (props.dots && props.faceWidth && props.faceHeight) {
      ctx.fillStyle = '#ddaa33'; // the viewport's artwork amber
      for (const d of props.dots) {
        // the artwork frame is y-up, image row 0 at max y; canvas is y-down
        ctx.beginPath();
        ctx.arc(
          (d.x / props.faceWidth) * w,
          (1 - d.y / props.faceHeight) * h,
          Math.max((d.r / props.faceWidth) * w, 0.6),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  }, [props.gray, props.src, props.dots, props.faceWidth, props.faceHeight]);
  return <canvas ref={ref} className="bitmap-preview" width={240} height={240} />;
}

export function BitmapImportDialog(props: Props) {
  const { gray, stock } = props;
  const [tab, setTab] = useState<Tab>('heightmap');
  const bounds = useMemo(() => depthBounds(stock), [stock]);
  const [depth, setDepth] = useState(() => bounds.def);
  const [invert, setInvert] = useState(false);
  const [spacing, setSpacing] = useState(1.5);
  const [angleDeg, setAngleDeg] = useState(45);
  const src = useGrayCanvas(gray);
  const face = useMemo(() => halftoneFace(stock), [stock]);

  // The relief geometry, built live so the readout is the HONEST lattice
  // size (no duplicate of the kernel's sampling policy) and Confirm is
  // instant. Box stock → flat relief; cylinder → wrapped on the axis.
  const heightmap = useMemo<{ geometry: BufferGeometry | null; error: string | null }>(() => {
    try {
      const geometry =
        stock.kind === 'cylinder'
          ? heightmapCylinderGeometry(gray, {
              radius: rotaryCalibrationOf(stock).effectiveRadius,
              length: stock.length,
              depth: Math.min(depth, bounds.max),
              invert,
            })
          : heightmapBoxGeometry(gray, {
              spanX: stock.sizeX,
              spanY: stock.sizeY,
              thickness: stock.sizeZ,
              depth: Math.min(depth, bounds.max),
              invert,
            });
      return { geometry, error: null };
    } catch (e) {
      return { geometry: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [gray, stock, depth, invert, bounds.max]);
  const tris = heightmap.geometry
    ? (heightmap.geometry.getAttribute('position')?.count ?? 0) / 3
    : 0;

  // The halftone screen — it throws above its dot cap, and that message
  // shows inline in red instead of taking the dialogue down.
  const halftone = useMemo<{ art: ImportedArtwork | null; error: string | null }>(() => {
    try {
      return {
        art: halftoneArtwork(gray, {
          faceWidth: face.faceWidth,
          faceHeight: face.faceHeight,
          spacing,
          angleDeg,
        }),
        error: null,
      };
    } catch (e) {
      return { art: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [gray, face, spacing, angleDeg]);
  const dots = useMemo(() => (halftone.art ? dotsOf(halftone.art) : []), [halftone.art]);

  const blocked = tab === 'heightmap' ? !heightmap.geometry : !halftone.art;

  const confirm = () => {
    if (tab === 'heightmap') {
      if (!heightmap.geometry) return;
      props.onConfirm({ kind: 'heightmap', geometry: heightmap.geometry, name: props.name });
      return;
    }
    if (!halftone.art) return;
    props.onConfirm({ kind: 'halftone', art: halftone.art, name: props.name });
  };

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true">
        <h2>Import image — {props.name}</h2>
        <p className="hint">the same image can become a carved relief or dot line work</p>
        <div className="segmented wide">
          <button
            type="button"
            className={tab === 'heightmap' ? 'active' : ''}
            onClick={() => setTab('heightmap')}
          >
            Heightmap
          </button>
          <button
            type="button"
            className={tab === 'halftone' ? 'active' : ''}
            onClick={() => setTab('halftone')}
          >
            Artwork / Halftone
          </button>
        </div>
        <GrayPreview gray={gray} src={src} />
        {tab === 'heightmap' && (
          <>
            <NumberField
              label="Depth (mm)"
              value={depth}
              min={bounds.min}
              step={0.1}
              title={
                stock.kind === 'cylinder' || stock.axisMode === '4-axis'
                  ? `How deep the darkest pixels carve below the crown — up to the stock radius (${bounds.max.toFixed(1)} mm)`
                  : 'How deep the darkest pixels carve below the stock top'
              }
              onCommit={(v) => setDepth(Math.min(Math.max(v, bounds.min), bounds.max))}
            />
            <label className="field">
              <span>Invert</span>
              <input
                type="checkbox"
                checked={invert}
                title="Off: dark pixels carve deep (a photo of a coin — black is recessed). On: light pixels carve deep."
                onChange={(e) => setInvert(e.target.checked)}
              />
            </label>
            {heightmap.error ? (
              <p className="error">{heightmap.error}</p>
            ) : (
              <p className="hint">
                lattice {tris.toLocaleString()} triangles · a stock-sized relief,
                placed as the model and carved down from the crown
              </p>
            )}
          </>
        )}
        {tab === 'halftone' && (
          <>
            <NumberField
              label="Dot spacing (mm)"
              value={spacing}
              min={0.1}
              step={0.1}
              title="Distance between dot centers — the screen's pitch. Keep it at or above the tool diameter."
              onCommit={(v) => setSpacing(Math.max(v, 0.1))}
            />
            <NumberField
              label="Screen angle (°)"
              value={angleDeg}
              step={15}
              title="Rotation of the dot grid against the image — 45° avoids moiré with parallel edges"
              onCommit={(v) => setAngleDeg(v)}
            />
            {halftone.error ? (
              <p className="error">{halftone.error}</p>
            ) : (
              <p className="hint">
                {dots.length.toLocaleString()} dot(s)
                {stock.axisMode === '4-axis' ? ' · wraps around the stock' : ''} ·
                engraves as line work like a dropped SVG
              </p>
            )}
          </>
        )}
        <div className="dialog-buttons">
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={blocked} onClick={confirm}>
            {tab === 'heightmap' ? 'Import as model' : 'Import as artwork'}
          </button>
        </div>
      </div>
    </div>
  );
}
