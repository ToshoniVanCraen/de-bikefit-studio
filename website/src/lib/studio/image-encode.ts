/**
 * Size ladder for `scripts/import-editorial-image.mts`: try each long edge in
 * turn (largest first) and, per edge, each quality (highest first), and keep the
 * first encoding that fits `maxBytes`. Pure: the encoder is passed in, so the
 * ladder is unit-tested without sharp.
 */
export type EncodeResult = { data: Buffer; width: number; height: number; size: number };

export type EncodeLadder = {
  edges: readonly number[];
  qualities: readonly number[];
  maxBytes: number;
};

export type EncodeOutcome =
  | { ok: true; result: EncodeResult; edge: number; quality: number }
  | { ok: false; smallest: { size: number; edge: number; quality: number } | null };

export async function encodeUnderLimit(
  encode: (edge: number, quality: number) => Promise<EncodeResult>,
  ladder: EncodeLadder,
): Promise<EncodeOutcome> {
  let smallest: { size: number; edge: number; quality: number } | null = null;
  for (const edge of ladder.edges) {
    for (const quality of ladder.qualities) {
      const result = await encode(edge, quality);
      if (result.size <= ladder.maxBytes) return { ok: true, result, edge, quality };
      if (!smallest || result.size < smallest.size) smallest = { size: result.size, edge, quality };
    }
  }
  return { ok: false, smallest };
}
