/**
 * Budgets for player mods. Every file a player gives us is untrusted: sizes are checked BEFORE anything is allocated.
 * A mod that goes over a budget is refused with a readable message and the stock asset stays.
 */
export type ModTier = 'phone' | 'low' | 'medium' | 'high';

export interface ModLimits {
  /** false on the phone tier: model mods are refused entirely in the first pass */
  allowModels: boolean;
  /** one model file (bytes) */
  maxModelFileBytes: number;
  maxVertices: number;
  maxTriangles: number;
  maxMaterials: number;
  maxFrames: number;
  /** one texture file (bytes) and one decoded texture */
  maxTextureFileBytes: number;
  maxTextureDim: number;
  maxTexturesPerTxd: number;
  /** decoded RGBA bytes of all textures of one mod */
  maxDecodedTextureBytes: number;
  /** all files of one mod */
  maxModBytes: number;
}

/** Total bytes of every installed mod on one device. */
export const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
export const MAX_MODS = 24;
export const MAX_FILES_PER_MOD = 200;
export const MAX_MANIFEST_BYTES = 256 * 1024;

const MB = 1024 * 1024;

export const LIMITS: Record<ModTier, ModLimits> = {
  phone: { allowModels: false, maxModelFileBytes: 0, maxVertices: 0, maxTriangles: 0, maxMaterials: 0, maxFrames: 0, maxTextureFileBytes: 4 * MB, maxTextureDim: 512, maxTexturesPerTxd: 16, maxDecodedTextureBytes: 8 * MB, maxModBytes: 16 * MB },
  low: { allowModels: true, maxModelFileBytes: 8 * MB, maxVertices: 40_000, maxTriangles: 60_000, maxMaterials: 32, maxFrames: 256, maxTextureFileBytes: 8 * MB, maxTextureDim: 1024, maxTexturesPerTxd: 64, maxDecodedTextureBytes: 32 * MB, maxModBytes: 48 * MB },
  medium: { allowModels: true, maxModelFileBytes: 16 * MB, maxVertices: 80_000, maxTriangles: 120_000, maxMaterials: 48, maxFrames: 384, maxTextureFileBytes: 16 * MB, maxTextureDim: 2048, maxTexturesPerTxd: 128, maxDecodedTextureBytes: 96 * MB, maxModBytes: 96 * MB },
  high: { allowModels: true, maxModelFileBytes: 32 * MB, maxVertices: 150_000, maxTriangles: 250_000, maxMaterials: 64, maxFrames: 512, maxTextureFileBytes: 32 * MB, maxTextureDim: 2048, maxTexturesPerTxd: 256, maxDecodedTextureBytes: 192 * MB, maxModBytes: 128 * MB },
};

/** A refusal with a message a player can read. Loaders throw this; the registry turns it into a report line. */
export class ModError extends Error {
  constructor(message: string, readonly code: string = 'invalid') {
    super(message);
    this.name = 'ModError';
  }
}

export function mb(bytes: number): string { return `${(bytes / MB).toFixed(1)} MB`; }
