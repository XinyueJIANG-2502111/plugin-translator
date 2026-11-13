document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('pluginToggle');
    const sourceLanguageSelect = document.getElementById('sourceLanguage');
    const targetLanguageSelect = document.getElementById('targetLanguage');

    chrome.storage.local.get(['pluginEnabled', 'sourceLanguage', 'targetLanguage'], (result) => {
        toggle.checked = result.pluginEnabled !== false;
        const savedSourceLanguage = result.sourceLanguage || 'auto';
        const isSourceSupported = Array.from(sourceLanguageSelect.options)
            .some((option) => option.value === savedSourceLanguage);
        sourceLanguageSelect.value = isSourceSupported ? savedSourceLanguage : 'auto';

        const savedLanguage = result.targetLanguage || 'zh-CN';
        const isSupported = Array.from(targetLanguageSelect.options)
            .some((option) => option.value === savedLanguage);
        targetLanguageSelect.value = isSupported ? savedLanguage : 'zh-CN';
    });

    toggle.addEventListener('change', () => {
        // Storage changes are observed by every open content script.
        chrome.storage.local.set({ pluginEnabled: toggle.checked });
    });

    targetLanguageSelect.addEventListener('change', () => {
        chrome.storage.local.set({ targetLanguage: targetLanguageSelect.value });
    });

    sourceLanguageSelect.addEventListener('change', () => {
        chrome.storage.local.set({ sourceLanguage: sourceLanguageSelect.value });
    });
});
