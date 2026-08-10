document.addEventListener('DOMContentLoaded', () => {
  const bioPreview = document.getElementById('bio-preview-container');
  const openAppBtn = document.getElementById('open-app-btn');
  const clearStorageBtn = document.getElementById('clear-storage-btn');

  // Load stored biography preview
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['pending_biography'], (data) => {
      if (data.pending_biography) {
        bioPreview.innerText = data.pending_biography.slice(0, 300) + '...';
      } else {
        bioPreview.innerText = 'No biography pushed from Lineage Nexus yet.';
      }
    });
  }

  // Open Lineage Nexus Web App
  openAppBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: 'http://localhost:5173/chat' });
    } else {
      window.open('http://localhost:5173/chat', '_blank');
    }
  });

  // Clear storage
  clearStorageBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(['pending_biography', 'pending_vitals'], () => {
        bioPreview.innerText = 'No biography pushed from Lineage Nexus yet.';
      });
    }
  });
});
