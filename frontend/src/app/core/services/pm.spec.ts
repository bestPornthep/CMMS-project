import { TestBed } from '@angular/core/testing';

import { Pm } from './pm';

describe('Pm', () => {
  let service: Pm;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Pm);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
