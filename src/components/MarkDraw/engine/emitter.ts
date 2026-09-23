/**
 * 极简事件总线（约 10 行），与项目 EventBus 解耦，避免与 @/utils/mitt 冲突。
 */
import type { MarkDrawEventMap, MarkDrawEventName } from "./types";

type Listener<T> = (payload: T) => void;

export class MarkDrawEmitter {
  private listeners: Map<MarkDrawEventName, Set<Listener<unknown>>> = new Map();

  on<K extends MarkDrawEventName>(
    event: K,
    listener: Listener<MarkDrawEventMap[K][number]>
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
    return () => this.off(event, listener);
  }

  off<K extends MarkDrawEventName>(
    event: K,
    listener: Listener<MarkDrawEventMap[K][number]>
  ): void {
    this.listeners.get(event)?.delete(listener as Listener<unknown>);
  }

  emit<K extends MarkDrawEventName>(
    event: K,
    ...args: MarkDrawEventMap[K]
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    const value = args[0] as MarkDrawEventMap[K][number];
    set.forEach((listener) => {
      try {
        (listener as Listener<MarkDrawEventMap[K][number]>)(value);
      } catch (err) {
        console.error(`[MarkDrawEmitter] listener for "${event}" threw`, err);
      }
    });
  }

  clear(): void {
    this.listeners.clear();
  }
}
