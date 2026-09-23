/**
 * 选中/编辑交互：封装 ol/interaction/Select + Modify
 * - 单选
 * - Del 键删除
 * - 拖拽顶点 modify 后触发 modified 事件
 */
import Select from "ol/interaction/Select";
import Modify from "ol/interaction/Modify";
import type { Map as OLMap } from "ol";
import type { EventsKey } from "ol/events";
import { unByKey } from "ol/Observable";

export interface SelectCallbacks {
  onSelect: (featureId: string | number | null) => void;
  onModified: (featureId: string | number) => void;
}

export class MarkDrawSelectInteraction {
  readonly map: OLMap;
  private select: Select;
  private modify: Modify;
  private keys: EventsKey[] = [];
  private deleting = false;

  constructor(map: OLMap, callbacks: SelectCallbacks) {
    this.map = map;
    this.select = new Select();
    this.modify = new Modify({ features: this.select.getFeatures() });
    map.addInteraction(this.select);
    map.addInteraction(this.modify);

    this.keys.push(
      this.select.on("select", () => {
        const f = this.select.getFeatures().item(0);
        callbacks.onSelect(f ? (f.getId() ?? null) : null);
      })
    );
    this.keys.push(
      this.modify.on("modifyend", (evt) => {
        const features = (evt as { features?: { getArray(): Array<{ getId?: () => string | number | undefined }> } })
          .features;
        const arr = features?.getArray() ?? [];
        arr.forEach((f) => {
          const id = f.getId?.();
          if (id !== undefined) callbacks.onModified(id);
        });
      })
    );

    this.deleting = false;
    map.getViewport().addEventListener("keydown", this.handleKey);
  }

  private handleKey = (e: KeyboardEvent) => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    const f = this.select.getFeatures().item(0);
    if (!f) return;
    e.preventDefault();
    if (this.deleting) return;
    this.deleting = true;
    const id = f.getId?.();
    if (id !== undefined) this.onDelete?.(id);
    queueMicrotask(() => {
      this.deleting = false;
    });
  };

  /** 外部注入删除回调 */
  onDelete: ((featureId: string | number) => void) | null = null;

  destroy(): void {
    unByKey(this.keys);
    this.map.removeInteraction(this.modify);
    this.map.removeInteraction(this.select);
    this.map.getViewport().removeEventListener("keydown", this.handleKey);
  }
}
