// popup.js

document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('pluginToggle');

    // 1. Load the saved status from chrome.storage (default to true if not set)
    // 从 storage 中读取保存的状态（如果未设置，默认为开启状态 true）
    chrome.storage.local.get(['pluginEnabled'], (result) => {
        toggle.checked = result.pluginEnabled !== false; // Only false makes it unchecked
    });

    // 2. Listen to toggle changes, save status, and broadcast to content scripts
    // 监听开关改变，保存状态并广播通知所有网页
    toggle.addEventListener('change', () => {
        const isEnabled = toggle.checked;
        
        // Save status locally / 本地保存状态
        chrome.storage.local.set({ pluginEnabled: isEnabled }, () => {
            // Notify active tab immediately / 立刻通知当前正在浏览的网页标签页
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && tabs[0].id) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: "togglePlugin", enabled: isEnabled });
                }
            });
        });
    });
});