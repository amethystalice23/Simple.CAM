/**
 * Bitmap import — decode a raster file to 8-bit grey, the shared input
 * for the heightmap and halftone kernels (heightmap.ts, halftone.ts).
 *
 * Kept deliberately thin: the browser decode lives here (the ONLY
 * DOM-touching part), the luma conversion is a pure function so the
 * node test env (no canvas/ImageBitmap) can drive it with a structural
 * stand-in for ImageData.
 */

export interface GrayBitmap {
  width: number;
  height: number;
  /** 8-bit luma, 0 = black, 255 = white, row-major (row 0 = image TOP) */
  data: Uint8Array;
}

/**
 * Structural stand-in for ImageData: the node test env has no DOM
 * ImageData constructor, so the conversion takes this and a real
 * ImageData (which satisfies it) passes unchanged.
 */
export interface ImageDataLike {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
}

/**
 * RGBA pixels → 8-bit luma, Rec.601 weights (0.299 R / 0.587 G /
 * 0.114 B), rounded. Alpha is ignored (decode produces opaque pixels).
 */
export function bitmapFromImageData(img: ImageDataLike): GrayBitmap {
  const out = new Uint8Array(img.width * img.height);
  const d = img.data;
  for (let p = 0, i = 0; p < out.length; p++, i += 4) {
    out[p] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  }
  return { width: img.width, height: img.height, data: out };
}

/**
 * Rotate a grey bitmap 90° CLOCKWISE (Alice, 2026-10-31: "a button on the
 * image import dialogue that rotates the image by 90° so people can
 * reorientate before committing"). Pure pixel remap — dims swap, row 0 of
 * the result is the source's LEFT column. Four applications round-trip.
 */
export function rotateGray90(gray: GrayBitmap): GrayBitmap {
  const { width: w, height: h, data } = gray;
  const out = new Uint8Array(w * h);
  const nw = h;
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      // CW: source (sx, sy) lands at (nw-1-sy, sx)
      out[sx * nw + (h - 1 - sy)] = data[sy * w + sx];
    }
  }
  return { width: nw, height: w, data: out };
}

/** minimal 2d-context surface both canvas flavors expose */
type Ctx2D = {
  drawImage(source: CanvasImageSource, dx: number, dy: number): void;
  getImageData(x: number, y: number, w: number, h: number): ImageData;
};

/**
 * Browser decode of any common raster format (PNG/JPEG/WebP/…): decode
 * at NATURAL size, draw to an offscreen 2d canvas, read the pixels and
 * run the pure luma conversion. createImageBitmap when the browser has
 * it, `Image` + object URL as the fallback.
 */
export async function decodeBitmapFile(file: Blob): Promise<GrayBitmap> {
  let width: number;
  let height: number;
  let source: CanvasImageSource;
  const cleanup: (() => void)[] = [];
  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(file);
      width = bmp.width;
      height = bmp.height;
      source = bmp;
      cleanup.push(() => bmp.close());
    } else {
      const url = URL.createObjectURL(file);
      cleanup.push(() => URL.revokeObjectURL(url));
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`image decode failed (${file.type || 'unknown type'})`));
        img.src = url;
      });
      width = img.naturalWidth;
      height = img.naturalHeight;
      source = img;
    }
    let ctx: Ctx2D | null = null;
    if (typeof OffscreenCanvas === 'function') {
      ctx = new OffscreenCanvas(width, height).getContext('2d') as Ctx2D | null;
    }
    if (!ctx) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx2D | null;
    }
    if (!ctx) throw new Error('no 2d canvas context available');
    ctx.drawImage(source, 0, 0);
    return bitmapFromImageData(ctx.getImageData(0, 0, width, height));
  } finally {
    cleanup.forEach((fn) => fn());
  }
}
