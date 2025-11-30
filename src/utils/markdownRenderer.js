// 需要在 package.json 中确认已安装 markdown-it
import MarkdownIt from 'markdown-it';

// 初始化实例，配置常用选项
const md = new MarkdownIt({
    html: false,        // 禁用 HTML 标签以防 XSS (基础安全)
    breaks: true,       // 将换行符转换为 <br>
    linkify: true,      // 自动识别 URL
    typographer: true   // 优化排版
});

// 自定义渲染规则 (可选)
// 例如：处理 [[WikiLinks]] (暂时简单的视觉处理，未来可加跳转逻辑)
const defaultText = md.renderer.rules.text || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
};

// 简单的 WikiLink 插件逻辑 (后期建议写成独立插件)
md.core.ruler.push('wiki_links', (state) => {
    state.tokens.forEach(token => {
        if (token.type === 'inline' && token.children) {
            token.children.forEach(child => {
                if (child.type === 'text') {
                    // 替换 [[Link]] 文本
                    // 注意：这里仅做简单的内联替换，未拆分 token，对于复杂的 md 解析可能不够完美
                    // 但对于简单的笔记展示已经足够
                    // 实际生产建议使用 markdown-it-wikilinks 插件
                    // 这里不做复杂的正则替换以免破坏 token 结构，暂时交给 CSS 处理
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

    // 1. 处理自定义的非标准语法 (如 [[Link]])
    // 为了不破坏 markdown-it 的解析，我们在渲染后的 HTML 上做简单的后处理
    // 或者在输入前处理。这里选择输入前预处理 [[Link]] 为标准链接或特定 span
    const preProcessed = text.replace(
        /\[\[(.*?)\]\]/g,
        '<span class="wiki-link">[[ $1 ]]</span>'
    );

    // 2. 使用 markdown-it 渲染
    return md.render(preProcessed);
}