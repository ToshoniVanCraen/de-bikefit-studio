import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import manifest from './editorial-images.json';
import { EDITORIAL_SLOTS, editorialImage } from './editorial-images';

const PUBLIC_DIR = fileURLToPath(new URL('../../../public', import.meta.url));

describe('editorial images', () => {
  it('every delivered slot points at an optimised file that exists', () => {
    for (const slot of EDITORIAL_SLOTS) {
      const entry = manifest.images[slot] as { file: string | null; bytes: number | null };
      const ref = editorialImage(slot);
      if (!entry.file) {
        expect(ref.url).toBeNull();
        continue;
      }
      expect(ref.url).toBe(`/images/editorial/${entry.file}`);
      expect(entry.file).toMatch(new RegExp(`^${slot}-v\\d+\\.webp$`));
      const size = statSync(`${PUBLIC_DIR}${ref.url}`).size;
      expect(size).toBe(entry.bytes);
      expect(size).toBeLessThanOrEqual(450 * 1024);
    }
  });

  it('records provenance and Dutch alt text; a generated image never names a team member', () => {
    for (const slot of EDITORIAL_SLOTS) {
      const entry = manifest.images[slot] as {
        file: string | null;
        alt: string;
        generated: boolean;
        prompt: string | null;
        sourceSha256: string | null;
      };
      expect(entry.alt.length).toBeGreaterThan(20);
      if (entry.generated) {
        expect(JSON.stringify(entry)).not.toMatch(/Rutger|Robin|Goran|Roelandts|Lierde|Walle/);
      } else {
        // A real photograph (20 Oct 2026): no prompt, and it may name who is on it.
        expect(entry.prompt).toBeNull();
      }
      if (entry.file) expect(entry.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
