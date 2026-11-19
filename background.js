const TRANSLATE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const REQUEST_TIMEOUT_MS = 10000;
const MAX_TEXT_LENGTH = 1500;
const MAX_CACHE_ENTRIES = 100;
const DEFAULT_SOURCE_LANGUAGE = "auto";
const DEFAULT_TARGET_LANGUAGE = "zh-CN";
const SUPPORTED_SOURCE_LANGUAGES = new Set(["auto", "en"]);
const SUPPORTED_TARGET_LANGUAGES = new Set([
    "en",
    "zh-CN",
    "zh-TW",
    "ja",
    "ko",
    "es",
    "fr",
    "de"
]);

const translationCache = new Map();
const pendingTranslations = new Map();
const requestConsumers = new Map();

function normalizeSourceLanguage(language) {
    // Add explicit source language codes to this allowlist when supported.
    return SUPPORTED_SOURCE_LANGUAGES.has(language)
        ? language
        : DEFAULT_SOURCE_LANGUAGE;
}

function normalizeTargetLanguage(language) {
    return SUPPORTED_TARGET_LANGUAGES.has(language)
        ? language
        : DEFAULT_TARGET_LANGUAGE;
}

function cacheTranslation(cacheKey, translation) {
    if (translationCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = translationCache.keys().next().value;
        translationCache.delete(oldestKey);
    }
    translationCache.set(cacheKey, translation);
}

async function requestTranslation(text, sourceLanguage, targetLanguage, requestKey) {
    const cacheKey = `${sourceLanguage}\n${targetLanguage}\n${text}`;
    if (translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey);
    }

    // Keep requests and cached results separate for each language pair.
    let pending = pendingTranslations.get(cacheKey);
    if (!pending) {
        const controller = new AbortController();
        pending = {
            controller,
            consumers: new Set(),
            promise: null
        };
        pending.promise = (async () => {
            const timeoutId = setTimeout(() => {
                controller.abort("timeout");
            }, REQUEST_TIMEOUT_MS);
            const query = new URLSearchParams({
                client: "gtx",
                sl: sourceLanguage,
                tl: targetLanguage,
                dt: "t",
                q: text
            });

            try {
                const response = await fetch(`${TRANSLATE_ENDPOINT}?${query}`, {
                    signal: controller.signal
                });

                if (!response.ok) {
                    throw new Error(`Translation service returned HTTP ${response.status}.`);
                }

                const data = await response.json();
                if (!Array.isArray(data?.[0])) {
                    throw new Error("Translation service returned an unexpected response.");
                }

                const translation = data[0]
                    .filter((segment) => Array.isArray(segment) && typeof segment[0] === "string")
                    .map((segment) => segment[0])
                    .join("");

                if (!translation) {
                    throw new Error("Translation service returned an empty response.");
                }

                cacheTranslation(cacheKey, translation);
                return translation;
            } catch (error) {
                if (error?.name === "AbortError") {
                    const message = controller.signal.reason === "timeout"
                        ? "Translation request timed out."
                        : "Translation request was cancelled.";
                    throw new Error(message);
                }
                throw error;
            } finally {
                clearTimeout(timeoutId);
                if (pendingTranslations.get(cacheKey) === pending) {
                    pendingTranslations.delete(cacheKey);
                }
            }
        })();
        pendingTranslations.set(cacheKey, pending);
    }

    pending.consumers.add(requestKey);
    requestConsumers.set(requestKey, cacheKey);
    try {
        return await pending.promise;
    } finally {
        pending.consumers.delete(requestKey);
        if (requestConsumers.get(requestKey) === cacheKey) {
            requestConsumers.delete(requestKey);
        }
    }
}

function getRequestKey(sender, requestId) {
    const tabId = sender.tab?.id ?? "extension";
    const frameId = sender.frameId ?? 0;
    const documentId = sender.documentId ?? "document";
    return `${tabId}:${frameId}:${documentId}:${requestId}`;
}

function cancelTranslation(requestKey) {
    const cacheKey = requestConsumers.get(requestKey);
    if (!cacheKey) {
        return false;
    }

    requestConsumers.delete(requestKey);
    const pending = pendingTranslations.get(cacheKey);
    if (!pending) {
        return false;
    }

    pending.consumers.delete(requestKey);
    if (pending.consumers.size === 0) {
        pending.controller.abort("cancelled");
    }
    return true;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.action === "cancelTranslate") {
        const requestId = Number.isSafeInteger(request.requestId) ? request.requestId : null;
        const cancelled = requestId !== null
            ? cancelTranslation(getRequestKey(sender, requestId))
            : false;
        sendResponse({ success: true, cancelled });
        return false;
    }

    if (request?.action !== "translate") {
        return false;
    }

    const text = typeof request.text === "string" ? request.text.trim() : "";
    if (!text) {
        sendResponse({ success: false, error: "No text was provided." });
        return false;
    }
    if (text.length > MAX_TEXT_LENGTH) {
        sendResponse({ success: false, error: `Text exceeds ${MAX_TEXT_LENGTH} characters.` });
        return false;
    }

    const sourceLanguage = normalizeSourceLanguage(request.sourceLanguage);
    const targetLanguage = normalizeTargetLanguage(request.targetLanguage);
    if (sourceLanguage !== "auto" && sourceLanguage === targetLanguage) {
        sendResponse({
            success: false,
            error: "Source and target languages must be different."
        });
        return false;
    }
    const requestId = Number.isSafeInteger(request.requestId) ? request.requestId : null;
    if (requestId === null) {
        sendResponse({ success: false, error: "Invalid translation request ID." });
        return false;
    }
    const requestKey = getRequestKey(sender, requestId);

    requestTranslation(text, sourceLanguage, targetLanguage, requestKey)
        .then((translation) => sendResponse({ success: true, text: translation }))
        .catch((error) => {
            sendResponse({
                success: false,
                error: error?.message || "Translation request failed."
            });
        });

    // Keep the message channel open until the asynchronous request completes.
    return true;
});
