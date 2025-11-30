import MarkdownIt from 'markdown-it';
// [新增] 引入 highlight.js 库
import hljs from 'highlight.js';

// 初始化 Markdown-it 实例
const md = new MarkdownIt({
    html: false,        // 禁用 HTML 标签以防 XSS (基础安全)
    breaks: true,       // 将换行符转换为 <br>
    linkify: true,      // 自动识别 URL
    typographer: true,   // 优化排版

    // [核心修改] 添加语法高亮配置
    highlight: (str, lang) => {
        // 参数 str: 要高亮的原始代码字符串
        // 参数 lang: 用户指定的语言 (例如 'js', 'python')

        // 鲁棒性检查 1: 检查语言是否存在且被 hljs 支持
        if (lang && hljs.getLanguage(lang)) {
            try {
                // 使用 hljs 进行高亮处理
                // ignoreIllegals: true 可以在代码包含轻微语法错误时避免 hljs 抛出异常，增强稳定性
                const highlightedCode = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;

                // 返回符合 hljs 主题要求的 HTML 结构
                // <pre class="hljs">... 包裹整个代码块，用于应用背景色等样式
                return `<pre class="hljs"><code>${highlightedCode}</code></pre>`;
            } catch (__) {
                // 如果高亮过程中出现未知错误，则执行下面的回退逻辑
            }
        }

        // 鲁棒性检查 2 (回退逻辑):
        // 如果 lang 未提供，或 hljs 不支持该语言，或高亮失败
        // 我们只对代码内容进行 HTML 转义，然后用 <pre><code> 包裹
        // 这样可以安全地显示原始代码，而不会破坏页面结构
        const escapedCode = md.utils.escapeHtml(str);
        return `<pre class="hljs"><code>${escapedCode}</code></pre>`;
    }
});


// (原有逻辑保持不变)
// 自定义渲染规则 (可选)
// 例如：处理 [[WikiLinks]] (暂时简单的视觉处理，未来可加跳转逻辑)
const defaultText = md.renderer.rules.text || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
};

// 简单的 WikiLink 插件逻辑
md.core.ruler.push('wiki_links', (state) => {
    state.tokens.forEach(token => {
        if (token.type === 'inline' && token.children) {
            token.children.forEach(child => {
                if (child.type === 'text') {
                    // ... (原有逻辑)
                }
            });
        }
    });
});

/**
 * 渲染 Markdown 文本
 * @param {string} text Markdown 源码
 * @returns {string} HTML 字符串
 */
export function renderMarkdown(text) {
    if (!text) return '';

    // (原有逻辑保持不变)
    const preProcessed = text.replace(
        /\[\[(.*?)\]\]/g,
        '<span class="wiki-link">[[ $1 ]]</span>'
    );

    // 使用配置好高亮功能的 markdown-it 实例进行渲染
    return md.render(preProcessed);
}