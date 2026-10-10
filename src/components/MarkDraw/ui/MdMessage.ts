/**
 * 自写轻量 Toast + 确认框：替代 ElMessage / ElMessageBox
 *
 * 注意：confirm 的 DOM 由 createApp 动态挂载，拿不到任何组件的 scope 属性，
 * 因此 .md-modal* / .md-message* 样式统一放在全局样式文件里
 * （styles/toast.less），不要写进组件的 <style scoped>。
 */
import {
  createApp,
  defineComponent,
  h,
  type App,
  type PropType,
  type VNode,
} from "vue";
import MdModal from "./MdModal.vue";
import "./../styles/toast.less";

type Variant = "success" | "warning" | "error" | "info";

let container: HTMLDivElement | null = null;
const messages: Array<{ el: HTMLDivElement; timer: number }> = [];

const ensureContainer = () => {
  if (container && document.body.contains(container)) return container;
  container = document.createElement("div");
  container.className = "md-message-container";
  document.body.appendChild(container);
  return container;
};

const show = (text: string, variant: Variant = "info", duration = 2400) => {
  const root = ensureContainer();
  const el = document.createElement("div");
  el.className = `md-message md-message--${variant}`;
  el.textContent = text;
  root.appendChild(el);
  const timer = window.setTimeout(() => {
    el.classList.add("md-message--leaving");
    window.setTimeout(() => {
      root.removeChild(el);
      const idx = messages.findIndex((m) => m.el === el);
      if (idx >= 0) messages.splice(idx, 1);
    }, 220);
  }, duration);
  messages.push({ el, timer });
};

export const MdMessage = {
  success: (text: string) => show(text, "success"),
  warning: (text: string) => show(text, "warning"),
  error: (text: string) => show(text, "error", 3600),
  info: (text: string) => show(text, "info"),
};

/** 确认框宿主组件：挂在 body 上，避免被地图容器的 overflow / z-index 裁剪 */
const ConfirmHost = defineComponent({
  name: "MdConfirmHost",
  props: {
    text: { type: String, required: true },
    title: { type: String, default: "确认" },
    danger: { type: Boolean, default: false },
    onDone: { type: Function as PropType<(result: boolean) => void>, required: true },
  },
  setup(props) {
    const close = (result: boolean) => props.onDone(result);
    return () =>
      h(MdModal, {
        open: true,
        title: props.title,
        width: "360px",
        variant: props.danger ? "danger" : "primary",
        onOk: () => close(true),
        onCancel: () => close(false),
        "onUpdate:open": (v: boolean) => !v && close(false),
      }, { default: () => h("div", { class: "md-confirm__text" }, props.text) });
  },
});

export const MdMessageBox = {
  confirm: (text: string, title = "确认", opts: { type?: "warning" | "danger" } = {}) =>
    new Promise<boolean>((resolve) => {
      const host = document.createElement("div");
      host.className = "md-confirm-host";
      document.body.appendChild(host);

      let settled = false;
      const app: App = createApp(ConfirmHost, {
        text,
        title,
        danger: opts.type === "danger",
        onDone: (result: boolean) => {
          if (settled) return;
          settled = true;
          app.unmount();
          host.remove();
          resolve(result);
        },
      });
      app.mount(host);
    }),
};

export type MdConfirmVNode = VNode;
