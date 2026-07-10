// // content.js

// // === 1. State Management / 状态管理 ===
// let pluginEnabled = true;      // Master switch: Enabled by default / 总开关：默认开启
// let currentMode = 'paragraph'; // Active mode: 'paragraph' or 'word'
// let hoverTimer = null;         
// let tooltip = null;            
// let currentMouseX = 0;         
// let currentMouseY = 0;         

// let logContainer = null;
// let logTimer = null;

// // === Initialize: Fetch current enabled status from storage ===
// // === 初始化：从浏览器存储中获取当前插件的开关状态 ===
// chrome.storage.local.get(['pluginEnabled'], (result) => {
//     pluginEnabled = result.pluginEnabled !== false;
// });

// // === Listen for real-time toggle messages from popup.js ===
// // === 监听来自 popup.js 的实时开关切换消息 ===
// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//     if (request.action === "togglePlugin") {
//         pluginEnabled = request.enabled;
//         if (!pluginEnabled) {
//             // If disabled, clean up timers and hide UI immediately
//             // 如果被禁用，立刻清除定时器并隐藏所有浮窗 UI
//             clearTimeout(hoverTimer);
//             hideTooltip();
//             showNotification("悬停翻译已关闭", false);
//         } else {
//             showNotification("悬停翻译已开启", true);
//         }
//     }
// });


// // === 2. Smooth Notification Log Logic / 左下角日志提示逻辑 ===
// function showNotification(message, isHighlight = false) {
//     if (!logContainer) {
//         logContainer = document.createElement('div');
//         logContainer.id = 'hoverTranslatorLog';
//         Object.assign(logContainer.style, {
//             position: 'fixed', bottom: '20px', left: '20px', padding: '8px 14px',
//             background: 'rgba(0, 0, 0, 0.8)', color: '#ffffff', borderRadius: '4px',
//             fontSize: '13px', zIndex: '10000000',
//             pointerEvents: 'none', transition: 'opacity 0.3s ease, transform 0.3s ease',
//             opacity: '0', transform: 'translateY(10px)',
            
//             // === 抗锯齿与字体高级优化 ===
//             fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Hiragino Kaku Gothic ProN", "Meiryo", "Microsoft YaHei", sans-serif',
//             webkitFontSmoothing: 'antialiased',
//             mozOsxFontSmoothing: 'grayscale',
//             textRendering: 'optimizeLegibility'
//         });
//         document.body.appendChild(logContainer);
//     }

//     clearTimeout(logTimer);
//     logContainer.innerText = message;
//     logContainer.style.borderLeft = isHighlight ? '4px solid #007acc' : '4px solid #888888';
    
//     logContainer.style.display = 'block';
//     logContainer.offsetHeight; 
//     logContainer.style.opacity = '1';
//     logContainer.style.transform = 'translateY(0)';

//     logTimer = setTimeout(() => {
//         logContainer.style.opacity = '0';
//         logContainer.style.transform = 'translateY(10px)';
//         logTimer = setTimeout(() => {
//             if (logContainer) logContainer.style.display = 'none';
//         }, 300);
//     }, 2000);
// }


// // === 3. Keyboard Event Listeners (Ctrl Toggle) / 键盘事件监听 ===
// window.addEventListener('keydown', (e) => {
//     if (!pluginEnabled) return; // Guard clause / 如果插件关闭则不响应
//     if (e.key === 'Control' && currentMode !== 'word') {
//         currentMode = 'word';
//         showNotification("已切换至：单字识别模式 (按住 Ctrl)", true);
//     }
// });

// window.addEventListener('keyup', (e) => {
//     if (!pluginEnabled) return; // Guard clause
//     if (e.key === 'Control') {
//         currentMode = 'paragraph';
//         showNotification("已切换至：段落识别模式", false);
//     }
// });


// // === 4. Text Extraction Logic / 文本提取逻辑 ===
// function getTextUnderMouse(e) {
//     if (currentMode === 'paragraph') {
//         return e.target ? e.target.innerText.trim() : '';
//     } else if (currentMode === 'word') {
//         if (!document.caretRangeFromPoint) return '';
        
//         const range = document.caretRangeFromPoint(e.clientX, e.clientY);
//         if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return '';
        
//         const textNode = range.startContainer;
//         const offset = range.startOffset;
//         const text = textNode.textContent;
        
//         const validCharRegex = /[a-zA-Z0-9'\u4e00-\u9fa5]/;
        
//         let start = offset;
//         while (start > 0 && validCharRegex.test(text[start - 1])) {
//             start--;
//         }
        
//         let end = offset;
//         while (end < text.length && validCharRegex.test(text[end])) {
//             end++;
//         }
        
//         return text.substring(start, end).trim();
//     }
//     return '';
// }


// // === 5. Background Translation Bridge / 对接后台翻译通信 ===
// async function translateText(text) {
//     return new Promise((resolve) => {
//         chrome.runtime.sendMessage({ action: "translate", text: text }, (response) => {
//             if (response && response.success) {
//                 resolve(response.text);
//             } else {
//                 resolve(`[错误]: 无法获取翻译 (${response ? response.error : '网络异常'})`);
//             }
//         });
//     });
// }


// // === 6. Tooltip UI Logic / 智能边界自适应浮窗 ===
// function createTooltip() {
//     tooltip = document.createElement('div');
//     tooltip.id = 'hoverTranslatorTooltip';
//     Object.assign(tooltip.style, {
//         position: 'fixed', padding: '10px 14px', background: 'rgba(30, 30, 30, 0.95)',
//         color: '#ffffff', borderRadius: '6px', fontSize: '14px', lineHeight: '1.5',
//         zIndex: '9999999', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', maxWidth: '350px',
//         wordWrap: 'break-word', display: 'none', pointerEvents: 'none', 
        
//         // === 抗锯齿与字体高级优化 ===
//         // 显式指定一套在 Windows、Mac、iOS、Android 以及日韩系统下都能完美反走样的现代字体族
//         fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Hiragino Kaku Gothic ProN", "Meiryo", "Microsoft YaHei", sans-serif',
//         webkitFontSmoothing: 'antialiased',    // 强制 WebKit/Blink 内核（Chrome/Edge）启用抗锯齿平滑
//         mozOsxFontSmoothing: 'grayscale',      // 针对 macOS Firefox 的平滑优化
//         textRendering: 'optimizeLegibility'    // 告诉渲染引擎优先保证字体的文本可读性和平滑度
//     });
//     document.body.appendChild(tooltip);
// }

// function showTooltip(x, y, text) {
//     if (!tooltip) createTooltip();
    
//     tooltip.innerText = text;
//     tooltip.style.display = 'block';
//     tooltip.style.opacity = '0'; 

//     const windowWidth = window.innerWidth;
//     const windowHeight = window.innerHeight;
//     const tooltipWidth = tooltip.offsetWidth;
//     const tooltipHeight = tooltip.offsetHeight;
//     const offset = 15; 

//     let finalX = x + offset;
//     let finalY = y + offset;

//     if (finalX + tooltipWidth > windowWidth) finalX = x - tooltipWidth - offset;
//     if (finalY + tooltipHeight > windowHeight) finalY = y - tooltipHeight - offset;
//     if (finalX < 0) finalX = 10; 
//     if (finalY < 0) finalY = 10;

//     tooltip.style.left = `${finalX}px`;
//     tooltip.style.top = `${finalY}px`;
//     tooltip.style.opacity = '1';
// }

// function hideTooltip() {
//     if (tooltip) {
//         tooltip.style.opacity = '0';
//         tooltip.style.display = 'none';
//     }
// }


// // === 7. Mouse Interaction / 鼠标交互监听 ===
// document.addEventListener('mousemove', (e) => {
//     // Top Guard Clause: If plugin is turned off, do absolutely nothing
//     // 最高优先级守卫：如果插件总开关关闭，不做任何计算直接返回
//     if (!pluginEnabled) return; 

//     currentMouseX = e.clientX;
//     currentMouseY = e.clientY;

//     clearTimeout(hoverTimer);
//     hideTooltip();

//     const target = e.target;
    
//     if (
//         target && 
//         target.innerText && 
//         target.innerText.trim().length > 0 && 
//         target !== logContainer && 
//         target !== tooltip
//     ) {
//         hoverTimer = setTimeout(async () => {
//             const textToTranslate = getTextUnderMouse(e);
            
//             if (textToTranslate && textToTranslate.length > 0) {
//                 showTooltip(currentMouseX, currentMouseY, "正在翻译...");
//                 const translatedResult = await translateText(textToTranslate);
//                 showTooltip(currentMouseX, currentMouseY, translatedResult);
//             }
//         }, 500); 
//     }
// });

// document.addEventListener('mouseleave', () => {
//     clearTimeout(hoverTimer);
//     hideTooltip();
// });

// content.js

// === 1. State Management / 状态管理 ===
let pluginEnabled = true;      // Master switch: Enabled by default / 总开关：默认开启
let currentMode = 'paragraph'; // Active mode: 'paragraph' or 'word'
let hoverTimer = null;         
let tooltip = null;            
let currentMouseX = 0;         
let currentMouseY = 0;         

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
            hideTooltip();
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
        zIndex: '9999999', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', maxWidth: '350px',
        wordWrap: 'break-word', display: 'none', pointerEvents: 'none', 
        
        // === 抗锯齿与字体高级优化 ===
        // 显式指定一套在 Windows、Mac、iOS、Android 以及日韩系统下都能完美反走样的现代字体族
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Hiragino Kaku Gothic ProN", "Meiryo", "Microsoft YaHei", sans-serif',
        webkitFontSmoothing: 'antialiased',    // 强制 WebKit/Blink 内核（Chrome/Edge）启用抗锯齿平滑
        mozOsxFontSmoothing: 'grayscale',      // 针对 macOS Firefox 的平滑优化
        textRendering: 'optimizeLegibility'    // 告诉渲染引擎优先保证字体的文本可读性和平滑度
    });
    document.body.appendChild(tooltip);
}

function showTooltip(x, y, text) {
    if (!tooltip) createTooltip();
    
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

    if (finalX + tooltipWidth > windowWidth) finalX = x - tooltipWidth - offset;
    if (finalY + tooltipHeight > windowHeight) finalY = y - tooltipHeight - offset;
    if (finalX < 0) finalX = 10; 
    if (finalY < 0) finalY = 10;

    tooltip.style.left = `${finalX}px`;
    tooltip.style.top = `${finalY}px`;
    tooltip.style.opacity = '1';
}

function hideTooltip() {
    if (tooltip) {
        tooltip.style.opacity = '0';
        tooltip.style.display = 'none';
    }
}


// === 7. Mouse Interaction / 鼠标交互监听 ===
document.addEventListener('mousemove', (e) => {
    // Top Guard Clause: If plugin is turned off, do absolutely nothing
    // 最高优先级守卫：如果插件总开关关闭，不做任何计算直接返回
    if (!pluginEnabled) return; 

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
                showTooltip(currentMouseX, currentMouseY, "正在翻译...");
                const translatedResult = await translateText(textToTranslate);
                showTooltip(currentMouseX, currentMouseY, translatedResult);
            }
        }, 500); 
    }
});

document.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimer);
    hideTooltip();
});