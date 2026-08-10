const defaults = {
  modules: { dialogs: true, debug: true, photos: true, ui: true },
  dialogs: { incremental: false, anonymize: false, includeAttachments: true, encrypt: false },
  debug: { showMessageIds: true },
  ui: { hideClips: false, hideStories: false, compactMenu: false, customCss: '' },
};
const form = document.querySelector('#settings');
const status = document.querySelector('#status');

init().catch(showError);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveSettings('Настройки сохранены');
});
form.addEventListener('change', () => saveSettings('Сохранено автоматически'));

async function saveSettings(message) {
  const data = new FormData(form);
  const settings = {
    modules: Object.fromEntries(Object.keys(defaults.modules).map((id) => [id, data.has(`module.${id}`)])),
    dialogs: { incremental: data.has('dialogs.incremental'), anonymize: data.has('dialogs.anonymize'), includeAttachments: data.has('dialogs.includeAttachments'), encrypt: data.has('dialogs.encrypt') },
    debug: { showMessageIds: data.has('debug.showMessageIds') },
    ui: {
      hideClips: data.has('ui.hideClips'), hideStories: data.has('ui.hideStories'), compactMenu: data.has('ui.compactMenu'), customCss: String(data.get('ui.customCss') || ''),
    },
  };
  try {
    await chrome.storage.sync.set(settings);
    status.style.color = '#72ca84'; status.textContent = message;
    setTimeout(() => { status.textContent = ''; }, 1600);
  }
  catch (error) { showError(error); }
}
document.querySelector('#resetArchives').addEventListener('click', async () => {
  const saved = await chrome.storage.local.get(null);
  const sessionKeys = Object.keys(saved).filter((key) => key.startsWith('dialogCollectorSession:'));
  await chrome.storage.local.remove(['dialogArchiveState', ...sessionKeys]);
  status.style.color = '#72ca84'; status.textContent = 'История экспортов и сборов сброшена';
  setTimeout(() => { status.textContent = ''; }, 1600);
});

async function init() {
  const saved = await chrome.storage.sync.get(Object.keys(defaults));
  const values = { modules: { ...defaults.modules, ...saved.modules }, dialogs: { ...defaults.dialogs, ...saved.dialogs }, debug: { ...defaults.debug, ...saved.debug }, ui: { ...defaults.ui, ...saved.ui } };
  for (const [id, enabled] of Object.entries(values.modules)) form.elements[`module.${id}`].checked = enabled;
  for (const key of ['incremental', 'anonymize', 'includeAttachments', 'encrypt']) form.elements[`dialogs.${key}`].checked = values.dialogs[key];
  form.elements['debug.showMessageIds'].checked = values.debug.showMessageIds;
  for (const key of ['hideClips', 'hideStories', 'compactMenu']) form.elements[`ui.${key}`].checked = values.ui[key];
  form.elements['ui.customCss'].value = values.ui.customCss;
}
function showError(error) { status.style.color = '#ff7a7a'; status.textContent = error.message || String(error); }
