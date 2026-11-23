// Clique no ícone abre (ou foca) a página de sincronização.
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("sync.html");
  const [aberta] = await chrome.tabs.query({ url });
  if (aberta) {
    await chrome.tabs.update(aberta.id, { active: true });
    await chrome.windows.update(aberta.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});
