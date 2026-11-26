import { describe, expect, it } from 'vitest';
import { fillMissing } from '../server/fill-missing';

describe('fillMissing', () => {
  it('adds missing fields and sections without changing existing ones', () => {
    const stored = { site: { name: 'Edited', menu: { notesLabel: 'Mine' } }, list: [1] };
    const defaults = {
      site: { name: 'Default', menu: { notesLabel: 'Notes', colour: { cancel: 'Cancel' } } },
      list: [1, 2, 3],
      supplyChain: { chapters: [] },
    };
    expect(fillMissing(stored, defaults)).toEqual({
      site: { name: 'Edited', menu: { notesLabel: 'Mine', colour: { cancel: 'Cancel' } } },
      list: [1], // lists are never merged
      supplyChain: { chapters: [] },
    });
  });
});
