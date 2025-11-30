<template>
  <div class="tags-view">
    <!-- 头部：标题与统计 -->
    <div class="view-header">
      <h2>All Tags</h2>
      <span class="count">{{ tagList.length }} tags found</span>
    </div>

    <!-- 空状态：无标签 -->
    <div v-if="tagList.length === 0" class="empty-state">
      <div class="empty-icon">#</div>
      <p>No tags yet.</p>
      <p class="sub-text">Add tags using the hash button in the editor!</p>
    </div>

    <!-- 网格列表：展示所有标签 -->
    <div v-else class="tags-grid">
      <div
          v-for="tag in tagList"
          :key="tag.name"
          class="tag-card"
          @click="filterByTag(tag.name)"
      >
        <div class="tag-header">
          <span class="tag-symbol">#</span>
          <span class="tag-name">{{ tag.name }}</span>
        </div>
        <div class="tag-footer">
          <span class="tag-count">{{ tag.count }} notes</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNoteStore } from '@/stores/noteStore'

const noteStore = useNoteStore()
const router = useRouter()

// 确保进入页面时 store 中有数据
// 如果是从首页进来通常已有数据，但如果是直接刷新此页则需要拉取
onMounted(() => {
  if (noteStore.notes.length === 0) {
    noteStore.fetchNotes()
  }
})

// 从 Store 获取处理好的标签统计列表
const tagList = computed(() => noteStore.allTags)

/**
 * 点击标签后的行为：
 * 1. 设置全局搜索词
 * 2. 跳转回首页 (StreamTimeline) 进行展示
 */
const filterByTag = (tagName) => {
  // 目前搜索逻辑是简单的文本匹配，所以直接搜索标签名即可
  // 如果后端搜索支持特定语法 (如 tag:name)，这里需要相应修改
  noteStore.setSearchQuery(tagName)
  router.push('/')
}
</script>

<style lang="scss" scoped>
.tags-view {
  padding: 40px 10%; /* 保持与主页类似的边距 */
  height: 100%;
  overflow-y: auto;

  /* 隐藏滚动条但保留功能 */
  &::-webkit-scrollbar {
    width: 6px;
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 3px;
  }
  &:hover::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
  }
}

.view-header {
  margin-bottom: 32px;
  display: flex;
  align-items: baseline;
  gap: 12px;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 16px;

  h2 {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .count {
    color: var(--text-tertiary);
    font-size: 14px;
  }
}

/* 空状态样式 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 80px;
  color: var(--text-tertiary);

  .empty-icon {
    font-size: 48px;
    font-weight: bold;
    color: var(--border-light);
    margin-bottom: 16px;
  }

  p {
    font-size: 16px;
    font-weight: 500;
  }

  .sub-text {
    font-size: 13px;
    margin-top: 4px;
    opacity: 0.8;
  }
}

/* 网格布局 */
.tags-grid {
  display: grid;
  /* 响应式网格：最小宽度 160px，自动填充 */
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.tag-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100px; /* 固定高度，整齐划一 */

  &:hover {
    border-color: var(--color-brand);
    transform: translateY(-2px);
    box-shadow: var(--shadow-card);

    .tag-symbol {
      color: var(--color-brand);
    }
  }
}

.tag-header {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  /* 超长截断 */
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.tag-symbol {
  color: var(--text-tertiary);
  margin-right: 2px;
  transition: color 0.2s;
}

.tag-footer {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  justify-content: flex-end;
}

.tag-count {
  background: var(--bg-hover);
  padding: 2px 6px;
  border-radius: 4px;
}
</style>