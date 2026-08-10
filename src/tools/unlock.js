import { decryptBytes } from '../core/encryption.js';

const fileInput = document.querySelector('#file');
const passwordInput = document.querySelector('#password');
const button = document.querySelector('#decrypt');
const status = document.querySelector('#status');

button.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file || !passwordInput.value) return show('Выберите архив и введите пароль', true);
  button.disabled = true; show('Расшифрование…');
  try {
    const zip = await decryptBytes(await file.arrayBuffer(), passwordInput.value);
    const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: file.name.replace(/\.vkt$/i, '') + '.zip' });
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
    show('ZIP создан'); passwordInput.value = '';
  } catch (error) { show(error.message || String(error), true); }
  finally { button.disabled = false; }
});

function show(message, error = false) { status.textContent = message; status.className = error ? 'error' : ''; }
