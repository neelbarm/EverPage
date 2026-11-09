import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import SessionLogScreen from '../app/session-log/[bookId]';
import RegisterModal from '../components/RegisterModal';
import { runtime, resetRuntime } from './screens-runtime';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
async function mount(component: React.ReactElement) {
  let root!: ReactTestRenderer;
  await act(async () => { root = create(component); });
  return root;
}
function input(root: ReactTestRenderer, placeholder: string) {
  return root.root.findAllByType('TextInput' as any).find(node => node.props.placeholder === placeholder)!;
}
function saveButton(root: ReactTestRenderer) { return root.root.findByType('TouchableOpacity' as any); }

test('login submits whitespace exactly; registration normalization is unchanged', async () => {
  resetRuntime();
  runtime.authenticated = false;
  let root = await mount(<RegisterModal visible onClose={() => {}} />);
  try {
    await act(async () => {
      input(root, 'you@example.com').props.onChangeText('user@example.com');
      input(root, '••••••••').props.onChangeText(' valid-password ');
    });
    await act(async () => { await input(root, '••••••••').props.onSubmitEditing(); });
    assert.deepEqual(runtime.loginCalls, [['user@example.com', ' valid-password ']]);
  } finally { await act(() => root.unmount()); }
  root = await mount(<RegisterModal visible defaultMode="register" onClose={() => {}} />);
  try {
    await act(async () => {
      input(root, 'you@example.com').props.onChangeText('user@example.com');
      const passwords = root.root.findAllByType('TextInput' as any).filter(node => node.props.secureTextEntry);
      passwords[0].props.onChangeText(' valid-password ');
      passwords[1].props.onChangeText(' valid-password ');
      input(root, 'MM / DD / YYYY').props.onChangeText('01011990');
    });
    await act(async () => { await input(root, 'MM / DD / YYYY').props.onSubmitEditing(); });
    assert.equal(runtime.registerCalls[0]?.[1], 'valid-password');
  } finally { await act(() => root.unmount()); }
});

test('failed note stays visible; retry saves only the note before leaving', async () => {
  resetRuntime();
  runtime.noteFailure = true;
  const root = await mount(<SessionLogScreen />);
  try {
    await act(async () => { input(root, 'What struck you about this section?').props.onChangeText('Keep this note'); });
    await act(async () => { await saveButton(root).props.onPress(); });
    assert.equal(runtime.navigation.length, 0);
    assert.equal(runtime.removed.length, 0);
    assert.equal(input(root, 'What struck you about this section?').props.value, 'Keep this note');
    assert.ok(JSON.stringify(root.toJSON()).includes('your note could not be saved'));
    assert.equal(runtime.logCalls.length, 1);
    runtime.noteFailure = false;
    await act(async () => { await saveButton(root).props.onPress(); });
    assert.equal(runtime.logCalls.length, 1);
    assert.equal(runtime.noteCalls.length, 2);
    assert.equal(runtime.noteCalls[0].id, runtime.noteCalls[1].id);
    assert.equal(runtime.removed.length, 1);
    assert.deepEqual(runtime.navigation, ['/(tabs)']);
  } finally { await act(() => root.unmount()); }
});

test('cleanup retry does not resubmit an acknowledged note or session', async () => {
  resetRuntime();
  runtime.cleanupFailure = true;
  const root = await mount(<SessionLogScreen />);
  try {
    await act(async () => { input(root, 'What struck you about this section?').props.onChangeText('Saved note'); });
    await act(async () => { await saveButton(root).props.onPress(); });
    assert.equal(runtime.navigation.length, 0);
    runtime.cleanupFailure = false;
    await act(async () => { await saveButton(root).props.onPress(); });
    assert.equal(runtime.logCalls.length, 1);
    assert.equal(runtime.noteCalls.length, 1);
    assert.equal(runtime.navigation.length, 1);
  } finally { await act(() => root.unmount()); }
});
