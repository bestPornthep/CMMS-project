import { diffChecklist } from './checklist-diff.util';

const item = (text: string, requiresPhoto = false, requiresValue = false) => ({ text, requiresPhoto, requiresValue });

describe('diffChecklist', () => {
  it('returns nothing for identical checklists', () => {
    expect(diffChecklist([item('a'), item('b')], [item('a'), item('b')])).toEqual([]);
  });

  it('ignores a pure reorder', () => {
    expect(diffChecklist([item('a'), item('b')], [item('b'), item('a')])).toEqual([]);
  });

  it('reports added and removed items', () => {
    expect(diffChecklist([item('a'), item('b')], [item('a'), item('c')])).toEqual(["Added: 'c'", "Removed: 'b'"]);
  });

  it('treats an edited text as remove + add', () => {
    expect(diffChecklist([item('Check oil')], [item('Check oil level')])).toEqual([
      "Added: 'Check oil level'",
      "Removed: 'Check oil'",
    ]);
  });

  it('reports photo / value requirement flips', () => {
    expect(
      diffChecklist([item('a', false, true), item('b', true, false)], [item('a', true, false), item('b', false, false)]),
    ).toEqual([
      "Added photo requirement: 'a'",
      "Removed value requirement: 'a'",
      "Removed photo requirement: 'b'",
    ]);
  });

  it('handles duplicate texts as a bag', () => {
    expect(diffChecklist([item('a'), item('a')], [item('a')])).toEqual(["Removed: 'a'"]);
    expect(diffChecklist([item('a')], [item('a'), item('a')])).toEqual(["Added: 'a'"]);
  });

  it('treats missing flags as false', () => {
    expect(diffChecklist([{ text: 'a' }], [item('a')])).toEqual([]);
  });
});
