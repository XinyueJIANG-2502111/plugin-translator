// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "translate") {
        const text = encodeURIComponent(request.text);
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${text}`;

        fetch(url)
            .then(response => {
                if (!response.ok) {
                    // Purpose: Handle HTTP errors safely without blocking the response channel
                    // 目的：安全地处理 HTTP 错误，避免阻塞响应通道
                    sendResponse({ success: false, error: `HTTP ${response.status}` });
                    return null;
                }
                return response.text();
            })
            .then(textData => {
                // If previous step returned null due to HTTP error, skip JSON parsing
                // 如果上一步因为 HTTP 错误返回了 null，则跳过 JSON 解析
                if (!textData) return; 

                try {
                    const data = JSON.parse(textData);
                    if (data && data[0]) {
                        let translatedText = data[0].map(item => item[0]).join('');
                        sendResponse({ success: true, text: translatedText });
                    } else {
                        sendResponse({ success: false, error: "数据格式不匹配" });
                    }
                } catch (e) {
                    sendResponse({ success: false, error: "触发人机验证，请稍后再试" });
                }
            })
            .catch(error => {
                // Critical Fix: Ensure sendResponse is ALWAYS called even if the network fails completely
                // 关键修复：确保即使网络完全失败，也必定调用 sendResponse 通知前端，防止卡死
                sendResponse({ success: false, error: error.message || "网络请求失败" });
            });

        return true; // Keep the message channel open for async service worker / 保持异步通信通道开启
    }
});