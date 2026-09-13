import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StoreProvider, useStore } from '../context/StoreContext';
import { runtime, storage } from './store-runtime';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let store: ReturnType<typeof useStore>;
function Probe() { store = useStore(); return null; }
const book = { id: 'book-a', title: 'Original', author: 'Author', totalPages: 200, currentPage: 10, genre: 'fiction', addedAt: 1, friendsReading: [], coverColor: '#123456' };
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 5));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function mount(): Promise<ReactTestRenderer> {
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<StoreProvider><Probe /></StoreProvider>); await tick(); });
  await act(tick);
  return root;
}
function reset() {
  storage.clear();
  runtime.user = { id: 'account-a' };
  runtime.token = 'token-a';
  runtime.beforeWrite = null;
  globalThis.fetch = async () => { throw new Error('No test response configured'); };
}

test('real StoreProvider synchronization', async t => {
  await t.test('offline startup recovers outbox-only data and retries credentials on reconnect', async () => {
    reset();
    let online = false;
    const sent: string[] = [];
    // Derive the actual namespace from a normal guest save, rather than
    // duplicating production key constants in this test.
    runtime.user = null;
    let root = await mount();
    await act(async () => { store.addBook('Guest', 'Author', 100, 'fiction'); await tick(); });
    const queueKey = [...storage.keys()].find(key => key.includes('queue'))!;
    assert.ok(queueKey);
    await act(() => root.unmount());
    reset();
    const accountQueueKey = queueKey.replace('guest', 'account-a');
    storage.set(accountQueueKey, JSON.stringify([{ id: 'book:book-a', accountId: 'account-a', kind: 'book', payload: book, createdAt: 1 }]));
    globalThis.fetch = async (url, init) => {
      if (!online) throw new Error('offline');
      if (String(url).endsWith('/local-auth/me')) return response({ user: { id: 'account-a' } });
      if (init?.method === 'POST') { sent.push(String(url)); return response({}); }
      return response(String(url).includes('recommendations') ? [] : { books: [], sessions: [], streak: null });
    };
    root = await mount();
    try {
      assert.equal(store.isLoaded, true);
      assert.equal(store.books[0]?.id, book.id);
      online = true;
      await act(async () => { await store.retrySync(); });
      assert.ok(sent.some(url => url.endsWith('/bookshelf/books')));
      assert.deepEqual(JSON.parse(storage.get(accountQueueKey)!), []);
    } finally { await act(() => root.unmount()); }
  });

  await t.test('an older request cannot clear a newer book edit', async () => {
    reset();
    const first = deferred();
    const sent: string[] = [];
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith('/local-auth/me')) return response({ user: { id: 'account-a' } });
      if (init?.method === 'POST') {
        sent.push(JSON.parse(String(init.body)).title);
        if (sent.length === 1) await first.promise;
        return response({});
      }
      return response(String(url).includes('recommendations') ? [] : { books: [book], sessions: [], streak: null });
    };
    const root = await mount();
    try {
      await act(async () => { store.updateBook(book.id, { title: 'First' }); await tick(); });
      assert.deepEqual(sent, ['First']);
      await act(async () => { store.updateBook(book.id, { title: 'Second' }); await tick(); });
      await act(async () => { first.resolve(); await tick(); });
      assert.deepEqual(sent, ['First', 'Second']);
      assert.equal(store.books[0].title, 'Second');
    } finally { first.resolve(); await act(() => root.unmount()); }
  });

  await t.test('a delayed cloud response cannot erase an already-synced local book', async () => {
    reset();
    const cloud = deferred();
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith('/local-auth/me')) return response({ user: { id: 'account-a' } });
      if (init?.method === 'POST') return response({});
      if (String(url).includes('recommendations')) return response([]);
      await cloud.promise;
      return response({ books: [], sessions: [], streak: null });
    };
    const root = await mount();
    try {
      await act(async () => { store.addBook('New book', 'Author', 200, 'fiction'); await tick(); });
      await act(async () => { cloud.resolve(); await tick(); });
      assert.equal(store.books.length, 1);
      assert.equal(store.books[0].title, 'New book');
    } finally { cloud.resolve(); await act(() => root.unmount()); }
  });

  await t.test('a pending save stays in account A after account B signs in', async () => {
    reset();
    const heldWrite = deferred();
    const sent: Array<{ token: string; path: string }> = [];
    globalThis.fetch = async (url, init) => {
      const token = new Headers(init?.headers).get('Authorization') ?? '';
      if (String(url).endsWith('/local-auth/me')) return response({ user: { id: token.endsWith('token-b') ? 'account-b' : 'account-a' } });
      if (init?.method === 'POST' || init?.method === 'PUT') {
        sent.push({ token, path: String(url) });
        return response({});
      }
      return response(String(url).includes('recommendations') ? [] : { books: token.endsWith('token-a') ? [book] : [], sessions: [], streak: null });
    };
    let root = await mount();
    let save!: Promise<void>;
    try {
      runtime.beforeWrite = async key => {
        if (key.includes('queue') && key.includes('account-a')) await heldWrite.promise;
      };
      await act(async () => { save = store.logSession(book.id, 10, 10, 20, 'stable-a'); await tick(); });
      await act(() => root.unmount());
      runtime.user = { id: 'account-b' };
      runtime.token = 'token-b';
      root = await mount();
      await act(async () => { heldWrite.resolve(); await save; await tick(); });
      assert.deepEqual(store.books, []);
      assert.deepEqual(store.sessions, []);
      for (const [key, value] of storage) {
        if (key.includes('account-b')) assert.equal(value.includes('stable-a'), false);
      }
      assert.equal(sent.some(request => request.token === 'Bearer token-b'), false);
    } finally { heldWrite.resolve(); await act(() => root.unmount()); }
  });
});
