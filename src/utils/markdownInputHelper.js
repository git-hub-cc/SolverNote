/**
 * Markdown 输入框辅助工具
 * 用于处理 Textarea 的光标操作和文本插入
 */

/**
 * 在 Textarea 光标处插入或包裹 Markdown 语法
 *
 * @param {HTMLTextAreaElement} textarea - 目标输入框元素
 * @param {string} prefix - 前缀 (如 "**")
 * @param {string} suffix - 后缀 (如 "**", 列表项时为空字符串)
 * @param {boolean} multiline - 是否针对多行处理 (如引用 > 或列表 -)
 * @returns {string} - 处理后的新文本内容
 */
export function insertSyntax(textarea, prefix, suffix = '', multiline = false) {
    if (!textarea) return '';

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    const selectedText = value.substring(start, end);
    let replacement = '';

    // 计算插入后的光标偏移量
    let cursorOffset = 0;

    if (multiline) {
        // 多行模式：通常用于列表、引用
        // 将选中的每一行都加上前缀
        const lines = selectedText.split('\n');
        replacement = lines.map(line => `${prefix}${line}${suffix}`).join('\n');

        // 如果没有选中文本，且是单行，只需插入前缀
        if (selectedText.length === 0) {
            replacement = prefix;
        }
    } else {
        // 单行模式：通常用于加粗、斜体、行内代码
        replacement = `${prefix}${selectedText}${suffix}`;
    }

    // 拼接新文本
    const newValue = value.substring(0, start) + replacement + value.substring(end);

    // 计算光标新位置
    // 1. 如果有选中文本，光标保持选中整个新块
    // 2. 如果没有选中文本，光标放在前缀和后缀中间 (如 **|**)
    if (selectedText.length > 0) {
        cursorOffset = start + replacement.length;
    } else {
        cursorOffset = start + prefix.length;
    }

    // 必须在 DOM 更新后（或由调用者）恢复光标，这里返回必要数据
    return {
        text: newValue,
        newCursorStart: selectedText.length > 0 ? start : cursorOffset,
        newCursorEnd: cursorOffset
    };
}

/**
 * 自动调整 Textarea 高度
 * 保持输入框随内容增高，但不超过最大高度
 *
 * @param {HTMLTextAreaElement} element
 * @param {string} minHeight - 最小高度 CSS 值 (如 '120px')
 */
export function autoResizeTextarea(element, minHeight = '120px') {
    if (!element) return;

    // 重置高度以计算 scrollHeight (处理删除文本变矮的情况)
    element.style.height = minHeight;

    // 计算新高度
    const scrollHeight = element.scrollHeight;
    element.style.height = `${scrollHeight}px`;
}