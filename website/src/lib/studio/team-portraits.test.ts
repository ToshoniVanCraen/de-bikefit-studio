import { describe, expect, it } from 'vitest';
import {
  portraitCropWindow,
  TEAM_PORTRAIT_DIR,
  TEAM_PORTRAIT_PERSONS,
  teamPortrait,
} from './team-portraits';
import manifest from './team-portraits.json';

describe('portraitCropWindow', () => {
  it('cuts height from a tall picture and keeps the focus inside the edges', () => {
    // 1070×1600 (a phone photo in portrait): the 4:5 window is 1070×1338.
    expect(portraitCropWindow(1070, 1600, { x: 0.5, y: 0.5 })).toEqual({
      left: 0,
      top: 131,
      width: 1070,
      height: 1338,
    });
    // A focus low in the picture slides the window down, never past the bottom.
    expect(portraitCropWindow(1070, 1600, { x: 0.5, y: 0.9 })).toEqual({
      left: 0,
      top: 262,
      width: 1070,
      height: 1338,
    });
  });

  it('cuts width from a wide picture', () => {
    expect(portraitCropWindow(1536, 1024, { x: 0.5, y: 0.5 })).toEqual({
      left: 359,
      top: 0,
      width: 819,
      height: 1024,
    });
    expect(portraitCropWindow(1536, 1024, { x: 0, y: 0.5 }).left).toBe(0);
  });
});

describe('teamPortrait', () => {
  it('yields an empty ref without a file and a /images/team url with one', () => {
    for (const person of TEAM_PORTRAIT_PERSONS) {
      const entry = manifest.portraits[person];
      const ref = teamPortrait(person);
      expect(ref.mediaId).toBeNull();
      expect(ref.decorative).toBe(false);
      if (entry.file) {
        expect(ref.url).toBe(`${TEAM_PORTRAIT_DIR}/${entry.file}`);
        expect(ref.alt.length).toBeGreaterThan(10);
      } else {
        expect(ref.url).toBeNull();
      }
    }
  });
});
