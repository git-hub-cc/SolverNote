const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const getNotesDir = () => {
    const noteDir = path.join(process.cwd(), 'notes');
    if (!fs.existsSync(noteDir)) {
        fs.mkdirSync(noteDir, { recursive: true });
    }
    return noteDir;
};

/**
 * 内部辅助：读取所有笔记
 * [修改点]: 增加 title 字段的解析和返回
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
                const { data, content } = matter(rawContent);

                notes.push({
                    id: file,
                    content: content,
                    rawContent: rawContent,
                    timestamp: data.date ? new Date(data.date).toISOString() : stats.mtime.toISOString(),
                    tags: data.tags || [],
                    title: data.title || '', // [新增] 提取 title
                    hasWeakHint: false,
                    hintCount: 0
                });
            } catch (parseError) {
                console.warn(`Failed to parse frontmatter for ${file}`, parseError);
                notes.push({
                    id: file,
                    content: rawContent,
                    timestamp: stats.mtime.toISOString(),
                    tags: [],
                    title: '' // [新增] 降级处理也返回 title
                });
            }
        }
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
 * [修改点]: 自动从内容中提取标题作为 Frontmatter 的 title
 */
async function handleSaveNote(event, noteData) {
    try {
        const notesDir = getNotesDir();
        const filename = noteData.id || `note-${Date.now()}.md`;
        const filePath = path.join(notesDir, filename);

        // [新增] 自动提取标题逻辑
        let title = '';
        const firstLine = noteData.content.trim().split('\n')[0];
        // 如果第一行是 Markdown 的 H1 标题 (e.g., "# My Title")
        if (firstLine && firstLine.startsWith('# ')) {
            title = firstLine.substring(2).trim();
        }

        const metadata = {
            date: noteData.timestamp || new Date().toISOString(),
            tags: noteData.tags || [],
            title: title // 将提取的标题存入元数据
        };

        const fileContent = matter.stringify(noteData.content, metadata);
        await fs.promises.writeFile(filePath, fileContent, 'utf-8');
        return { success: true, id: filename };
    } catch (error) {
        console.error('Save failed:', error);
        return { success: false, error: error.message };
    }
}

async function handleDeleteNote(event, id) {
    try {
        if (!id) throw new Error('Note ID is required');
        const notesDir = getNotesDir();
        const filePath = path.join(notesDir, id);
        await fs.promises.access(filePath);
        await fs.promises.unlink(filePath);
        return { success: true };
    } catch (error) {
        console.error('Delete failed:', error);
        return { success: false, error: error.message };
    }
}

async function handleSearchNotes(event, query) {
    const allNotes = await _getAllNotes();
    if (!query || typeof query !== 'string' || query.trim() === '') {
        return allNotes;
    }
    const lowerQuery = query.toLowerCase().trim();

    return allNotes.filter(note => {
        // [修改] 增加对 title 的搜索
        const inTitle = note.title && note.title.toLowerCase().includes(lowerQuery);
        const inId = note.id.toLowerCase().includes(lowerQuery);
        const inContent = note.content.toLowerCase().includes(lowerQuery);
        const inTags = note.tags && note.tags.some(tag => tag.toLowerCase().includes(lowerQuery));

        return inTitle || inId || inContent || inTags;
    });
}

module.exports = {
    handleLoadNotes,
    handleSaveNote,
    handleSearchNotes,
    handleDeleteNote
};