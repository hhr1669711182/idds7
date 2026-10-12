/**
 * 右键操作菜单
 *
 * 引擎层零 Vue 依赖，因此菜单用 createApp 动态挂载到 body，
 * 样式统一放全局 styles/toast.less（.md-ctxmenu*），动态挂载拿不到 scoped 属性。
 * 菜单会做视口边缘翻转，避免贴到屏幕右侧 / 底部时溢出。
 */
import {
  createApp,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  type App,
  type PropType,
} from "vue";
import "../styles/toast.less";

export interface MdContextMenuItem {
  key: string;
  label: string;
  /** 内联 SVG path（viewBox 24x24），给菜单项做图标 */
  icon?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  /** 次要文案，如撤销 / 重做的操作名 */
  hint?: string;
}

export interface MdContextMenuOptions {
  x: number;
  y: number;
  items: MdContextMenuItem[];
  /** 点击菜单项回调；禁用项不会回调 */
  onSelect: (key: string) => void;
}

const MENU_W = 200;
const MENU_ITEM_H = 30;
const VIEWPORT_MARGIN = 8;

const ContextMenuHost = defineComponent({
  name: "MdContextMenuHost",
  props: {
    items: { type: Array as PropType<MdContextMenuItem[]>, required: true },
    posX: { type: Number, default: 0 },
    posY: { type: Number, default: 0 },
    onPick: { type: Function as PropType<(key: string) => void>, required: true },
    onClose: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const root = ref<HTMLDivElement | null>(null);
    const pos = ref({ left: props.posX, top: props.posY });
    const estimate = props.items.length * MENU_ITEM_H + 14;

    onMounted(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const h = root.value?.offsetHeight || estimate;
      let left = props.posX;
      let top = props.posY;
      if (left + MENU_W + VIEWPORT_MARGIN > vw) left = vw - MENU_W - VIEWPORT_MARGIN;
      if (top + h + VIEWPORT_MARGIN > vh) top = vh - h - VIEWPORT_MARGIN;
      pos.value = {
        left: Math.max(VIEWPORT_MARGIN, left),
        top: Math.max(VIEWPORT_MARGIN, top),
      };
    });

    const onDocDown = (e: MouseEvent) => {
      const el = root.value;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      props.onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    onBeforeUnmount(() => {
      document.removeEventListener("mousedown", onDocDown, true);
      document.removeEventListener("keydown", onKey, true);
    });

    return () =>
      h(
        "div",
        {
          ref: root,
          class: "md-ctxmenu",
          style: { left: `${pos.value.left}px`, top: `${pos.value.top}px` },
          onContextmenu: (e: MouseEvent) => e.preventDefault(),
        },
        props.items.map((item) =>
          item.divider
            ? h("div", { key: item.key, class: "md-ctxmenu__divider" })
            : h(
                "button",
                {
                  key: item.key,
                  class: [
                    "md-ctxmenu__item",
                    item.disabled ? "md-ctxmenu__item--disabled" : "",
                    item.danger ? "md-ctxmenu__item--danger" : "",
                  ],
                  disabled: item.disabled,
                  onClick: () => props.onPick(item.key),
                },
                [
                  item.icon
                    ? h("span", {
                        class: "md-ctxmenu__icon",
                        innerHTML: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="${item.icon}"/></svg>`,
                      })
                    : null,
                  h("span", { class: "md-ctxmenu__label" }, item.label),
                  item.hint
                    ? h("span", { class: "md-ctxmenu__hint" }, item.hint)
                    : null,
                ]
              )
        )
      );
  },
});

export interface MdContextMenuHandle {
  close: () => void;
}

/** 打开一个右键菜单；返回句柄便于外部主动关闭 */
export const openContextMenu = (opts: MdContextMenuOptions): MdContextMenuHandle => {
  const host = document.createElement("div");
  host.className = "md-ctxmenu-host";
  document.body.appendChild(host);

  let settled = false;
  let app: App | null = null;
  const close = () => {
    if (settled) return;
    settled = true;
    app?.unmount();
    host.remove();
  };
  app = createApp(ContextMenuHost, {
    items: opts.items,
    posX: opts.x,
    posY: opts.y,
    onPick: (key: string) => {
      close();
      opts.onSelect(key);
    },
    onClose: close,
  });
  app.mount(host);
  return { close };
};