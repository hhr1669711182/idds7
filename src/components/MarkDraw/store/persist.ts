/**
 * MarkDraw 内部 pinia 持久化适配层（独立前缀，避免与主项目 store 冲突）。
 */
const make = (
  driver: "local" | "session",
  ns = "markdraw"
): Pick<Storage, "getItem" | "setItem" | "removeItem"> => {
  const s = globalThis[`${driver}Storage`] as Storage;
  const prefix = `${ns}:`;
  return {
    getItem: (k: string) => s.getItem(prefix + k),
    setItem: (k: string, v: string) => {
      s.setItem(prefix + k, v);
    },
    removeItem: (k: string) => {
      s.removeItem(prefix + k);
    },
  };
};

export const markDrawLocal = make("local");
export const markDrawSession = make("session");
