import test from 'node:test';
import assert from 'node:assert/strict';
import Observable from 'ol/Observable.js';
import type Map from 'ol/Map';
import { waitForBaseMap } from '../src/baseComponent/OpenlayersMap/startup.ts';

test('base map completion releases the startup listener', async () => {
  const map = new Observable();
  const startup = waitForBaseMap(map as unknown as Map);
  map.dispatchEvent('rendercomplete');
  await startup.ready;
  assert.equal(map.hasListener('rendercomplete'), false);
});

test('unavailable tiles do not block business initialization', async () => {
  const map = new Observable();
  await waitForBaseMap(map as unknown as Map, 5).ready;
  assert.equal(map.hasListener('rendercomplete'), false);
});

test('unmount cancels startup and releases its listener', async () => {
  const map = new Observable();
  const startup = waitForBaseMap(map as unknown as Map);
  startup.cancel();
  startup.cancel();
  await startup.ready;
  assert.equal(map.hasListener('rendercomplete'), false);
});
