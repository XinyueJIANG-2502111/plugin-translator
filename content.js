// content.js

// === 1. State Management / 状态管理 ===
let currentMode = 'paragraph'; // Active mode: 'paragraph' or 'word' / 当前激活模式：'paragraph' (段落) 或 'word' (单字)
let hoverTimer = null;         // Timer for debounce / 用于鼠标悬停防抖的定时器
let tooltip = null;            // Tooltip DOM element / 翻译结果浮窗 DOM 元素
let currentMouseX = 0;         // Latest mouse X coordinate / 最新鼠标 X 坐标
let currentMouseY = 0;         // Latest mouse Y coordinate / 最新鼠标 Y 坐标

// New State for Log Notification / 用于左下角通知日志的状态管理
let logContainer = null;
let logTimer = null;


// === 2. Smooth Notification Log Logic / 左下角日志提示逻辑 ===
function showNotification(message, isHighlight = false) {
    // Purpose: Create or update a fleeting log at the bottom-left corner
    // 目的：在左下角创建或更新一个自适应淡出的提示日志
    if (!logContainer) {
        logContainer = document.createElement('div');
        logContainer.id = 'hoverTranslatorLog';
        Object.assign(logContainer.style, {
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            padding: '8px 14px',
            background: 'rgba(0, 0, 0, 0.8)',
            color: '#ffffff',
            borderRadius: '4px',
            fontSize: '13px',
            zIndex: '10000000',
            fontFamily: 'sans-serif',
            pointerEvents: 'none',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            opacity: '0',
            transform: 'translateY(10px)'
        });
        document.body.appendChild(logContainer);
    }

    // Clear any pending fade-out animations
    // 清除上一次还未执行完的淡出定时器
    clearTimeout(logTimer);

    // Update content and style based on mode
    // 更新提示文字和根据模式调整高亮样式
    logContainer.innerText = message;
    logContainer.style.borderLeft = isHighlight ? '4px solid #007acc' : '4px solid #888888';
    
    // Bring it to view with transition
    // 通过过渡动画显示出来
    logContainer.style.display = 'block';
    // Flush UI changes / 强制浏览器刷新渲染队列
    logContainer.offsetHeight; 
    logContainer.style.opacity = '1';
    logContainer.style.transform = 'translateY(0)';

    // Set timer to fade out after 2 seconds
    // 设置 2 秒后自动启动淡出动画
    logTimer = setTimeout(() => {
        logContainer.style.opacity = '0';
        logContainer.style.transform = 'translateY(10px)';
        // Hide from layout entirely after opacity transition ends
        // 在淡出动画结束后完全隐藏元素，不占用布局
        logTimer = setTimeout(() => {
            if (logContainer) logContainer.style.display = 'none';
        }, 300);
    }, 2000);
}


// === 3. Keyboard Event Listeners (Ctrl Toggle) / 键盘事件监听（Ctrl 键切换） ===
// Purpose: Toggle modes and call showNotification to provide temporary visual feedback
// 目的：在按下和松开 Ctrl 键时切换模式，并调用通知函数进行短暂的视觉反馈
window.addEventListener('keydown', (e) => {
    if (e.key === 'Control' && currentMode !== 'word') {
        currentMode = 'word';
        showNotification("已切换至：单字识别模式 (按住 Ctrl)", true);
    }
});

window.addEventListener('keyup', (e) => {
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


// === 6. Tooltip UI Logic with Adaptive Boundary Detection / 智能边界自适应浮窗 ===
function createTooltip() {
    tooltip = document.createElement('div');
    tooltip.id = 'hoverTranslatorTooltip';
    Object.assign(tooltip.style, {
        position: 'fixed',
        padding: '10px 14px',
        background: 'rgba(30, 30, 30, 0.95)',
        color: '#ffffff',
        borderRadius: '6px',
        fontSize: '14px',
        lineHeight: '1.5',
        zIndex: '9999999',
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        maxWidth: '350px',
        wordWrap: 'break-word',
        display: 'none',
        pointerEvents: 'none', 
        fontFamily: 'sans-serif',
        transition: 'opacity 0.15s ease'
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

    // Boundary flip algorithms / 边界碰撞翻转算法
    if (finalX + tooltipWidth > windowWidth) {
        finalX = x - tooltipWidth - offset;
    }
    if (finalY + tooltipHeight > windowHeight) {
        finalY = y - tooltipHeight - offset;
    }

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
    currentMouseX = e.clientX;
    currentMouseY = e.clientY;

    clearTimeout(hoverTimer);
    hideTooltip();

    const target = e.target;
    
    // Ignore plugin log container as well during target validation
    // 验证目标标签时，同时也排除新加入的日志窗口本身
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

// // content.js

// // === 1. State Management / 状态管理 ===
// let currentMode = 'paragraph'; // Active mode: 'paragraph' or 'word' / 当前激活模式：'paragraph' (段落) 或 'word' (单字)
// let hoverTimer = null;         // Timer for debounce / 用于防抖的定时器
// let tooltip = null;            // Tooltip DOM element / 浮窗 DOM 元素
// let currentMouseX = 0;         // Latest mouse X coordinate / 最新鼠标 X 坐标
// let currentMouseY = 0;         // Latest mouse Y coordinate / 最新鼠标 Y 坐标

// // Create a visual indicator in the top-right corner of the webpage
// // 在网页右上角创建一个视觉指示器，展示当前模式
// const modeIndicator = document.createElement('div');
// modeIndicator.id = 'hoverTranslatorIndicator';
// modeIndicator.innerText = "当前模式: 段落模式 (松开 Ctrl)";
// // Style the indicator / 为指示器设置样式
// Object.assign(modeIndicator.style, {
//     position: 'fixed',
//     top: '20px',
//     right: '20px',
//     padding: '10px 20px',
//     background: '#ffffff',
//     color: '#444444',
//     border: '1px solid #cccccc',
//     borderRadius: '4px',
//     boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
//     fontWeight: 'bold',
//     zIndex: '999999',
//     fontFamily: 'sans-serif',
//     transition: 'all 0.2s ease'
// });
// document.body.appendChild(modeIndicator);


// // === 2. Keyboard Event Listeners (Ctrl Toggle) / 键盘事件监听（Ctrl 键切换） ===
// // Purpose: Toggle mode between 'word' and 'paragraph' based on Ctrl key status
// // 目的：根据 Ctrl 键的状态在“单字”与“段落”模式间实时切换
// window.addEventListener('keydown', (e) => {
//     if (e.key === 'Control' && currentMode !== 'word') {
//         currentMode = 'word';
//         modeIndicator.innerText = "当前模式: 单字模式 (按住 Ctrl)";
//         modeIndicator.style.color = "#007acc";
//         modeIndicator.style.borderColor = "#007acc";
//         modeIndicator.style.background = "#f0f7ff";
//     }
// });

// window.addEventListener('keyup', (e) => {
//     if (e.key === 'Control') {
//         currentMode = 'paragraph';
//         modeIndicator.innerText = "当前模式: 段落模式 (松开 Ctrl)";
//         modeIndicator.style.color = "#444444";
//         modeIndicator.style.borderColor = "#cccccc";
//         modeIndicator.style.background = "#ffffff";
//     }
// });


// // === 3. Text Extraction Logic / 文本提取逻辑 ===
// function getTextUnderMouse(e) {
//     // Purpose: Extract English/Chinese text based on the active selection mode
//     // 目的：根据当前激活的模式提取对应的英文字词或整段中文
//     if (currentMode === 'paragraph') {
//         // --- Paragraph Mode ---
//         // Get the full plain text of the hovered HTML element
//         // --- 段落模式 ---
//         // 直接获取当前鼠标悬停 HTML 标签的完整纯文本
//         return e.target ? e.target.innerText.trim() : '';
//     } else if (currentMode === 'word') {
//         // --- Word Mode ---
//         // Use browser caret API to locate the exact character under the cursor
//         // --- 单字模式 ---
//         // 使用浏览器的光标定位 API 精准识别鼠标指针下的字符
//         if (!document.caretRangeFromPoint) return '';
        
//         const range = document.caretRangeFromPoint(e.clientX, e.clientY);
//         if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return '';
        
//         const textNode = range.startContainer;
//         const offset = range.startOffset;
//         const text = textNode.textContent;
        
//         // Regex matching English letters, numbers, and Chinese characters
//         // 正则表达式：匹配英文字母、数字以及中文字符
//         const validCharRegex = /[a-zA-Z0-9'\u4e00-\u9fa5]/;
        
//         // Expand left to find the beginning of the word/phrase
//         // 向左遍历扩展，寻找词语的起始边界
//         let start = offset;
//         while (start > 0 && validCharRegex.test(text[start - 1])) {
//             start--;
//         }
        
//         // Expand right to find the end of the word/phrase
//         // 向右遍历扩展，寻找词语的结束边界
//         let end = offset;
//         while (end < text.length && validCharRegex.test(text[end])) {
//             end++;
//         }
        
//         return text.substring(start, end).trim();
//     }
//     return '';
// }


// // === 4. Background Translation Bridge / 对接后台翻译通信 ===
// async function translateText(text) {
//     // Purpose: Send extracted text to background.js to bypass CORS and get real translation
//     // 目的：将提取的文本发送给 background.js 从而绕过跨域限制并获取真实的翻译结果
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


// // === 5. Tooltip UI Logic / 浮窗 UI 逻辑 ===
// function createTooltip() {
//     tooltip = document.createElement('div');
//     tooltip.id = 'hoverTranslatorTooltip';
//     // Professional dark-themed style setup / 专业的深色系悬浮窗样式配置
//     Object.assign(tooltip.style, {
//         position: 'fixed',
//         padding: '10px 14px',
//         background: 'rgba(30, 30, 30, 0.95)',
//         color: '#ffffff',
//         borderRadius: '6px',
//         fontSize: '14px',
//         lineHeight: '1.5',
//         zIndex: '9999999',
//         boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
//         maxWidth: '350px',
//         wordWrap: 'break-word',
//         display: 'none',
//         pointerEvents: 'none', // Critical: Prevents mousemove flickering / 关键：防止鼠标移入浮窗自身时发生闪烁
//         fontFamily: 'sans-serif',
//         transition: 'opacity 0.15s ease'
//     });
//     document.body.appendChild(tooltip);
// }

// // content.js 中的 showTooltip 函数升级版

// function showTooltip(x, y, text) {
//     if (!tooltip) createTooltip();
    
//     // 1. 先将内容写入，并暂时设置为不可见，让浏览器计算出它真实的尺寸
//     tooltip.innerText = text;
//     tooltip.style.display = 'block';
//     tooltip.style.opacity = '0'; // 暂时隐藏，防止计算位置时在屏幕上闪烁

//     // 2. 获取当前窗口（视口）的有效宽高
//     const windowWidth = window.innerWidth;
//     const windowHeight = window.innerHeight;

//     // 3. 获取浮窗自身的实际宽高
//     const tooltipWidth = tooltip.offsetWidth;
//     const tooltipHeight = tooltip.offsetHeight;

//     // 定义一个距离鼠标光标的基础安全偏移量
//     const offset = 15; 

//     // 4. 初始化浮窗的最终坐标（默认显示在鼠标右下方）
//     let finalX = x + offset;
//     let finalY = y + offset;

//     // === 5. 右边界碰撞检测 (Right Boundary Collision) ===
//     // Purpose: If the tooltip exceeds the right edge, flip it to the left side of the cursor
//     // 目的：如果浮窗超出了窗口右边界，就将其翻转到鼠标光标的左侧
//     if (finalX + tooltipWidth > windowWidth) {
//         finalX = x - tooltipWidth - offset;
//     }

//     // === 6. 下边界碰撞检测 (Bottom Boundary Collision) ===
//     // Purpose: If the tooltip exceeds the bottom edge, flip it above the cursor
//     // 目的：如果浮窗超出了窗口下边界，就将其翻转到鼠标光标的上方
//     if (finalY + tooltipHeight > windowHeight) {
//         finalY = y - tooltipHeight - offset;
//     }

//     // === 7. 极端边界防死锁安全兜底（防止窗口太小，翻转后依然越出左边界或上边界） ===
//     if (finalX < 0) finalX = 10; // 强制留出 10px 安全边距
//     if (finalY < 0) finalY = 10;

//     // 8. 正式应用计算好的坐标并展现浮窗
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


// // === 6. Mouse Interaction / 鼠标交互监听 ===
// document.addEventListener('mousemove', (e) => {
//     currentMouseX = e.clientX;
//     currentMouseY = e.clientY;

//     // Reset timer and hide tooltip upon every movement (Debounce mechanism)
//     // 鼠标一移动就立刻清除旧定时器并隐藏浮窗（防抖核心控制）
//     clearTimeout(hoverTimer);
//     hideTooltip();

//     const target = e.target;
    
//     // Validate if the target element contains readable text, ignoring plugin UI itself
//     // 验证目标标签是否包含有效可读文本，同时排除插件自身的 UI 干扰
//     if (
//         target && 
//         target.innerText && 
//         target.innerText.trim().length > 0 && 
//         target !== modeIndicator && 
//         target !== tooltip
//     ) {
//         // Set a 500ms delay to trigger the translation mechanism
//         // 开启 500 毫秒延时器，当鼠标静止 500ms 后触发翻译机制
//         hoverTimer = setTimeout(async () => {
//             const textToTranslate = getTextUnderMouse(e);
            
//             if (textToTranslate && textToTranslate.length > 0) {
//                 // Step 1: Immediately display a loading feedback
//                 // 步骤 1：立刻显示“正在翻译...”的加载提示
//                 showTooltip(currentMouseX, currentMouseY, "正在翻译...");

//                 // Step 2: Request translation from background script
//                 // 步骤 2：向后台脚本请求翻译
//                 const translatedResult = await translateText(textToTranslate);
                
//                 // Step 3: Render the actual translated content
//                 // 步骤 3：更新并展现真实的翻译结果
//                 showTooltip(currentMouseX, currentMouseY, translatedResult);
//             }
//         }, 500); 
//     }
// });

// // Hide tooltip immediately when the mouse moves out of the browser window
// // 当鼠标移出浏览器视口区域时，立刻清除定时器并收起浮窗
// document.addEventListener('mouseleave', () => {
//     clearTimeout(hoverTimer);
//     hideTooltip();
// });