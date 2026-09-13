import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';

const origin = process.env.EVERPAGE_TEST_API;
if (!origin || !['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) {
  throw new Error('EVERPAGE_TEST_API must be a local test server');
}
const route = '/api/local-auth/reset-password';
const response = await fetch(origin + route);
const html = await response.text();
const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
const token = 'a'.repeat(64);

function browser({ hash = '#token=' + token, search = '', result = {success:true}, ok = true } = {}) {
  let submit, sent, cleared;
  const elements = {
    reset: { hidden:false, addEventListener: (_, fn) => { submit=fn; }, reset() { this.cleared=true; } },
    submit: {disabled:false}, message:{textContent:''},
    password:{value:'Local-Dummy-Password!'}, confirm:{value:'Local-Dummy-Password!'},
  };
  vm.runInNewContext(script, {
    URLSearchParams, Error,
    location:{hash,search,pathname:route},
    history:{replaceState: (...args) => {cleared=args[2];}},
    document:{getElementById: id=>elements[id]},
    fetch:async (url,options)=>{sent={url,options};return {ok,json:async()=>result};},
  });
  return {elements, run:()=>submit({preventDefault(){}}), sent:()=>sent, cleared:()=>cleared};
}

test('reset page is served with restrictive security headers',()=>{
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/text\/html/);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const nonce=html.match(/<script nonce="([^"]+)"/)[1];
  assert.ok(response.headers.get('content-security-policy').includes(`'nonce-${nonce}'`));
});
test('missing token disables the reset form',()=>{
  const b=browser({hash:''}); assert.equal(b.elements.reset.hidden,true);
});
test('mismatched passwords never send a reset request',async()=>{
  const b=browser(); b.elements.confirm.value='Different'; await b.run();
  assert.equal(b.sent(),undefined); assert.match(b.elements.message.textContent,/do not match/);
});
test('valid form posts only to its same-origin endpoint and clears URL token',async()=>{
  const b=browser(); await b.run();
  assert.equal(b.cleared(),route); assert.equal(b.sent().url,route);
  assert.deepEqual(JSON.parse(b.sent().options.body),{token,newPassword:'Local-Dummy-Password!'});
  assert.equal(b.elements.reset.hidden,true); assert.equal(b.elements.reset.cleared,true);
  await b.run(); assert.equal(b.elements.submit.disabled,true);
});
test('expired token displays API error and allows retry',async()=>{
  const b=browser({ok:false,result:{error:'This reset link is invalid or has expired.'}}); await b.run();
  assert.match(b.elements.message.textContent,/expired/); assert.equal(b.elements.submit.disabled,false);
});
test('query tokens remain supported but are removed from the address bar',async()=>{
  const b=browser({hash:'',search:'?token='+token}); await b.run();
  assert.equal(b.cleared(),route); assert.equal(JSON.parse(b.sent().options.body).token,token);
});
