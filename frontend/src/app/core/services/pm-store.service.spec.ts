import { Injector } from '@angular/core';
import { vi } from 'vitest';
import { PmStore } from './pm-store.service';
import { TemplateService } from './template.service';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { PMTask } from '../models/pm.model';

const task = (id: string, status: string) => ({ id, status, assetId: 'A1' }) as unknown as PMTask;

function setup(initial: PMTask[]) {
  let server = initial;
  const api = {
    getAssets: vi.fn(async () => []),
    getTasks: vi.fn(async (status?: string, _d?: string, _p?: string, _a?: string, excludeStatus?: string) =>
      server.filter(t => (!status || t.status === status) && (!excludeStatus || t.status !== excludeStatus))),
    getTemplates: vi.fn(async () => []),
  };
  const auth = { currentUser: () => null, hasPermission: () => false };
  const injector = Injector.create({
    providers: [{ provide: ApiService, useValue: api }, { provide: AuthService, useValue: auth }, PmStore, TemplateService],
  });
  return { store: injector.get(PmStore), setServer: (t: PMTask[]) => (server = t) };
}

describe('PmStore.loadData', () => {
  it('keeps Done history that was already loaded when the open tasks are refreshed', async () => {
    const { store, setServer } = setup([task('P1', 'Pending'), task('D1', 'Done')]);
    await store.loadData();
    expect(store.pmTasks().map(t => t.id)).toEqual(['P1']);

    await store.loadHistoricalTasks();
    expect(store.pmTasks().map(t => t.id).sort()).toEqual(['D1', 'P1']);

    setServer([task('P1', 'Pending'), task('P2', 'Pending'), task('D1', 'Done')]);
    await store.loadData();
    expect(store.pmTasks().map(t => t.id).sort()).toEqual(['D1', 'P1', 'P2']);
  });
});
