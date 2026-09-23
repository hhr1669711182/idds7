/**
 * 自写轻量 Toast：替代 ElMessage
 */
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

export const MdMessageBox = {
  confirm: (text: string, title = "确认", opts: { type?: "warning" | "danger" } = {}) =>
    new Promise<boolean>((resolve) => {
      const mask = document.createElement("div");
      mask.className = "md-modal-mask";
      const modal = document.createElement("div");
      modal.className = "md-modal md-modal--mini";
      modal.innerHTML = `
        <div class="md-modal__header">
          <span class="md-modal__title">${title}</span>
          <button class="md-modal__close">×</button>
        </div>
        <div class="md-modal__body">${text}</div>
        <div class="md-modal__footer">
          <button class="md-modal-btn md-modal-btn--default md-modal-cancel">取消</button>
          <button class="md-modal-btn md-modal-btn--${opts.type === "danger" ? "danger" : "primary"} md-modal-ok">确定</button>
        </div>
      `;
      mask.appendChild(modal);
      document.body.appendChild(mask);
      const cleanup = (result: boolean) => {
        document.body.removeChild(mask);
        resolve(result);
      };
      modal.querySelector(".md-modal__close")?.addEventListener("click", () => cleanup(false));
      modal.querySelector(".md-modal-cancel")?.addEventListener("click", () => cleanup(false));
      modal.querySelector(".md-modal-ok")?.addEventListener("click", () => cleanup(true));
      mask.addEventListener("click", (e) => {
        if (e.target === mask) cleanup(false);
      });
    }),
};
