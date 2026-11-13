export interface ChecklistItemLike {
  text: string;
  requiresPhoto?: boolean;
  requiresValue?: boolean;
}

/**
 * Human-readable diff of two checklists for the audit trail. Items are
 * matched as a bag on exact text, so a pure reorder produces no lines.
 */
export function diffChecklist(before: ChecklistItemLike[] = [], after: ChecklistItemLike[] = []): string[] {
  const remaining = new Map<string, ChecklistItemLike[]>();
  for (const item of before) {
    const queue = remaining.get(item.text) ?? [];
    queue.push(item);
    remaining.set(item.text, queue);
  }

  const added: string[] = [];
  const flags: string[] = [];
  for (const item of after) {
    const old = remaining.get(item.text)?.shift();
    if (!old) {
      added.push(`Added: '${item.text}'`);
      continue;
    }
    for (const [key, label] of [['requiresPhoto', 'photo'], ['requiresValue', 'value']] as const) {
      if (!!old[key] !== !!item[key]) {
        flags.push(`${item[key] ? 'Added' : 'Removed'} ${label} requirement: '${item.text}'`);
      }
    }
  }

  const removed: string[] = [];
  for (const queue of remaining.values()) {
    for (const item of queue) removed.push(`Removed: '${item.text}'`);
  }

  return [...added, ...removed, ...flags];
}
