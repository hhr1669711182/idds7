/**
 * 要素编辑历史栈：支持撤销 / 重做 / 违规回滚
 *
 * 记录粒度 = 单个要素的一次几何或属性快照，
 * 因此「撤销」能精确回到上一步，而不是整图回滚。
 * 一次编辑的时序：push（改前）→ 修改 → commit（补齐 after）；
 * 若中途校验不通过，restoreCurrent 用 before 快照把要素拉回去。
 */
import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";

/** 单条历史记录：操作前后的要素快照 */
interface Snapshot {
  id: string | number;
  /** 操作前的几何（clone 独立保存，后续修改不会污染历史） */
  before: Geometry | null;
  beforeProps: Record<string, unknown>;
  /** 操作后的几何 */
  after: Geometry | null;
  afterProps: Record<string, unknown>;
  label: string;
}

const MAX_HISTORY = 50;

/** 几何类型判定：只有可被 Modify 改写的几何才需要进历史 */
const isGeometry = (v: unknown): v is Geometry =>
  !!v && typeof (v as Geometry).clone === "function";

const cloneGeometry = (geom: unknown): Geometry | null =>
  isGeometry(geom) ? (geom.clone() as Geometry) : null;

export class FeatureHistory {
  private stack: Snapshot[] = [];
  /** 游标指向当前状态；-1 表示还没开始 */
  private cursor = -1;
  private listeners = new Set<() => void>();

  /** 变更通知：撤销按钮可用性会随此更新 */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  /**
   * 记录一次修改（在实际修改几何/属性之前调用）
   * @param feature 目标要素
   * @param label 操作名，用于菜单文案与提示
   */
  push(feature: Feature, label = "编辑要素"): void {
    // 丢弃 redo 分支
    if (this.cursor < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.cursor + 1);
    }
    const id = feature.getId() as string | number | undefined;
    if (id === undefined) return;
    this.stack.push({
      id,
      before: cloneGeometry(feature.getGeometry()),
      beforeProps: { ...feature.getProperties() },
      after: null,
      afterProps: {},
      label,
    });
    // 游标停在「待填充 after」的位置，等 commit 补齐
    this.cursor = this.stack.length - 1;
    if (this.stack.length > MAX_HISTORY) this.stack.shift();
    this.notify();
  }

  /** 修改完成后调用，补齐 after 快照 */
  commit(feature: Feature): void {
    const snap = this.stack[this.cursor];
    if (!snap) return;
    const id = feature.getId() as string | number | undefined;
    if (id === undefined || snap.id !== id) return;
    snap.after = cloneGeometry(feature.getGeometry());
    snap.afterProps = { ...feature.getProperties() };
    this.notify();
  }

  /**
   * 违规回滚：用当前游标条目的 before 快照把要素还原（用于围栏交叠拦截）。
   * 还原后丢弃这条未完成的记录。
   */
  restoreCurrent(feature: Feature): void {
    const snap = this.stack[this.cursor];
    if (!snap) return;
    if (snap.id !== (feature.getId() as string | number | undefined)) return;
    this.applySnapshot(snap, "before", feature);
    this.stack.splice(this.cursor, 1);
    this.cursor -= 1;
    this.notify();
  }

  get canUndo(): boolean {
    return this.cursor >= 0 && !!this.stack[this.cursor]?.after;
  }

  get canRedo(): boolean {
    return this.cursor < this.stack.length - 1 && !!this.stack[this.cursor + 1]?.after;
  }

  /** 当前操作名（菜单里回显，如「撤销：拖拽顶点」） */
  get undoLabel(): string {
    return this.canUndo ? this.stack[this.cursor]!.label : "";
  }

  get redoLabel(): string {
    return this.canRedo ? this.stack[this.cursor + 1]!.label : "";
  }

  /**
   * 撤销：把要素恢复成 before，并返回该要素 id
   * @param resolve 由 id 取回要素实例
   */
  undo(resolve: (id: string | number) => Feature | undefined): string | number | null {
    if (!this.canUndo) return null;
    const snap = this.stack[this.cursor]!;
    const feature = resolve(snap.id);
    if (!feature) {
      // 要素已不存在：丢弃该条，继续往前退
      this.stack.splice(this.cursor, 1);
      this.cursor -= 1;
      this.notify();
      return this.undo(resolve);
    }
    this.applySnapshot(snap, "before", feature);
    this.cursor -= 1;
    this.notify();
    return snap.id;
  }

  /** 重做：把要素恢复成 after，并返回该要素 id */
  redo(resolve: (id: string | number) => Feature | undefined): string | number | null {
    if (!this.canRedo) return null;
    const snap = this.stack[this.cursor + 1]!;
    const feature = resolve(snap.id);
    if (!feature) {
      this.stack.splice(this.cursor + 1, 1);
      this.notify();
      return this.redo(resolve);
    }
    this.applySnapshot(snap, "after", feature);
    this.cursor += 1;
    this.notify();
    return snap.id;
  }

  /** 把快照某一侧写回要素：几何全量替换，属性只覆盖业务字段 */
  private applySnapshot(
    snap: Snapshot,
    side: "before" | "after",
    feature: Feature
  ): void {
    const geom = snap[side];
    feature.setGeometry(geom ? (geom.clone() as Geometry) : undefined);
    const props = side === "before" ? snap.beforeProps : snap.afterProps;
    Object.entries(props).forEach(([k, v]) => {
      if (k.startsWith("_")) return;
      feature.set(k, v);
    });
  }

  /** 丢弃指向已删除要素的历史条目 */
  prune(aliveIds: Set<string | number>): void {
    const kept = this.stack.filter((s) => aliveIds.has(s.id));
    if (kept.length === this.stack.length) return;
    this.stack = kept;
    this.cursor = Math.min(this.cursor, this.stack.length - 1);
    this.notify();
  }

  /** 清空历史（切图层、清除元素时调用） */
  clear(): void {
    this.stack = [];
    this.cursor = -1;
    this.notify();
  }

  get size(): number {
    return this.stack.length;
  }
}