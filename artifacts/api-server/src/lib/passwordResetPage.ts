// Served by the API so password recovery does not depend on a native-only Expo build.
// Never interpolate the token or any request input into this document.
export function passwordResetPage(nonce: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Reset password | EverPage</title>
<style nonce="${nonce}">body{margin:0;background:#f1ebdf;color:#123f49;font:17px system-ui,sans-serif}main{max-width:420px;margin:8vh auto;padding:28px;background:#fffaf2;border-radius:20px}label,input,button{display:block;box-sizing:border-box;width:100%}label{margin:20px 0 8px}input,button{padding:14px;font:inherit;border-radius:8px;border:1px solid #aaa}button{margin-top:24px;background:#8b2335;color:white;border:0;cursor:pointer}button:disabled{opacity:.6}#message{line-height:1.5}h1{font-size:28px}</style></head>
<body><main><h1>Reset your EverPage password</h1><p>Choose a new password for your account.</p>
<form id="reset"><label for="password">New password</label><input id="password" name="newPassword" type="password" autocomplete="new-password" minlength="6" maxlength="128" required>
<label for="confirm">Confirm new password</label><input id="confirm" type="password" autocomplete="new-password" minlength="6" maxlength="128" required>
<button id="submit" type="submit">Reset password</button></form><p id="message" role="status" aria-live="polite"></p>
<noscript>Enable JavaScript to reset your password, or open the reset link in the EverPage app.</noscript></main>
<script nonce="${nonce}">
const token = new URLSearchParams(location.hash.slice(1)).get('token') || new URLSearchParams(location.search).get('token');
history.replaceState(null, '', location.pathname);
const form = document.getElementById('reset');
const button = document.getElementById('submit');
const message = document.getElementById('message');
if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
  form.hidden = true;
  message.textContent = 'This reset link is missing or invalid. Request a new one from Forgot password in EverPage.';
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled || !token) return;
  const password = document.getElementById('password').value;
  if (password !== document.getElementById('confirm').value) {
    message.textContent = 'The passwords do not match.'; return;
  }
  button.disabled = true;
  message.textContent = 'Updating your password…';
  try {
    const response = await fetch(location.pathname, {method:'POST', credentials:'omit', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token,newPassword:password})});
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error(result.error || 'Unable to reset your password. Please try again.');
    form.reset(); form.hidden = true;
    message.textContent = 'Your password has been reset. Return to EverPage and sign in with your new password.';
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : 'Unable to connect. Please try again.';
    button.disabled = false;
  }
});
</script></body></html>`;
}
