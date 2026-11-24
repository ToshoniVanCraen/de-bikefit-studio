import { describe, expect, it } from 'vitest';
import { encodeUnderLimit, type EncodeResult } from './image-encode';

const ladder = { edges: [2000, 1600, 1200], qualities: [80, 60], maxBytes: 1000 };

function fake(sizeFor: (edge: number, quality: number) => number) {
  const calls: Array<[number, number]> = [];
  const encode = async (edge: number, quality: number): Promise<EncodeResult> => {
    calls.push([edge, quality]);
    return { data: Buffer.alloc(0), width: edge, height: edge, size: sizeFor(edge, quality) };
  };
  return { encode, calls };
}

describe('encodeUnderLimit', () => {
  it('stops at the first fit, highest edge and quality first', async () => {
    const { encode, calls } = fake(() => 900);
    const out = await encodeUnderLimit(encode, ladder);
    expect(out).toMatchObject({ ok: true, edge: 2000, quality: 80 });
    expect(calls).toEqual([[2000, 80]]);
  });

  it('lowers the quality before the edge', async () => {
    const { encode, calls } = fake((_e, q) => (q === 60 ? 900 : 1500));
    const out = await encodeUnderLimit(encode, ladder);
    expect(out).toMatchObject({ ok: true, edge: 2000, quality: 60 });
    expect(calls).toEqual([
      [2000, 80],
      [2000, 60],
    ]);
  });

  it('retries at a smaller long edge when the lowest quality is still too big', async () => {
    const { encode } = fake((edge) => (edge <= 1600 ? 800 : 5000));
    const out = await encodeUnderLimit(encode, ladder);
    expect(out).toMatchObject({ ok: true, edge: 1600, quality: 80 });
  });

  it('fails with the smallest attempt when nothing fits', async () => {
    const { encode, calls } = fake((edge, q) => 2000 + edge + q);
    const out = await encodeUnderLimit(encode, ladder);
    expect(calls).toHaveLength(6);
    expect(out).toEqual({
      ok: false,
      smallest: { size: 2000 + 1200 + 60, edge: 1200, quality: 60 },
    });
  });
});
