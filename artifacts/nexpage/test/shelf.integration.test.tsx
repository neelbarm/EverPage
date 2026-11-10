import React from 'react';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ShelfScreen from '../app/(tabs)/index';
import { runtime, resetRuntime } from './shelf-runtime';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 5));
let pending: Array<(pages: number) => void> = [];

async function mount(): Promise<ReactTestRenderer> {
  resetRuntime();
  pending = [];
  globalThis.fetch = async url => {
    assert.ok(String(url).startsWith('https://openlibrary.org/search.json?'), 'only the mocked page-count lookup is expected');
    return new Promise<Response>(resolve => {
      pending.push(pages => resolve(new Response(JSON.stringify({ docs: [{ number_of_pages_median: pages }] }))));
    });
  };
  let root!: ReactTestRenderer;
  await act(() => { root = create(<ShelfScreen />); });
  return root;
}

function childrenByType(node: ReactTestInstance, type: string): ReactTestInstance[] {
  return node.findAll(child => child.type === type);
}
function byType(root: ReactTestRenderer, type: string): ReactTestInstance[] {
  return childrenByType(root.root, type);
}
function button(root: ReactTestRenderer, label: string) {
  const result = byType(root, 'TouchableOpacity').find(node =>
    childrenByType(node, 'Text').some(text => text.children.join('') === label),
  );
  assert.ok(result, `button ${label} exists`);
  return result;
}
function recommendationCard(root: ReactTestRenderer, id: string) {
  const result = byType(root, 'TouchableOpacity').find(node =>
    childrenByType(node, 'BookCover').some(child => child.props.bookId === id),
  );
  assert.ok(result, `recommendation ${id} exists`);
  return result;
}
function pageInput(root: ReactTestRenderer) {
  const inputs = byType(root, 'TextInput');
  assert.equal(inputs.length, 1);
  return inputs[0];
}

test('recommendation expansion shows three or all cards without changing selection behavior', async () => {
  const root = await mount();
  const count = () => byType(root, 'BookCover').filter(node => node.props.bookId.startsWith('rec-')).length;
  try {
    assert.equal(count(), 3);
    await act(() => button(root, 'Show more recommendations').props.onPress());
    assert.equal(count(), 8);
    assert.equal(runtime.refreshes, 1);
    await act(() => button(root, 'Show fewer recommendations').props.onPress());
    assert.equal(count(), 3);
    assert.equal(runtime.refreshes, 1);
    assert.equal(pending.length, 0);
  } finally { await act(() => root.unmount()); }
});

test('late recommendation metadata cannot replace manually entered pages before adding', async () => {
  const root = await mount();
  try {
    await act(() => recommendationCard(root, 'rec-0').props.onPress());
    assert.equal(pending.length, 1);
    await act(() => pageInput(root).props.onChangeText('470'));
    await act(async () => { pending[0](300); await tick(); });
    assert.equal(pageInput(root).props.value, '470');
    await act(() => button(root, 'Add to my shelf').props.onPress());
    assert.deepEqual(runtime.adds, [['Recommendation 0', 'Author', 470, 'Mystery', undefined]]);
    assert.equal(byType(root, 'TextInput').length, 0);
    assert.deepEqual(runtime.navigation, []);
  } finally { await act(() => root.unmount()); }
});

test('clearing the pages field is a manual edit and is not undone by late metadata', async () => {
  const root = await mount();
  try {
    await act(() => recommendationCard(root, 'rec-0').props.onPress());
    await act(() => pageInput(root).props.onChangeText('470'));
    await act(() => pageInput(root).props.onChangeText(''));
    await act(async () => { pending[0](300); await tick(); });
    assert.equal(pageInput(root).props.value, '');
    assert.equal(button(root, 'Add to my shelf').props.disabled, true);
    assert.deepEqual(runtime.adds, []);
  } finally { await act(() => root.unmount()); }
});

test('opening another recommendation resets edit protection while ignoring the previous lookup', async () => {
  const root = await mount();
  try {
    await act(() => recommendationCard(root, 'rec-0').props.onPress());
    await act(() => pageInput(root).props.onChangeText('470'));
    await act(() => button(root, 'Not for me').props.onPress());
    await act(() => recommendationCard(root, 'rec-1').props.onPress());
    assert.equal(pending.length, 2);
    assert.equal(pageInput(root).props.value, '');
    await act(async () => { pending[0](300); await tick(); });
    assert.equal(pageInput(root).props.value, '', 'a dismissed recommendation cannot fill the new book');
    await act(async () => { pending[1](220); await tick(); });
    assert.equal(pageInput(root).props.value, '220', 'the new book still autofills before any user edit');
    await act(() => button(root, 'Not for me').props.onPress());
    await act(() => recommendationCard(root, 'rec-0').props.onPress());
    await act(async () => { pending[2](310); await tick(); });
    assert.equal(pageInput(root).props.value, '310', 'reopening the original book starts a fresh lookup');
  } finally { await act(() => root.unmount()); }
});
