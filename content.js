const HOVER_DELAY_MS = 500;
const TOOLTIP_HIDE_DELAY_MS = 200;
const MAX_TEXT_LENGTH = 1500;
const DEFAULT_SOURCE_LANGUAGE = "auto";
const DEFAULT_TARGET_LANGUAGE = "zh-CN";
const SUPPORTED_SOURCE_LANGUAGES = new Set(["auto", "en"]);
const SUPPORTED_TARGET_LANGUAGES = new Set(["zh-CN", "zh-TW", "ja", "ko", "es", "fr", "de"]);
const BLOCK_SELECTOR = "p, li, blockquote, figcaption, td, th, h1, h2, h3, h4, h5, h6";
const IGNORED_SELECTOR = "input, textarea, select, option, [contenteditable='true']";

let pluginEnabled = false;
let sourceLanguage = DEFAULT_SOURCE_LANGUAGE;
let targetLanguage = DEFAULT_TARGET_LANGUAGE;
let currentMode = "paragraph";
let hoverTimer = null;
let hideTimer = null;
let logTimer = null;
let animationFrameId = null;
let tooltip = null;
let logContainer = null;
let isMouseInTooltip = false;
let hoverTarget = null;
let currentTranslateTarget = null;
let requestSequence = 0;
let latestPointerEvent = null;

function setPluginEnabled(enabled, announce = false) {
    pluginEnabled = enabled;
    if (!enabled) {
        clearHoverState(true);
        resetInputMode();
    }
    if (announce) {
        showNotification(enabled ? "Hover translation enabled" : "Hover translation disabled", enabled);
    }
}

function setSourceLanguage(language) {
    // Extend this allowlist when more explicit source languages are added.
    sourceLanguage = SUPPORTED_SOURCE_LANGUAGES.has(language)
        ? language
        : DEFAULT_SOURCE_LANGUAGE;
    clearHoverState(true);
}

function setTargetLanguage(language) {
    targetLanguage = SUPPORTED_TARGET_LANGUAGES.has(language)
        ? language
        : DEFAULT_TARGET_LANGUAGE;
    clearHoverState(true);
}

chrome.storage.local.get(["pluginEnabled", "sourceLanguage", "targetLanguage"], (result) => {
    setPluginEnabled(result.pluginEnabled !== false);
    setSourceLanguage(result.sourceLanguage);
    setTargetLanguage(result.targetLanguage);
});

// Observe the shared setting so every open tab changes state immediately.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.pluginEnabled) {
        setPluginEnabled(changes.pluginEnabled.newValue !== false, true);
    }
    if (areaName === "local" && changes.targetLanguage) {
        setTargetLanguage(changes.targetLanguage.newValue);
    }
    if (areaName === "local" && changes.sourceLanguage) {
        setSourceLanguage(changes.sourceLanguage.newValue);
    }
});

function showNotification(message, isHighlight = false) {
    if (!document.body) {
        return;
    }

    if (!logContainer) {
        logContainer = document.createElement("div");
        logContainer.id = "hoverTranslatorLog";
        Object.assign(logContainer.style, {
            position: "fixed",
            bottom: "20px",
            left: "20px",
            padding: "8px 14px",
            background: "rgba(0, 0, 0, 0.8)",
            color: "#ffffff",
            borderRadius: "4px",
            fontSize: "13px",
            zIndex: "2147483647",
            pointerEvents: "none",
            transition: "opacity 0.3s ease, transform 0.3s ease",
            opacity: "0",
            transform: "translateY(10px)",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            webkitFontSmoothing: "antialiased",
            textRendering: "optimizeLegibility"
        });
        document.body.appendChild(logContainer);
    }

    clearTimeout(logTimer);
    logContainer.textContent = message;
    logContainer.style.borderLeft = isHighlight ? "4px solid #007acc" : "4px solid #888888";
    logContainer.style.display = "block";
    logContainer.getBoundingClientRect();
    logContainer.style.opacity = "1";
    logContainer.style.transform = "translateY(0)";

    logTimer = setTimeout(() => {
        if (!logContainer) {
            return;
        }
        logContainer.style.opacity = "0";
        logContainer.style.transform = "translateY(10px)";
        logTimer = setTimeout(() => {
            if (logContainer) {
                logContainer.style.display = "none";
            }
        }, 300);
    }, 2000);
}

function resetInputMode() {
    currentMode = "paragraph";
}

window.addEventListener("keydown", (event) => {
    if (!pluginEnabled || event.key !== "Control" || currentMode === "word") {
        return;
    }
    currentMode = "word";
    clearHoverState(true);
    showNotification("Word mode active while Ctrl is held", true);
});

window.addEventListener("keyup", (event) => {
    if (event.key !== "Control") {
        return;
    }
    const modeChanged = currentMode !== "paragraph";
    resetInputMode();
    clearHoverState(true);
    if (pluginEnabled && modeChanged) {
        showNotification("Paragraph mode active", false);
    }
});

// Reset transient keyboard state when keyup cannot reach the page.
window.addEventListener("blur", () => {
    resetInputMode();
    clearHoverState(true);
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        resetInputMode();
        clearHoverState(true);
    }
});

function normalizeText(text) {
    return text.replace(/\s+/g, " ").trim();
}

function getCaretAtPoint(x, y) {
    if (document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(x, y);
        return position ? { node: position.offsetNode, offset: position.offset } : null;
    }
    if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y);
        return range ? { node: range.startContainer, offset: range.startOffset } : null;
    }
    return null;
}

function rectContainsPoint(rect, x, y) {
    return rect.width > 0
        && rect.height > 0
        && x >= rect.left
        && x <= rect.right
        && y >= rect.top
        && y <= rect.bottom;
}

function getTextHitAtPoint(x, y) {
    const caret = getCaretAtPoint(x, y);
    if (!caret || caret.node.nodeType !== Node.TEXT_NODE) {
        return null;
    }

    const pointElement = document.elementFromPoint(x, y);
    const textElement = caret.node.parentElement;
    if (!pointElement
        || !textElement
        || !(pointElement === textElement
            || pointElement.contains(textElement))) {
        return null;
    }

    const text = caret.node.textContent || "";
    const candidates = [caret.offset, caret.offset - 1];
    for (const offset of candidates) {
        if (offset < 0 || offset >= text.length || /\s/u.test(text[offset])) {
            continue;
        }

        const range = document.createRange();
        range.setStart(caret.node, offset);
        range.setEnd(caret.node, offset + 1);
        const isHit = Array.from(range.getClientRects())
            .some((rect) => rectContainsPoint(rect, x, y));
        range.detach();

        if (isHit) {
            return { node: caret.node, offset };
        }
    }

    return null;
}

function getParagraphSource(hit) {
    const textElement = hit?.node.parentElement;
    if (!textElement || textElement.closest(IGNORED_SELECTOR)) {
        return null;
    }

    const source = textElement.closest(BLOCK_SELECTOR) || textElement;
    if (source === document.body || source === document.documentElement) {
        return null;
    }

    return source;
}

function getWordText(hit) {
    if (!hit) {
        return "";
    }

    const text = hit.node.textContent || "";
    const offset = hit.offset;

    if (typeof Intl.Segmenter === "function") {
        const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
        for (const segment of segmenter.segment(text)) {
            const end = segment.index + segment.segment.length;
            if (offset >= segment.index && offset < end) {
                return segment.isWordLike ? segment.segment.trim() : "";
            }
        }
    }

    // Unicode property escapes keep the fallback useful without language-specific literals.
    const validCharacter = /[\p{L}\p{N}']/u;
    let start = offset;
    let end = offset;
    while (start > 0 && validCharacter.test(text[start - 1])) {
        start -= 1;
    }
    while (end < text.length && validCharacter.test(text[end])) {
        end += 1;
    }
    return text.slice(start, end).trim();
}

function getTextSourceAtPoint(x, y) {
    const hit = getTextHitAtPoint(x, y);
    if (!hit) {
        return null;
    }

    if (currentMode === "word") {
        return { hit, target: hit.node };
    }

    const target = getParagraphSource(hit);
    return target ? { hit, target } : null;
}

function getTextFromSource(source) {
    if (currentMode === "word") {
        return getWordText(source.hit);
    }
    return normalizeText(source.target.innerText || source.target.textContent || "");
}

function translateText(text) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: "translate",
            text,
            sourceLanguage,
            targetLanguage
        }, (response) => {
            if (chrome.runtime.lastError) {
                resolve(`[Error] ${chrome.runtime.lastError.message}`);
                return;
            }
            if (response?.success) {
                resolve(response.text);
                return;
            }
            resolve(`[Error] ${response?.error || "Translation request failed."}`);
        });
    });
}

function createTooltip() {
    if (!document.body) {
        return;
    }

    tooltip = document.createElement("div");
    tooltip.id = "hoverTranslatorTooltip";
    Object.assign(tooltip.style, {
        position: "fixed",
        padding: "10px 14px",
        background: "rgba(30, 30, 30, 0.95)",
        color: "#ffffff",
        borderRadius: "6px",
        fontSize: "14px",
        lineHeight: "1.5",
        zIndex: "2147483647",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
        maxWidth: "350px",
        overflowWrap: "break-word",
        display: "none",
        pointerEvents: "auto",
        overflowY: "auto",
        boxSizing: "border-box",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        webkitFontSmoothing: "antialiased",
        textRendering: "optimizeLegibility"
    });

    tooltip.addEventListener("mouseenter", () => {
        isMouseInTooltip = true;
        clearTimeout(hideTimer);
        hideTimer = null;
    });

    tooltip.addEventListener("mouseleave", () => {
        isMouseInTooltip = false;
        hideTooltip();
    });

    document.body.appendChild(tooltip);
}

function showTooltip(x, y, text) {
    if (!tooltip) {
        createTooltip();
    }
    if (!tooltip) {
        return;
    }

    tooltip.style.maxHeight = "none";
    tooltip.textContent = text;
    tooltip.style.display = "block";
    tooltip.style.opacity = "0";

    const offset = 15;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const tooltipWidth = tooltip.offsetWidth;
    const naturalHeight = tooltip.offsetHeight;
    let finalX = x + offset;
    let finalY = y + offset;
    const showAbove = finalY + naturalHeight > viewportHeight;
    const availableHeight = showAbove
        ? y - offset - 10
        : viewportHeight - finalY - 20;

    tooltip.style.maxHeight = `${Math.max(availableHeight, 80)}px`;
    const actualHeight = tooltip.offsetHeight;
    finalY = showAbove ? y - actualHeight - offset : y + offset;

    if (finalX + tooltipWidth > viewportWidth) {
        finalX = x - tooltipWidth - offset;
    }

    tooltip.style.left = `${Math.max(finalX, 10)}px`;
    tooltip.style.top = `${Math.max(finalY, 10)}px`;
    tooltip.style.opacity = "1";
}

function hideTooltip(immediate = false) {
    clearTimeout(hideTimer);
    hideTimer = null;

    const performHide = () => {
        if (tooltip) {
            tooltip.style.opacity = "0";
            tooltip.style.display = "none";
        }
        currentTranslateTarget = null;
    };

    if (immediate) {
        performHide();
        return;
    }

    hideTimer = setTimeout(() => {
        hideTimer = null;
        if (!isMouseInTooltip) {
            performHide();
        }
    }, TOOLTIP_HIDE_DELAY_MS);
}

function clearHoverState(immediate = false) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
    hoverTarget = null;
    currentTranslateTarget = null;
    requestSequence += 1;
    hideTooltip(immediate);
}

function isValidTarget(target) {
    return target instanceof Element
        && target !== tooltip
        && target !== logContainer
        && !tooltip?.contains(target)
        && !logContainer?.contains(target)
        && !target.closest(IGNORED_SELECTOR);
}

function processPointerMove(event) {
    animationFrameId = null;
    if (!pluginEnabled || isMouseInTooltip || !isValidTarget(event.target)) {
        return;
    }

    // A DOM event target can be a large container, so verify the pointer intersects a text range.
    const source = getTextSourceAtPoint(event.clientX, event.clientY);
    if (!source) {
        if (hoverTimer || hoverTarget || currentTranslateTarget) {
            clearHoverState();
        }
        return;
    }

    const targetChanged = hoverTarget !== source.target;
    if (!targetChanged && currentMode === "paragraph" && (hoverTimer || currentTranslateTarget)) {
        return;
    }

    clearTimeout(hoverTimer);
    if (targetChanged || currentMode === "word") {
        requestSequence += 1;
        hideTooltip();
    }

    hoverTarget = source.target;
    const x = event.clientX;
    const y = event.clientY;
    const modeAtSchedule = currentMode;

    hoverTimer = setTimeout(async () => {
        hoverTimer = null;
        if (!pluginEnabled || hoverTarget !== source.target || currentMode !== modeAtSchedule) {
            return;
        }

        // Recheck the coordinates because layout may change during the hover delay.
        const currentSource = getTextSourceAtPoint(x, y);
        if (!currentSource || currentSource.target !== source.target) {
            clearHoverState();
            return;
        }

        const text = getTextFromSource(currentSource);
        if (!text) {
            return;
        }
        currentTranslateTarget = source.target;
        if (text.length > MAX_TEXT_LENGTH) {
            showTooltip(x, y, `Text is too long. Limit: ${MAX_TEXT_LENGTH} characters.`);
            return;
        }

        const requestId = ++requestSequence;
        showTooltip(x, y, "Translating...");
        const translation = await translateText(text);

        // Ignore stale responses after the pointer, mode, or enabled state changes.
        if (!pluginEnabled
            || requestId !== requestSequence
            || hoverTarget !== source.target
            || currentMode !== modeAtSchedule) {
            return;
        }

        showTooltip(x, y, translation);
    }, HOVER_DELAY_MS);
}

document.addEventListener("mousemove", (event) => {
    latestPointerEvent = event;
    if (animationFrameId !== null) {
        return;
    }
    animationFrameId = requestAnimationFrame(() => processPointerMove(latestPointerEvent));
}, { passive: true });

document.addEventListener("mouseleave", () => {
    clearHoverState();
});
