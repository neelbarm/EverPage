import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StoreProvider, useStore } from '../context/StoreContext';
import { runtime, storage } from './store-runtime';
import { localDateKey } from '../lib/reliabilityPolicies';

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

test('streak reconciliation and freezes', async t => {
  function daysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return localDateKey(date);
  }
  function cloudWithStreak(streak: Record<string, unknown>, sessions: unknown[] = []) {
    const streakWrites: Array<Record<string, unknown>> = [];
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith('/local-auth/me')) return response({ user: { id: 'account-a' } });
      if (String(url).endsWith('/bookshelf/streak') && init?.method === 'PUT') {
        streakWrites.push(JSON.parse(String(init.body)));
      }
      if (init?.method === 'POST' || init?.method === 'PUT') return response({});
      return response(String(url).includes('recommendations') ? [] : { books: [book], sessions, streak });
    };
    return streakWrites;
  }

  await t.test('an expired cloud streak resets without erasing reading history or spending a freeze', async () => {
    reset();
    const dates = [7, 6, 5, 4, 3].map(daysAgo);
    const sessions = dates.map((date, i) => ({ id: `old-${i}`, bookId: book.id, durationMinutes: 10, startPage: i, endPage: i + 1, date, createdAt: i }));
    const streakWrites = cloudWithStreak({ currentStreak: 5, lastReadDate: dates[4], checkedDays: dates, freezesLeft: 1 }, sessions);
    const root = await mount();
    try {
      assert.equal(store.streak.currentStreak, 0);
      assert.deepEqual(store.streak.checkedDays, dates);
      assert.equal(store.profile.longestStreak, 5);
      assert.equal(streakWrites.at(-1)?.currentStreak, 0);
      assert.deepEqual(streakWrites.at(-1)?.checkedDays, dates);
      await act(() => store.useStreakFreeze());
      assert.equal(store.streak.freezesLeft, 1);
      assert.equal(store.streak.lastReadDate, dates[4]);
      await act(async () => { await store.logSession(book.id, 10, 10, 20, 'after-gap'); });
      assert.equal(store.streak.currentStreak, 1);
      assert.equal(store.profile.longestStreak, 5);
    } finally { await act(() => root.unmount()); }
  });

  await t.test('an expired locally cached streak is reconciled while offline', async () => {
    reset();
    const checkedDays = [daysAgo(3), daysAgo(2)];
    storage.set('everpage_v1:account-a', JSON.stringify({
      books: [book], sessions: [],
      streak: { currentStreak: 2, lastReadDate: checkedDays[1], checkedDays, dailyGoalMinutes: 30, todayMinutes: 20, freezesLeft: 2 },
    }));
    globalThis.fetch = async () => { throw new Error('offline'); };
    const root = await mount();
    try {
      assert.equal(store.streak.currentStreak, 0);
      assert.equal(store.streak.todayMinutes, 0);
      assert.deepEqual(store.streak.checkedDays, checkedDays);
      assert.equal(store.streak.freezesLeft, 2);
    } finally { await act(() => root.unmount()); }
  });

  await t.test('a valid freeze covers today once, including two presses before rerender', async () => {
    reset();
    const yesterday = daysAgo(1);
    cloudWithStreak({ currentStreak: 2, lastReadDate: yesterday, checkedDays: [daysAgo(2), yesterday], freezesLeft: 2 });
    const root = await mount();
    try {
      const freeze = store.useStreakFreeze;
      await act(async () => { freeze(); freeze(); await tick(); });
      assert.equal(store.streak.currentStreak, 2);
      assert.equal(store.streak.freezesLeft, 1);
      assert.equal(store.streak.lastReadDate, daysAgo(0));
      assert.equal(store.streak.checkedDays.filter(date => date === daysAgo(0)).length, 1);
      await act(() => store.useStreakFreeze());
      assert.equal(store.streak.freezesLeft, 1);
    } finally { await act(() => root.unmount()); }
  });

  await t.test('reading today prevents spending a freeze and existing earning rules stay intact', async () => {
    reset();
    cloudWithStreak({ currentStreak: 2, lastReadDate: daysAgo(1), checkedDays: [daysAgo(2), daysAgo(1)], freezesLeft: 1 });
    const root = await mount();
    try {
      await act(async () => { await store.logSession(book.id, 10, 10, 20, 'third-day'); });
      assert.equal(store.streak.currentStreak, 3);
      assert.equal(store.streak.freezesLeft, 2);
      await act(() => store.useStreakFreeze());
      assert.equal(store.streak.freezesLeft, 2);
    } finally { await act(() => root.unmount()); }
  });

  await t.test('day rollover reconciles a previously active streak without a new session', async t => {
    reset();
    const initialNow = new Date(2026, 10, 8, 23, 59).getTime();
    t.mock.timers.enable({ apis: ['Date'], now: initialNow });
    const originalSetInterval = globalThis.setInterval;
    let reconcile: (() => void) | undefined;
    t.mock.method(globalThis, 'setInterval', (callback: () => void, ms: number) => {
      if (ms === 60_000) reconcile = callback;
      return originalSetInterval(callback, ms);
    });
    cloudWithStreak({ currentStreak: 2, lastReadDate: daysAgo(1), checkedDays: [daysAgo(2), daysAgo(1)], freezesLeft: 1 });
    const root = await mount();
    try {
      assert.equal(store.streak.currentStreak, 2);
      t.mock.timers.setTime(new Date(2026, 10, 9, 0, 1).getTime());
      assert.ok(reconcile);
      await act(async () => { reconcile!(); await tick(); });
      assert.equal(store.streak.currentStreak, 0);
      assert.equal(store.streak.freezesLeft, 1);
    } finally {
      await act(() => root.unmount());
      t.mock.restoreAll();
      t.mock.timers.reset();
    }
  });
});
