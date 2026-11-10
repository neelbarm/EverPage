import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StoreProvider, useStore, type RecommendedBook } from '../context/StoreContext';
import { runtime, storage } from './store-runtime';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let store: ReturnType<typeof useStore>;
function Probe() { store = useStore(); return null; }
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 5));
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const book = { id: 'book-a', title: 'Existing', author: 'Author', totalPages: 200, currentPage: 10, genre: 'Mystery', addedAt: 1, friendsReading: [], coverColor: '#123456' };
const recommendation = (title: string): RecommendedBook => ({
  id: title, title, author: 'Author', genre: 'Mystery', coverColor: '#123456', reason: 'you read mystery', friendsCount: 0,
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function mockApi(
  read: (token: string) => RecommendedBook[] | Promise<RecommendedBook[]>,
  write: (path: string, payload: any, token: string) => Promise<void> = async () => {},
) {
  storage.clear();
  runtime.user = { id: 'account-a' };
  runtime.token = 'token-a';
  runtime.beforeWrite = null;
  // Every request is intercepted; an unrecognized route fails instead of
  // falling through to a real API or book provider.
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    const token = new Headers(init?.headers).get('Authorization') ?? '';
    if (path.endsWith('/local-auth/me')) {
      return response({ user: { id: token.endsWith('token-b') ? 'account-b' : 'account-a' } });
    }
    if (path.endsWith('/social/recommendations')) return response(await read(token));
    if (path.includes('/bookshelf?')) return response({ books: [book], sessions: [], streak: null });
    if (/\/bookshelf\/(books|sessions|streak)$/.test(path) && ['POST', 'PUT'].includes(init?.method ?? '')) {
      await write(path, JSON.parse(String(init?.body)), token);
      return response({});
    }
    throw new Error(`Unexpected mocked API request: ${path}`);
  };
}

async function mount(): Promise<ReactTestRenderer> {
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<StoreProvider><Probe /></StoreProvider>); await tick(); });
  await act(tick);
  return root;
}

test('recommendations follow acknowledged reading data', async t => {
  await t.test('successful empty results clear defaults and prior results; failed reads preserve results', async () => {
    let results: RecommendedBook[] = [];
    let fail = false;
    mockApi(() => {
      if (fail) throw new Error('offline');
      return results;
    });
    const root = await mount();
    try {
      assert.deepEqual(store.recommendedBooks, []);
      results = [recommendation('Candidate')];
      await act(() => store.refreshRecommendations());
      assert.deepEqual(store.recommendedBooks, results);
      fail = true;
      await act(() => store.refreshRecommendations());
      assert.deepEqual(store.recommendedBooks, results);
      fail = false;
      results = [];
      await act(() => store.refreshRecommendations());
      assert.deepEqual(store.recommendedBooks, []);
    } finally { await act(() => root.unmount()); }
  });

  await t.test('adding a book refreshes once after its delayed server save', async () => {
    const held = deferred();
    let saved = false;
    let reads = 0;
    mockApi(() => {
      reads += 1;
      return [recommendation(saved ? 'Next candidate' : 'New book')];
    }, async path => {
      if (path.endsWith('/books')) { await held.promise; saved = true; }
    });
    const root = await mount();
    try {
      const before = reads;
      await act(async () => { store.addBook('New book', 'Author', 200, 'Mystery'); await tick(); });
      assert.equal(saved, false);
      assert.equal(reads, before, 'do not read the server before the queued write commits');
      await act(async () => { held.resolve(); await tick(); });
      assert.equal(saved, true);
      assert.equal(reads, before + 1);
      assert.equal(store.recommendedBooks[0].title, 'Next candidate');
      await act(tick);
      assert.equal(reads, before + 1, 'refresh does not start a synchronization loop');
    } finally { held.resolve(); await act(() => root.unmount()); }
  });

  await t.test('one active flush refreshes after concurrent edits have also reached the server', async () => {
    const held = deferred();
    const committed: string[] = [];
    let writes = 0;
    let reads = 0;
    const readSnapshots: string[][] = [];
    mockApi(() => {
      reads += 1;
      readSnapshots.push([...committed]);
      return [recommendation('Candidate')];
    }, async (path, payload) => {
      if (!path.endsWith('/books')) return;
      if (++writes === 1) await held.promise;
      committed.push(payload.title);
    });
    const root = await mount();
    try {
      const before = reads;
      await act(async () => { store.updateBook(book.id, { title: 'First edit' }); await tick(); });
      await act(async () => { store.updateBook(book.id, { title: 'Latest edit' }); await tick(); });
      await act(async () => { store.addBook('Second book', 'Author', 200, 'Mystery'); await tick(); });
      assert.equal(reads, before);
      await act(async () => { held.resolve(); await tick(); });
      assert.deepEqual(committed, ['First edit', 'Latest edit', 'Second book']);
      assert.equal(reads, before + 1);
      assert.deepEqual(readSnapshots.at(-1), committed);
    } finally { held.resolve(); await act(() => root.unmount()); }
  });

  await t.test('a logged session refreshes only after both book and session writes finish', async () => {
    const held = deferred();
    const committed: string[] = [];
    let reads = 0;
    mockApi(() => { reads += 1; return [recommendation('Candidate')]; }, async path => {
      if (path.endsWith('/sessions')) await held.promise;
      committed.push(path.split('/').at(-1)!);
    });
    const root = await mount();
    try {
      const before = reads;
      await act(async () => { await store.logSession(book.id, 10, 10, 20, 'session-a'); await tick(); });
      assert.deepEqual(committed, ['books']);
      assert.equal(reads, before);
      await act(async () => { held.resolve(); await tick(); });
      assert.deepEqual(committed, ['books', 'sessions', 'streak']);
      assert.equal(reads, before + 1);
    } finally { held.resolve(); await act(() => root.unmount()); }
  });

  await t.test('an offline write refreshes after the existing retry succeeds, not when it fails', async t => {
    const originalSetInterval = globalThis.setInterval;
    let retry: (() => void) | undefined;
    t.mock.method(globalThis, 'setInterval', (callback: () => void, ms: number) => {
      if (ms === 30_000) retry = callback;
      return originalSetInterval(callback, ms);
    });
    let online = true;
    let saved = false;
    let reads = 0;
    mockApi(() => {
      reads += 1;
      return [recommendation(saved ? 'After retry' : 'Before retry')];
    }, async path => {
      if (!online) throw new Error('offline');
      if (path.endsWith('/books')) saved = true;
    });
    const root = await mount();
    try {
      const before = reads;
      online = false;
      await act(async () => { store.addBook('Queued', 'Author', 200, 'Mystery'); await tick(); });
      assert.equal(reads, before);
      assert.equal(saved, false);
      assert.ok(store.syncError);
      online = true;
      assert.ok(retry);
      await act(async () => { retry!(); await tick(); });
      assert.equal(saved, true);
      assert.equal(reads, before + 1);
      assert.equal(store.recommendedBooks[0].title, 'After retry');
      await act(async () => { retry!(); await tick(); });
      assert.equal(reads, before + 1, 'an empty retry does not refetch recommendations');
    } finally { await act(() => root.unmount()); t.mock.restoreAll(); }
  });

  await t.test('a pre-save response cannot overwrite newer post-save recommendations', async () => {
    const held = deferred();
    let holdNextRead = false;
    let saved = false;
    mockApi(async () => {
      const result = [recommendation(saved ? 'Fresh' : 'Stale')];
      if (holdNextRead) { holdNextRead = false; await held.promise; }
      return result;
    }, async path => { if (path.endsWith('/books')) saved = true; });
    const root = await mount();
    let pending!: Promise<void>;
    try {
      holdNextRead = true;
      await act(async () => { pending = store.refreshRecommendations(); await tick(); });
      await act(async () => { store.addBook('New', 'Author', 200, 'Mystery'); await tick(); });
      assert.equal(store.recommendedBooks[0].title, 'Fresh');
      await act(async () => { held.resolve(); await pending; });
      assert.equal(store.recommendedBooks[0].title, 'Fresh');
    } finally { held.resolve(); await act(() => root.unmount()); }
  });

  await t.test('late reads and successful writes from a previous account cannot refresh the next account', async () => {
    const heldRead = deferred();
    const heldWrite = deferred();
    const heldNextAccountRead = deferred();
    const tokens: string[] = [];
    let holdNextRead = false;
    mockApi(async token => {
      tokens.push(token);
      if (holdNextRead) { holdNextRead = false; await heldRead.promise; }
      if (token.endsWith('token-b')) await heldNextAccountRead.promise;
      return [recommendation(token.endsWith('token-b') ? 'Account B' : 'Account A')];
    }, async () => { await heldWrite.promise; });
    const root = await mount();
    let pending!: Promise<void>;
    try {
      const previousAccountRefresh = store.refreshRecommendations;
      holdNextRead = true;
      await act(async () => { pending = store.refreshRecommendations(); await tick(); });
      await act(async () => { store.addBook('Account A book', 'Author', 200, 'Mystery'); await tick(); });
      runtime.user = { id: 'account-b' };
      runtime.token = 'token-b';
      await act(async () => { root.update(<StoreProvider><Probe /></StoreProvider>); await tick(); });
      await act(tick);
      const beforeStaleCall = tokens.length;
      // Internal callers may retain a captured account argument. Such a call
      // must not supersede the new account's already-running request.
      await act(() => Reflect.apply(previousAccountRefresh, undefined, [undefined, 'account-a']));
      assert.equal(tokens.length, beforeStaleCall);
      await act(async () => { heldNextAccountRead.resolve(); await tick(); });
      assert.equal(store.recommendedBooks[0].title, 'Account B');
      const before = tokens.length;
      await act(async () => { heldRead.resolve(); heldWrite.resolve(); await pending; await tick(); });
      assert.equal(tokens.length, before, 'old flush must not issue a fresh request for either account');
      assert.equal(store.recommendedBooks[0].title, 'Account B');
    } finally { heldRead.resolve(); heldWrite.resolve(); heldNextAccountRead.resolve(); await act(() => root.unmount()); }
  });
});
