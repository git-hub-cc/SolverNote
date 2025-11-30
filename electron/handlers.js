const fs = require('fs');
const path = require('path');
// 引入 gray-matter 用于解析 Markdown 的元数据 (YAML Frontmatter)
const matter = require('gray-matter');

const getNotesDir = () => {
    // 生产环境建议将路径改为 app.getPath('userData')，此处保持当前目录方便调试
    const noteDir = path.join(process.cwd(), 'notes');
    if (!fs.existsSync(noteDir)) {
        fs.mkdirSync(noteDir, { recursive: true });
    }
    return noteDir;
};

/**
 * 内部辅助：读取所有笔记
 * 修改点：增加 Frontmatter 解析，分离元数据和正文
 */
async function _getAllNotes() {
    try {
        const notesDir = getNotesDir();
        const files = await fs.promises.readdir(notesDir);
        const mdFiles = files.filter(file => file.endsWith('.md'));

        const notes = [];
        for (const file of mdFiles) {
            const filePath = path.join(notesDir, file);
            const stats = await fs.promises.stat(filePath);
            const rawContent = await fs.promises.readFile(filePath, 'utf-8');

            try {
                // 解析 Frontmatter
                // data: 元数据对象 (如 tags, title)
                // content: 去除元数据后的正文
                const { data, content } = matter(rawContent);

                notes.push({
                    id: file, // 文件名作为唯一 ID
                    content: content, // 仅展示正文部分
                    rawContent: rawContent, // 保留原始数据以便某些情况使用
                    // 优先使用元数据中的日期，否则使用文件修改时间
                    timestamp: data.date ? new Date(data.date).toISOString() : stats.mtime.toISOString(),
                    tags: data.tags || [], // 从元数据获取标签
                    hasWeakHint: false,
                    hintCount: 0
                });
            } catch (parseError) {
                console.warn(`Failed to parse frontmatter for ${file}`, parseError);
                // 降级处理：如果解析失败，直接返回原始内容
                notes.push({
                    id: file,
                    content: rawContent,
                    timestamp: stats.mtime.toISOString(),
                    tags: []
                });
            }
        }
        // 按时间倒序
        return notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
        console.error('Error reading notes:', error);
        return [];
    }
}

async function handleLoadNotes() {
    return await _getAllNotes();
}

/**
 * 保存或更新笔记
 * 修改点：支持更新模式（传入ID），并自动封装 Frontmatter
 */
async function handleSaveNote(event, noteData) {
    try {
        const notesDir = getNotesDir();

        // 1. 确定文件名 (ID)
        // 如果传入了 id，则为更新模式；否则生成新文件名
        const filename = noteData.id || `note-${Date.now()}.md`;
        const filePath = path.join(notesDir, filename);

        // 2. 准备元数据 (Frontmatter)
        // 如果是更新，最好先读取旧文件的元数据，这里简化为重新生成或合并
        const metadata = {
            date: noteData.timestamp || new Date().toISOString(),
            tags: noteData.tags || []
            // 未来可以在这里扩展 title, category 等
        };

        // 3. 使用 gray-matter 组合 content 和 metadata
        const fileContent = matter.stringify(noteData.content, metadata);

        // 4. 写入文件
        await fs.promises.writeFile(filePath, fileContent, 'utf-8');

        return { success: true, id: filename };
    } catch (error) {
        console.error('Save failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 删除笔记 (新增功能)
 */
async function handleDeleteNote(event, id) {
    try {
        if (!id) throw new Error('Note ID is required');

        const notesDir = getNotesDir();
        const filePath = path.join(notesDir, id);

        // 检查文件是否存在
        await fs.promises.access(filePath);

        // 执行删除
        await fs.promises.unlink(filePath);

        return { success: true };
    } catch (error) {
        console.error('Delete failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 搜索笔记 (保持基础实现，未来接入向量库)
 * --- 修复点 ---
 */
async function handleSearchNotes(event, query) {
    const allNotes = await _getAllNotes();

    if (!query || typeof query !== 'string' || query.trim() === '') {
        return allNotes;
    }

    const lowerQuery = query.toLowerCase().trim();

    return allNotes.filter(note => {
        // 搜索范围：ID (文件名)
        const inTitle = note.id.toLowerCase().includes(lowerQuery);
        // 搜索范围：内容
        const inContent = note.content.toLowerCase().includes(lowerQuery);
        // [新增] 搜索范围：标签
        const inTags = note.tags && note.tags.some(tag => tag.toLowerCase().includes(lowerQuery));

        // [修改] 将 inTags 加入判断条件
        return inTitle || inContent || inTags;
    });
}

module.exports = {
    handleLoadNotes,
    handleSaveNote,
    handleSearchNotes,
    handleDeleteNote // 导出新接口
};