/**
 * 剪贴板公共能力：统一封装写入与失败兜底（权限拒绝 / 非安全上下文），
 * 避免各组件重复写 try/catch 与提示文案。
 */

/** 提示回调：type 对应成功 / 失败两类 */
export type ClipboardNotifier = (type: "success" | "warning", text: string) => void;

export const CLIPBOARD_DENIED_MESSAGE = "浏览器拒绝了剪贴板访问，请检查站点权限";

export interface CopyTextOptions {
  /** 成功提示文案；传 false 则不弹成功提示 */
  successText?: string | false;
  /** 写入失败提示文案 */
  deniedText?: string;
  /** 自定义提示实现；默认用 Element Plus 的 ElMessage */
  notify?: ClipboardNotifier;
}

/**
 * 写入剪贴板并按需提示
 * @returns 是否写入成功
 */
export const copyTextToClipboard = async (
  text: string,
  options: CopyTextOptions = {},
): Promise<boolean> => {
  const { successText, deniedText = CLIPBOARD_DENIED_MESSAGE, notify } = options;
  const elNotify = async (type: "success" | "warning", message: string) => {
    if (notify) {
      notify(type, message);
      return;
    }
    const { ElMessage } = await import("element-plus");
    type === "success" ? ElMessage.success(message) : ElMessage.warning(message);
  };

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    await elNotify("warning", deniedText);
    return false;
  }

  const message = successText === false ? "" : successText ?? `已复制：${text}`;
  if (message) await elNotify("success", message);
  return true;
};