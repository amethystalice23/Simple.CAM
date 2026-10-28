#!/usr/bin/env node
/**
 * Import Makera's published tool definitions into
 * src/core/makeraTools.generated.ts.
 *
 * Source: github.com/MakeraInc/CarveraProfiles — the Fusion 360 profile
 * "Tool Files" (*.tools files, which are zip archives holding tools.json).
 * The source repo carries no license file, so we keep only extracted
 * numeric parameters and product identifiers, with provenance recorded in
 * the generated file. Refresh: node scripts/import-makera-tools.mjs
 */

import { writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'MakeraInc/CarveraProfiles';
const BRANCH = 'main';
const DIR = 'CAM_Post_Processors/Fusion360-profiles/Tool Files';

/** [remote file name, our type] — see src/core/types.ts Tool.type */
const CATEGORIES = [
  ['Makera Ball Endmills', 'ball'],
  // Corn bits are serrated "corn-cob" router bits for PCB/composites: flat
  // bottom profile (Fusion declares them flat end mills), but their own type.
  ['Makera Corn Bits', 'corn'],
  ['Makera Drill Bits', 'drill'],
  ['Makera Engraving Bits', 'vbit'],
  ['Makera O Flute Bits', 'flat'],
  ['Makera Other Tools', 'vbit'],
  ['Makera Thread Mills', 'threadmill'],
];

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'core', 'makeraTools.generated.ts');

/** Extract the first .json entry of a zip archive (Fusion .tools holds one tools.json). */
function unzipFirstJson(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip archive');
  const entries = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    if (name.endsWith('.json')) {
      if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('bad local header');
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      return JSON.parse((method === 0 ? data : inflateRawSync(data)).toString('utf8'));
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('no json entry in archive');
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[″"]/g, 'in')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Grouping family for listings, derived from Fusion's type + the product name. */
function subtypeOf(fusionType, description) {
  const d = description.toLowerCase();
  const metal = d.includes('metal');
  if (d.includes('drill') || fusionType.includes('drill')) return 'Drill';
  if (d.includes('corn')) return 'Corn (TiN)';
  if (d.includes('threadmill') || fusionType.includes('thread')) return 'Threadmill';
  if (d.includes('chamfering')) return 'Chamfering';
  if (d.includes('solder')) return 'Solder mask';
  if (d.includes('engraving')) return metal ? 'Engraving · Metal' : 'Engraving';
  if (fusionType.includes('ball') || d.includes('ball')) return metal ? 'Ball · Metal' : 'Ball';
  if (d.includes('spiral o')) return metal ? 'Spiral O · Metal' : 'Spiral O';
  return 'General';
}

function toTool(remoteName, type, t) {
  const g = t.geometry ?? {};
  if (typeof g.DC !== 'number' || !t.description) return null;
  const tool = {
    id: slug(`${remoteName} ${t.description}`),
    name: t.description,
    type,
    subtype: subtypeOf(String(t.type ?? ''), t.description),
    diameter: g.DC,
    spindleRpm: 18000, // Carvera spindle ceiling; per-op feeds/speeds come from material presets
  };
  // Fusion start-values: Makera's per-tool, per-material cutting presets
  const presets = (t['start-values']?.presets ?? [])
    .filter((p) => typeof p.name === 'string' && p.name && Number.isFinite(p.v_f) && p.v_f > 0)
    .map((p) => ({
      material: p.name,
      spindleRpm: Math.round(p.n ?? 18000),
      feed: Math.round(p.v_f),
      plungeFeed: Math.round(p.v_f_plunge ?? p.v_f * 0.4),
      stepDown: Number(p.stepdown?.toFixed(3)) ?? 0,
      rampFeed: Math.round(p.v_f_ramp ?? p.v_f * 0.6),
    }));
  if (presets.length > 0) tool.presets = presets;
  if (typeof g.SFDM === 'number') tool.shaftDiameter = g.SFDM;
  // Thread mills (Alice, 2026-10-28, from the Makera bit shop): the shank
  // Ø is SFDM and it is RIGHT — the M6/M8 mills carry a 6mm shank
  // (global.makera.com thread-milling-bit-6mm-shank), the M1–M5 a 1/8″
  // (3.175) one. What SFDM does NOT carry is the CUTTING LENGTH — the
  // thin taper between the tooth band and the shank: LCF is only the
  // 2mm toothed band, but the taper (18mm on the M6, 24 on the M8) is
  // what sets how deep a thread the bit can cut, and the simulator must
  // model it as the flute or every full-depth helical thread paints as a
  // shank collision. Shop-measured overrides per size:
  const THREADMILL_CUTTING_LENGTH = {
    'makera-thread-mills-carvera-m6-threadmill': 18,
    'makera-thread-mills-carvera-m8-threadmill': 24,
  };
  if (type === 'threadmill' && tool.id && tool.id in THREADMILL_CUTTING_LENGTH) {
    tool.fluteLength = THREADMILL_CUTTING_LENGTH[tool.id];
  } else if (typeof g.LCF === 'number') {
    tool.fluteLength = g.LCF;
  }
  // Makera's shop thread mills are 1-TOOTH (Alice, 2026-10-28: "the
  // makera ones are 1 tooth, i have a different brand that is otherwise
  // the same sizes but 3 tooth"); the Fusion record's NOF: 3 describes
  // the generic 3-flute look, not the shop tool. flutes = the TOOTH count
  // in our model — 1 tooth means the pitch stays editable (one profile
  // cuts any pitch).
  if (typeof g.NOF === 'number') tool.flutes = g.NOF;
  if (type === 'threadmill' && tool.flutes === 3) {
    tool.flutes = 1;
  }
  if (typeof g.OAL === 'number') tool.overallLength = g.OAL;
  if (typeof t.BMC === 'string') tool.material = t.BMC.toLowerCase();
  if (type === 'vbit') {
    // TA is the per-side taper angle; our vAngle is the included angle
    if (typeof g.TA === 'number') tool.vAngle = g.TA * 2;
    if (typeof g['tip-diameter'] === 'number') tool.tipDiameter = g['tip-diameter'];
  }
  if (type === 'drill' && typeof g.SIG === 'number') tool.drillPointAngle = g.SIG;
  if (type === 'threadmill' && typeof g.TPN === 'number') tool.pitch = g.TPN;
  return tool;
}

async function main() {
  const tools = [];
  const ids = new Set();
  const files = [];
  const imported = new Date().toISOString().slice(0, 10);

  for (const [remoteName, type] of CATEGORIES) {
    const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${encodeURI(DIR)}/${encodeURIComponent(remoteName)}.tools`;
    files.push(remoteName);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
    const data = unzipFirstJson(Buffer.from(await res.arrayBuffer()));
    let kept = 0;
    for (const t of data.data ?? []) {
      const tool = toTool(remoteName, type, t);
      if (!tool) continue;
      let id = tool.id;
      for (let n = 2; ids.has(id); n++) id = `${tool.id}-${n}`;
      tool.id = id;
      ids.add(id);
      tools.push(tool);
      kept++;
    }
    console.log(`${remoteName}: ${kept} tools -> ${type}`);
  }

  const body = `// GENERATED by scripts/import-makera-tools.mjs — do not edit by hand.
// Source: github.com/${REPO} (${DIR}) — Fusion .tools archives (zipped tools.json)
// Imported: ${imported}. The source repo carries no license file; this file
// holds only extracted numeric parameters and product identifiers.
// Refresh: node scripts/import-makera-tools.mjs
import type { Tool } from './types';

export const MAKERA_TOOLS_PROVENANCE = {
  repo: 'https://github.com/${REPO}',
  files: ${JSON.stringify(files)},
  imported: '${imported}',
} as const;

export const MAKERA_TOOLS: Tool[] = ${JSON.stringify(tools, null, 2)};
`;
  writeFileSync(OUT, body);
  console.log(`wrote ${tools.length} tools -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});