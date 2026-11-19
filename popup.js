document.addEventListener('DOMContentLoaded', () => {
    const DEFAULT_SOURCE_LANGUAGE = 'auto';
    const DEFAULT_TARGET_LANGUAGE = 'zh-CN';
    const toggle = document.getElementById('pluginToggle');
    const sourceLanguageSelect = document.getElementById('sourceLanguage');
    const targetLanguageSelect = document.getElementById('targetLanguage');

    function hasOption(select, value) {
        return Array.from(select.options).some((option) => option.value === value);
    }

    function reconcileLanguagePair(source, target) {
        const validSource = hasOption(sourceLanguageSelect, source)
            ? source
            : DEFAULT_SOURCE_LANGUAGE;
        let validTarget = hasOption(targetLanguageSelect, target)
            ? target
            : DEFAULT_TARGET_LANGUAGE;

        if (validSource !== 'auto' && validSource === validTarget) {
            validTarget = DEFAULT_TARGET_LANGUAGE;
        }

        sourceLanguageSelect.value = validSource;
        targetLanguageSelect.value = validTarget;
        Array.from(targetLanguageSelect.options).forEach((option) => {
            option.disabled = validSource !== 'auto' && option.value === validSource;
        });

        return { sourceLanguage: validSource, targetLanguage: validTarget };
    }

    chrome.storage.local.get(['pluginEnabled', 'sourceLanguage', 'targetLanguage'], (result) => {
        toggle.checked = result.pluginEnabled !== false;
        const pair = reconcileLanguagePair(
            result.sourceLanguage || DEFAULT_SOURCE_LANGUAGE,
            result.targetLanguage || DEFAULT_TARGET_LANGUAGE
        );

        // Repair unsupported or conflicting settings left by older versions.
        if (result.sourceLanguage !== pair.sourceLanguage
            || result.targetLanguage !== pair.targetLanguage) {
            chrome.storage.local.set(pair);
        }
    });

    toggle.addEventListener('change', () => {
        // Storage changes are observed by every open content script.
        chrome.storage.local.set({ pluginEnabled: toggle.checked });
    });

    targetLanguageSelect.addEventListener('change', () => {
        const pair = reconcileLanguagePair(
            sourceLanguageSelect.value,
            targetLanguageSelect.value
        );
        chrome.storage.local.set(pair);
    });

    sourceLanguageSelect.addEventListener('change', () => {
        const pair = reconcileLanguagePair(
            sourceLanguageSelect.value,
            targetLanguageSelect.value
        );
        chrome.storage.local.set(pair);
    });
});
