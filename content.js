// content.js

// === 1. State Management / 状态管理 ===
let pluginEnabled = true;      // Master switch: Enabled by default / 总开关：默认开启
let currentMode = 'paragraph'; // Active mode: 'paragraph' or 'word'
let hoverTimer = null;         
let tooltip = null;            
let currentMouseX = 0;         
let currentMouseY = 0;         
let hideTimer = null;          // 用于延迟隐藏浮窗的定时器
let isMouseInTooltip = false;   // 标记鼠标当前是否在翻译浮窗内部
let currentTranslateTarget = null; // 记录当前正在翻译或显示翻译的目标元素

let logContainer = null;
let logTimer = null;

// === Initialize: Fetch current enabled status from storage ===
// === 初始化：从浏览器存储中获取当前插件的开关状态 ===
chrome.storage.local.get(['pluginEnabled'], (result) => {
    pluginEnabled = result.pluginEnabled !== false;
});

// === Listen for real-time toggle messages from popup.js ===
// === 监听来自 popup.js 的实时开关切换消息 ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "togglePlugin") {
        pluginEnabled = request.enabled;
        if (!pluginEnabled) {
            // If disabled, clean up timers and hide UI immediately
            // 如果被禁用，立刻清除定时器并隐藏所有浮窗 UI
            clearTimeout(hoverTimer);
            hideTooltip(true);
            showNotification("悬停翻译已关闭", false);
        } else {
            showNotification("悬停翻译已开启", true);
        }
    }
});


// === 2. Smooth Notification Log Logic / 左下角日志提示逻辑 ===
function showNotification(message, isHighlight = false) {
    if (!logContainer) {
        logContainer = document.createElement('div');
        logContainer.id = 'hoverTranslatorLog';
        Object.assign(logContainer.style, {
            position: 'fixed', bottom: '20px', left: '20px', padding: '8px 14px',
            background: 'rgba(0, 0, 0, 0.8)', color: '#ffffff', borderRadius: '4px',
            fontSize: '13px', zIndex: '10000000',
            pointerEvents: 'none', transition: 'opacity 0.3s ease, transform 0.3s ease',
            opacity: '0', transform: 'translateY(10px)',
            
            // === 抗锯齿与字体高级优化 ===
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Hiragino Kaku Gothic ProN", "Meiryo", "Microsoft YaHei", sans-serif',
            webkitFontSmoothing: 'antialiased',
            mozOsxFontSmoothing: 'grayscale',
            textRendering: 'optimizeLegibility'
        });
        document.body.appendChild(logContainer);
    }

    clearTimeout(logTimer);
    logContainer.innerText = message;
    logContainer.style.borderLeft = isHighlight ? '4px solid #007acc' : '4px solid #888888';
    
    logContainer.style.display = 'block';
    logContainer.offsetHeight; 
    logContainer.style.opacity = '1';
    logContainer.style.transform = 'translateY(0)';

    logTimer = setTimeout(() => {
        logContainer.style.opacity = '0';
        logContainer.style.transform = 'translateY(10px)';
        logTimer = setTimeout(() => {
            if (logContainer) logContainer.style.display = 'none';
        }, 300);
    }, 2000);
}


// === 3. Keyboard Event Listeners (Ctrl Toggle) / 键盘事件监听 ===
window.addEventListener('keydown', (e) => {
    if (!pluginEnabled) return; // Guard clause / 如果插件关闭则不响应
    if (e.key === 'Control' && currentMode !== 'word') {
        currentMode = 'word';
        showNotification("已切换至：单字识别模式 (按住 Ctrl)", true);
    }
});

window.addEventListener('keyup', (e) => {
    if (!pluginEnabled) return; // Guard clause
    if (e.key === 'Control') {
        currentMode = 'paragraph';
        showNotification("已切换至：段落识别模式", false);
    }
});


// === 4. Text Extraction Logic / 文本提取逻辑 ===
function getTextUnderMouse(e) {
    if (currentMode === 'paragraph') {
        return e.target ? e.target.innerText.trim() : '';
    } else if (currentMode === 'word') {
        if (!document.caretRangeFromPoint) return '';
        
        const range = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return '';
        
        const textNode = range.startContainer;
        const offset = range.startOffset;
        const text = textNode.textContent;
        
        const validCharRegex = /[a-zA-Z0-9'\u4e00-\u9fa5]/;
        
        let start = offset;
        while (start > 0 && validCharRegex.test(text[start - 1])) {
            start--;
        }
        
        let end = offset;
        while (end < text.length && validCharRegex.test(text[end])) {
            end++;
        }
        
        return text.substring(start, end).trim();
    }
    return '';
}


// === 5. Background Translation Bridge / 对接后台翻译通信 ===
async function translateText(text) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "translate", text: text }, (response) => {
            if (response && response.success) {
                resolve(response.text);
            } else {
                resolve(`[错误]: 无法获取翻译 (${response ? response.error : '网络异常'})`);
            }
        });
    });
}


// === 6. Tooltip UI Logic / 智能边界自适应浮窗 ===
function createTooltip() {
    tooltip = document.createElement('div');
    tooltip.id = 'hoverTranslatorTooltip';
    Object.assign(tooltip.style, {
        position: 'fixed', padding: '10px 14px', background: 'rgba(30, 30, 30, 0.95)',
        color: '#ffffff', borderRadius: '6px', fontSize: '14px', lineHeight: '1.5',
        zIndex: '2147483647', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', maxWidth: '350px',
        wordWrap: 'break-word', display: 'none', pointerEvents: 'auto', 
        overflowY: 'auto', boxSizing: 'border-box',
        
        // === 抗锯齿与字体高级优化 ===
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Hiragino Kaku Gothic ProN", "Meiryo", "Microsoft YaHei", sans-serif',
        webkitFontSmoothing: 'antialiased',
        mozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility'
    });

    // 高优先级事件绑定：使用捕获模式 (true) 为 tooltip 绑定 mouseenter 和 mouseleave 事件
    tooltip.addEventListener('mouseenter', () => {
        isMouseInTooltip = true;
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
    }, true);

    tooltip.addEventListener('mouseleave', () => {
        isMouseInTooltip = false;
        hideTooltip();
    }, true);

    document.body.appendChild(tooltip);
}

function showTooltip(x, y, text) {
    if (!tooltip) createTooltip();
    
    // 先将 maxHeight 设为 'none'，让浏览器计算出自然高度
    tooltip.style.maxHeight = 'none';
    tooltip.innerText = text;
    tooltip.style.display = 'block';
    tooltip.style.opacity = '0'; 

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    const offset = 15; 

    let finalX = x + offset;
    let finalY = y + offset;
    let isUp = false;

    // 判断是否会超出视口底部，决定是向上还是向下弹出
    if (finalY + tooltipHeight > windowHeight) {
        isUp = true;
    }

    let computedMaxHeight;
    if (isUp) {
        // 向上翻转弹出时：可用最大高度为从视口顶部到当前光标的距离
        computedMaxHeight = y - offset - 10;
    } else {
        // 保持向下弹出时：可用最大高度为从当前光标到视口底部的距离
        computedMaxHeight = windowHeight - finalY - 20;
    }

    // 动态限制最大高度，最小不低于 80px
    const maxH = Math.max(computedMaxHeight, 80);
    tooltip.style.maxHeight = `${maxH}px`;

    // 重新获取限制高度后的 offsetHeight，用于精准定位 top 坐标
    const actualHeight = tooltip.offsetHeight;

    if (isUp) {
        finalY = y - actualHeight - offset;
    } else {
        finalY = y + offset;
    }

    // 左右边界防御
    if (finalX + tooltipWidth > windowWidth) {
        finalX = x - tooltipWidth - offset;
    }
    if (finalX < 0) finalX = 10; 
    if (finalY < 0) finalY = 10;

    tooltip.style.left = `${finalX}px`;
    tooltip.style.top = `${finalY}px`;
    tooltip.style.opacity = '1';
}

function hideTooltip(immediate = false) {
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }

    const performHide = () => {
        if (tooltip) {
            tooltip.style.opacity = '0';
            tooltip.style.display = 'none';
        }
        currentTranslateTarget = null;
    };

    if (immediate) {
        performHide();
    } else {
        hideTimer = setTimeout(() => {
            hideTimer = null;
            if (!isMouseInTooltip) {
                performHide();
            }
        }, 200);
    }
}

// === 7. Mouse Interaction / 鼠标交互监听 ===
document.addEventListener('mousemove', (e) => {
    // 第一层防御（同步拦截）：如果鼠标在浮窗内部，或者光标下的元素属于浮窗本身，强行终止任何后续逻辑
    if (isMouseInTooltip || (tooltip && tooltip.contains(e.target))) {
        return;
    }

    // Top Guard Clause: If plugin is turned off, do absolutely nothing
    // 最高优先级守卫：如果插件总开关关闭，不做任何计算直接返回
    if (!pluginEnabled) return; 

    // 如果鼠标触发了新的目标元素，则使旧的目标元素失效
    if (e.target !== currentTranslateTarget) {
        currentTranslateTarget = null;
    }

    currentMouseX = e.clientX;
    currentMouseY = e.clientY;

    clearTimeout(hoverTimer);
    hideTooltip();

    const target = e.target;
    
    if (
        target && 
        target.innerText && 
        target.innerText.trim().length > 0 && 
        target !== logContainer && 
        target !== tooltip
    ) {
        hoverTimer = setTimeout(async () => {
            const textToTranslate = getTextUnderMouse(e);
            
            if (textToTranslate && textToTranslate.length > 0) {
                // 记录当前翻译的目标元素
                currentTranslateTarget = target;
                
                showTooltip(currentMouseX, currentMouseY, "正在翻译...");
                const translatedResult = await translateText(textToTranslate);
                
                // 第二层防御（异步拦截）：在网络请求返回后，进行二次状态校验
                if (isMouseInTooltip || currentTranslateTarget !== target) {
                    return; // 丢弃该次请求结果
                }
                
                showTooltip(currentMouseX, currentMouseY, translatedResult);
            }
        }, 500); 
    }
});

document.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimer);
    hideTooltip();
});