import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

// 初始化 Markdown-it 实例
const md = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
    typographer: true,

    /**
     * [核心修改] 语法高亮配置已增强，支持自动语言检测
     */
    highlight: (str, lang) => {
        // [日志] 记录每次高亮函数的调用情况
        console.log(`[Markdown Renderer] Highlighting code block. Language specified: '${lang || 'none'}', Code length: ${str.length}`);

        // --- 路径 1: 开发者明确指定了语言，并且 highlight.js 支持该语言 ---
        // 这是最高效、最准确的路径。
        if (lang && hljs.getLanguage(lang)) {
            try {
                const highlightedCode = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
                // [日志] 成功使用指定语言高亮
                console.log(`[Markdown Renderer] Success: Highlighted with specified language: ${lang}`);
                return `<pre class="hljs"><code>${highlightedCode}</code></pre>`;
            } catch (e) {
                // [日志] 记录高亮时发生的未知错误
                console.error(`[Markdown Renderer] Error during highlighting with specified language '${lang}':`, e);
            }
        }

        // --- 路径 2: [新增] 开发者未指定语言，尝试自动检测 ---
        // 这个路径会消耗更多资源，因为 hljs 需要尝试多种语言规则。
        try {
            // 调用自动检测 API
            const result = hljs.highlightAuto(str);
            // [日志] 记录自动检测到的语言
            console.log(`[Markdown Renderer] Success: Auto-detected language as '${result.language}' with relevance ${result.relevance}.`);
            return `<pre class="hljs"><code>${result.value}</code></pre>`;
        } catch (e) {
            // [日志] 自动检测过程中也可能发生错误
            console.error(`[Markdown Renderer] Error during automatic language detection:`, e);
        }

        // --- 路径 3 (回退): 如果以上所有方法都失败 ---
        // [日志] 记录这是最终的回退操作
        console.warn(`[Markdown Renderer] Fallback: Could not highlight code. Rendering as plain text.`);
        const escapedCode = md.utils.escapeHtml(str);
        return `<pre class="hljs"><code>${escapedCode}</code></pre>`;
    }
});


/**
 * 渲染 Markdown 文本
 * @param {string} text - Markdown 源码
 * @returns {string} - 渲染后的 HTML 字符串
 */
export function renderMarkdown(text) {
    if (!text) return '';

    // 自定义处理 [[WikiLinks]]
    const preProcessed = text.replace(
        /\[\[(.*?)\]\]/g,
        '<span class="wiki-link">[[ $1 ]]</span>'
    );

    return md.render(preProcessed);
}