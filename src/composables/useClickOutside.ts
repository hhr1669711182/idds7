// 用途：外部点击检测。ref 元素之外发生 mousedown 时调用 handler（下拉/浮层失焦关闭）。见 herness/05-共享上下文/公共工具速查.md
import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/**
 * 外部点击检测。
 *
 * 挂载期间在 document 上监听 mousedown（捕获阶段），点击目标不在 ref 元素内时调用一次 handler。
 * onMounted 自动绑定、onBeforeUnmount 自动解绑。
 *
 * @param ref - 指向面板根节点的模板 ref（须为 HTML 元素）
 * @param handler - 外部点击回调
 */
export function useClickOutside(
  ref: Ref<HTMLElement | null | undefined>,
  handler: () => void,
): void {
  const onMousedown = (e: MouseEvent): void => {
    const el = ref.value
    if (el && !el.contains(e.target as Node)) {
      handler()
    }
  }

  onMounted(() => {
    document.addEventListener('mousedown', onMousedown, true)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onMousedown, true)
  })
}
