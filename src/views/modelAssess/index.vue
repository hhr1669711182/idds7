<!--
  @Description: 相似警情模块（2.5D 指挥大屏）入口页面
 * @FilePath: \ids-gis-web\src\views\modelAssess\index.vue
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useModelAssessStore } from '@/store/useModelAssessStore'
import SimilarAlarmCard from './components/SimilarAlarmCard.vue'
import TiltMapView from './components/TiltMapView.vue'
import { Icon } from '@iconify/vue'

const store = useModelAssessStore()
const { similarCards } = storeToRefs(store)

const onRemove = (id: string) => store.removeSimilarCard(id)
const onMerge = (id: string) => store.mergeToMaster(id)

// 水平滚动逻辑
const topCardsRef = ref<HTMLElement | null>(null)
const showLeftArrow = ref(false)
const showRightArrow = ref(false)

const checkScroll = () => {
  if (!topCardsRef.value) return
  const { scrollLeft, scrollWidth, clientWidth } = topCardsRef.value
  showLeftArrow.value = scrollLeft > 0
  showRightArrow.value = Math.ceil(scrollLeft + clientWidth) < scrollWidth
}

const scrollBy = (amount: number) => {
  if (topCardsRef.value) {
    topCardsRef.value.scrollBy({ left: amount, behavior: 'smooth' })
  }
}

watch(similarCards, () => {
  nextTick(() => {
    checkScroll()
  })
}, { deep: true })

onMounted(() => {
  checkScroll()
  if (topCardsRef.value) {
    topCardsRef.value.addEventListener('scroll', checkScroll)
  }
  window.addEventListener('resize', checkScroll)
})

onUnmounted(() => {
  if (topCardsRef.value) {
    topCardsRef.value.removeEventListener('scroll', checkScroll)
  }
  window.removeEventListener('resize', checkScroll)
})
</script>

<template>
  <div class="model-assess-page">
    <!-- 顶部 4 张相似警情卡片 -->
    <section class="top-cards-wrapper" v-if="similarCards.length > 0">
      <div v-show="showLeftArrow" class="scroll-arrow left" @click="scrollBy(-400)">
        <Icon icon="mdi:chevron-left" width="24" height="24" />
      </div>
      <div class="top-cards" ref="topCardsRef">
        <SimilarAlarmCard
          v-for="(card, i) in similarCards"
          :key="card.id"
          :card="card"
          :index="i"
          @remove="onRemove"
          @merge="onMerge"
        />
      </div>
      <div v-show="showRightArrow" class="scroll-arrow right" @click="scrollBy(400)">
        <Icon icon="mdi:chevron-right" width="24" height="24" />
      </div>
    </section>

    <!-- 主体只保留主模型 -->
    <section class="main-body single-view">
      <TiltMapView />
    </section>
  </div>
</template>

<style lang="less" scoped>
@import './styles/model-assess.less';

.main-body.single-view {
  display: flex;
  flex-direction: column;
}

.main-body.single-view :deep(.tilt-map) {
  flex: 1;
  border-radius: 6px;
  border: 1px solid #1f2940;
  overflow: hidden;
}

// .top-cards {
//   position: absolute;
//   top: 16px;
//   left: 360px; /* 给左侧的主警情面板留出空间 */
//   right: 16px;
//   display: flex;
//   gap: 16px;
//   overflow-x: auto;
//   padding-bottom: 8px;
//   z-index: 10;
// }
</style>
