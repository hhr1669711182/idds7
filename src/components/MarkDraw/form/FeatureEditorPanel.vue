<script setup lang="ts">
/**
 * 维护表单（玻璃风格自写）
 * - 展示选中要素的可编辑字段
 * - 支持颜色 / 宽度 / 透明度 / 名称 / 备注 / 类型
 * - 保存走 WFS-T（insert / update）
 * - 删除走 WFS-T（Delete）
 */
import { ref, shallowRef, watch, computed, onMounted, onBeforeUnmount } from "vue";
import { useFeatureEditor } from "./useFeatureEditor";
import { isWritable } from "../view/layerConfig";
import { isFenceLayer } from "../utils/layerStyle";
import { insertFeatures, updateFeatures, deleteFeatures } from "./wfst/transaction";
import { useMarkDrawStore } from "../store/useMarkDrawStore";
import { MdInput, MdTag } from "../ui";
import { MdMessage, MdMessageBox } from "../ui/MdMessage";
import { geometryToLngLat, toMercator } from "../utils/proj";
import type { MarkDrawFeature, MarkDrawLayer, StyleJson } from "../engine/types";
import type Feature from "ol/Feature";
import type AbstractGeometry from "ol/geom/Geometry";
import type { CoordArray } from "../engine/types";
import { LineString, MultiLineString, MultiPoint, MultiPolygon, Point, Polygon } from "ol/geom";

const props = defineProps<{
  engine: import("../engine/createMarkDrawEngine").CreateMarkDrawEngineResult | null;
  selected: MarkDrawFeature | null;
  layer: MarkDrawLayer | null;
}>();

const editor = useFeatureEditor();
const store = useMarkDrawStore();
const idText = ref("");
const nameText = ref("");
const markText = ref("");
const typeText = ref("");
const colorText = ref("#ff0000");
const widthNum = ref(2);
const opacityNum = ref(0.6);
const geometryPreview = ref("");
/** 几何编辑模式：readonly=纯预览，lnglat=直接改经纬度文本，raw=改 3857 原始坐标 */
const geomMode = ref<"readonly" | "lnglat" | "raw">("readonly");
const geomDirty = ref(false);
/** 表单改动前的原几何：校验不过时原样退回 */
const geomOrigin = shallowRef<AbstractGeometry | null>(null);
/** 打开表单 / 上次保存时的属性指纹（不含几何），见 attrSnapshot 注释 */
const baseline = ref<string>("");

/** 安全 JSON 解析：GeoServer 字段可能是任意字符串 */
const safeParseJson = <T,>(text: string): T | null => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const writable = computed(() => Boolean(props.layer && isWritable(props.layer)));

/**
 * 属性指纹：仅覆盖表单里可编辑的属性与样式，不含几何。
 * 几何的变更由 mapGeomDirty 单独表达 —— 几何不进指纹，
 * 是因为地图侧拖拽会不断刷新要素引用，混进指纹会让基线跟着漂移，
 * 导致 canSave 在「刚拖完」和「没拖过」两种状态下判定相同。
 */
const attrSnapshot = (): string =>
  JSON.stringify({
    name: nameText.value,
    type: typeText.value,
    mark: markText.value,
    color: colorText.value,
    width: widthNum.value,
    opacity: opacityNum.value,
  });

/** 打开表单 / 上次保存时的几何坐标（3857），用于识别地图侧几何是否改动过 */
const baselineGeom = ref<CoordArray | null>(null);
/** 地图侧几何是否已改动（拖拽 Modify / 撤销 / 贴边），未保存前保持 true */
const mapGeomDirty = ref(false);

const geomCoordsOf = (): CoordArray | null => {
  const geom = (props.selected?.feature as Feature | undefined)?.getGeometry();
  if (!geom) return null;
  return (geom as unknown as { getCoordinates(): CoordArray }).getCoordinates();
};

/** 是否有未保存的变更：没有变更时保存按钮直接置灰 */
const canSave = computed(() => {
  if (!props.layer || !props.selected?.feature) return false;
  if (!baseline.value) return false;
  if (mapGeomDirty.value || geomDirty.value) return true;
  const cur = geomCoordsOf();
  const base = baselineGeom.value;
  if (JSON.stringify(cur) !== JSON.stringify(base)) return true;
  return baseline.value !== attrSnapshot();
});

/** 当前表单打开的是哪个要素：用于区分「切换要素」与「同一要素的几何刷新」 */
let loadedId: string | null = null;

watch(
  () => props.selected,
  (sel) => {
    if (sel && sel.feature) {
      const feat = sel.feature as Feature;
      const nextId = String(sel.id);
      // 同一要素的几何被地图侧改动（拖拽 / 撤销 / 贴边）时，
      // selected 对象会被重建，但业务上不算「换了一个要素」：
      // 只刷新几何文本与基线，不能把用户的属性草稿和未保存状态冲掉。
      const sameFeature = loadedId === nextId;
      loadedId = nextId;
      editor.loadFromFeature(feat, props.layer ?? undefined);
      const fp = (editor.state.properties ?? {}) as Record<string, unknown>;
      // 同一要素的几何刷新不覆盖属性输入框，否则用户正在敲的内容会被冲掉
      if (!sameFeature) {
        nameText.value = String(fp.name ?? "");
        markText.value = String(fp.mark ?? "");
        typeText.value = String(fp.type ?? "");
      }
      idText.value = String(sel.id ?? "");
      const style = (fp.style ?? {}) as StyleJson;
      // style 可能是 GeoServer 里的字符串 / 脏数据，先归一成对象再取值
      const safeStyle: StyleJson =
        typeof style === "string" ? safeParseJson<StyleJson>(style) ?? {} : style ?? {};
      if (safeStyle.stroke && !sameFeature) {
        const c = typeof safeStyle.stroke.color === "string" ? safeStyle.stroke.color : "#ff0000";
        colorText.value = c.startsWith("#") ? c : "#ff0000";
        widthNum.value = typeof safeStyle.stroke.width === "number" ? safeStyle.stroke.width : 2;
        const m = c.match(/rgba\(([^)]+)\)/);
        if (m) {
          const parts = m[1].split(",").map((s) => s.trim());
          opacityNum.value = Number(parts[3] ?? "1");
        }
      }
      if (typeof safeStyle.fill?.color === "string") {
        const m = safeStyle.fill.color.match(/rgba\(([^)]+)\)/);
        if (m) {
          const parts = m[1].split(",").map((s) => s.trim());
          opacityNum.value = Number(parts[3] ?? "1");
        }
      }
      geometryPreview.value = JSON.stringify(sel.geometryLngLat);
      // 几何文本始终跟随地图最新值刷新（用户手动编辑过的除外，见 syncGeomFromMap）
      geomMode.value = sameFeature ? geomMode.value : "readonly";
      if (!sameFeature) {
        geomDirty.value = false;
        geomOrigin.value = null;
      }
      // 基线要在表单值全部就位后再取，否则会把上一次的残留值算进基线
      baseline.value = attrSnapshot();
      // 几何基线只在「换要素」时取：同一要素因地图拖拽被重建时，
      // 若跟着刷新基线，刚拖完的几何就会被当成「没改过」，保存按钮按不下去。
      if (!sameFeature) baselineGeom.value = geomCoordsOf();
    } else {
      editor.reset();
      geomMode.value = "readonly";
      geomDirty.value = false;
      geomOrigin.value = null;
      baseline.value = "";
      nameText.value = "";
      markText.value = "";
      typeText.value = "";
      idText.value = "";
      geometryPreview.value = "";
      colorText.value = "#ff0000";
      widthNum.value = 2;
      opacityNum.value = 0.6;
    }
  },
  { immediate: true }
);

/* ------------------------------------------------------------------ *
 * 几何联动：地图 <-> 表单
 * ------------------------------------------------------------------ */

/** 从 OL Geometry 反推几何类型名（决定用哪种 Geometry 构造） */
const geomTypeOf = (feat: Feature): string => feat.getGeometry()?.getType() ?? "Polygon";

/** 依据几何类型重建 Geometry（输入 3857 坐标） */
const buildGeometry = (type: string, coords: unknown) => {
  switch (type) {
    case "Point":
      return new Point(coords as number[]);
    case "MultiPoint":
      return new MultiPoint(coords as number[][]);
    case "LineString":
      return new LineString(coords as number[][]);
    case "MultiLineString":
      return new MultiLineString(coords as number[][][]);
    case "MultiPolygon":
      return new MultiPolygon(coords as number[][][][]);
    default:
      return new Polygon(coords as number[][][]);
  }
};

/** 校验文本是否为合法 JSON 数字数组 */
const parseCoordJson = (text: string): unknown | null => {
  try {
    const v = JSON.parse(text);
    return v ?? null;
  } catch {
    return null;
  }
};

/** 表单文本（4326 经纬度）→ 地图内部 3857 坐标，递归转换任意嵌套层级 */
const lngLatNodeToMercator = (node: unknown): unknown => {
  if (Array.isArray(node) && node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
    return toMercator([node[0], node[1]]);
  }
  if (Array.isArray(node)) return node.map(lngLatNodeToMercator);
  return node;
};

/**
 * 几何文本变更 → 回写地图要素。
 *
 * 只改内存态几何，不发 engine.updateFeature：
 * updateFeature 会触发 feature:modified，要素列表面板会据此自动 WFS-T 落库，
 * 表单里打字就变成直接写库了，绕过了围栏校验和「保存」按钮，属于越权写库。
 * 真正落库只发生在点「保存（WFS-T）」时。
 */
const applyGeomFromText = (): boolean => {
  const feat = props.selected?.feature as Feature | undefined;
  if (!feat || geomMode.value === "readonly") return false;
  const parsed = parseCoordJson(geometryPreview.value);
  if (parsed === null) {
    MdMessage.warning("几何文本不是合法 JSON");
    return false;
  }
  const type = geomTypeOf(feat);
  try {
    const coords3857 =
      geomMode.value === "lnglat"
        ? (lngLatNodeToMercator(parsed) as CoordArray)
        : (parsed as CoordArray);
    // 首次改动前留一份原几何：围栏校验不过时要原样退回
    if (!geomOrigin.value) {
      const g = feat.getGeometry();
      geomOrigin.value = g ? (g.clone() as AbstractGeometry) : null;
    }
    feat.setGeometry(buildGeometry(type, coords3857));
    geomDirty.value = true;
    return true;
  } catch (e) {
    MdMessage.error(`几何解析失败：${(e as Error).message}`);
    return false;
  }
};

/** 放弃表单里未保存的几何改动，回到改动前的几何 */
const revertGeomFromText = () => {
  const feat = props.selected?.feature as Feature | undefined;
  if (feat && geomOrigin.value) feat.setGeometry(geomOrigin.value);
  geomOrigin.value = null;
  geomDirty.value = false;
  syncGeomFromMap();
  baseline.value = attrSnapshot();
  baselineGeom.value = geomCoordsOf();
  mapGeomDirty.value = false;
};

/** 地图要素几何变化 → 刷新表单文本（拖拽 / 撤销 / 右键定位都会走这里） */
const syncGeomFromMap = () => {
  const sel = props.selected;
  if (!sel?.feature) return;
  const feat = sel.feature as Feature;
  const g = feat.getGeometry();
  if (!g) return;
  // 地图几何始终是唯一真相源：表单文本只是它的 4326 视图。
  // 用户在文本里改完失焦时 applyGeomFromText 已经把新几何写回要素，
  // 此刻文本与地图是一致的；之后无论拖拽顶点、撤销重做还是右键贴边，
  // 都应该让文本重新跟随地图，而不是冻结在旧值。
  const coords = (g as unknown as { getCoordinates(): CoordArray }).getCoordinates();
  editor.state.geometry3857 = coords;
  editor.state.geometryLngLat = geometryToLngLat(coords);
  if (geomMode.value === "raw") geometryPreview.value = JSON.stringify(coords);
  else geometryPreview.value = JSON.stringify(editor.state.geometryLngLat);
};

const applyStyle = (feat: Feature) => {
  const op = opacityNum.value;
  const c = colorText.value;
  const rgbaFill = `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${op})`;
  const style: StyleJson = {
    stroke: { color: c, width: widthNum.value },
    fill: { color: rgbaFill },
  };
  feat.set("style", style);
};

const onSave = async () => {
  if (!props.layer) {
    MdMessage.warning("请先选择图层");
    return;
  }
  if (!props.selected?.feature) return;
  const feat = props.selected.feature as Feature;

  // 表单里改过的几何先落到要素上，保证存进库与校验用的都是最新 geom
  if (geomDirty.value && geomMode.value !== "readonly") {
    applyGeomFromText();
    geomDirty.value = false;
  }

  // 围栏约束：不论能否落库都要校验，避免把非法几何留在图上
  if (isFenceLayer(props.layer)) {
    const violations = props.engine?.validateFenceOf(feat) ?? [];
    if (violations.length) {
      const detail = violations.map((v) => v.message).join("；");
      MdMessage.warning(`围栏交叠，已拦截：${detail}`);
      // 校验不过：撤回本次表单改动，地图与文本都回到改动前
      revertGeomFromText();
      return;
    }
  }

  if (!writable.value) {
    MdMessage.warning("当前图层为只读，几何改动已在地图生效，但无法写入数据库。");
    return;
  }

  feat.set("name", nameText.value);
  feat.set("mark", markText.value);
  if (typeText.value) feat.set("type", typeText.value);
  applyStyle(feat);

  try {
    if (editor.state.mode === "create") {
      const result = await insertFeatures(props.layer, [feat]);
      const newIds = result.insertedIds ?? [];
      if (newIds.length) feat.setId(String(newIds[0]));
      MdMessage.success("新增成功");
    } else {
      await updateFeatures(props.layer, [feat]);
      MdMessage.success("更新成功");
    }
    feat.set("_isDirty", false);
    editor.markDirty();
    geomDirty.value = false;
    geomOrigin.value = null;
    syncGeomFromMap();
    // 保存成功 = 新基线，按钮随即置灰，避免重复提交同一份数据
    baseline.value = attrSnapshot();
  baselineGeom.value = geomCoordsOf();
  mapGeomDirty.value = false;
    // 同步退出工具态：engine 与 store 必须一起归位
    store.setActiveTool(null);
    props.engine?.setActiveTool(null);
  } catch (e) {
    MdMessage.error(`保存失败：${(e as Error).message}`);
  }
};

/**
 * 地图侧几何变化（拖拽 Modify / 撤销重做 / 右键贴边）实时刷新表单几何，
 * 并把「地图几何已改动」标记为待保存 —— 保存按钮据此解除置灰。
 */
const onEngineModified = (payload: MarkDrawFeature) => {
  if (!props.selected || payload.id !== props.selected.id) return;
  mapGeomDirty.value = true;
  syncGeomFromMap();
};

onMounted(() => {
  props.engine?.on("feature:modified", onEngineModified as never);
});

onBeforeUnmount(() => {
  props.engine?.off("feature:modified", onEngineModified as never);
});

const onDelete = async () => {
  if (!props.layer || !isWritable(props.layer)) {
    MdMessage.warning("当前图层为只读");
    return;
  }
  if (!props.selected?.feature) return;
  const ok = await MdMessageBox.confirm("确认删除该要素？删除后无法恢复。", "删除确认", {
    type: "danger",
  });
  if (!ok) return;
  try {
    await deleteFeatures(props.layer, [props.selected.feature as Feature]);
    const id = props.selected.id;
    if (typeof id === "string" || typeof id === "number") {
      props.engine?.removeFeature(id);
    }
    MdMessage.success("删除成功");
    editor.reset();
  } catch (e) {
    MdMessage.error(`删除失败：${(e as Error).message}`);
  }
};
</script>

<template>
  <section class="md-card md-editor">
    <header class="md-card__head">
      <span class="md-card__bar" />
      <span class="md-card__title">维护表单</span>
      <MdTag v-if="layer" :variant="writable ? 'success' : 'info'">{{ writable ? '可写' : '只读' }}</MdTag>
    </header>
    <div v-if="selected" class="md-editor__body">
      <div class="md-editor__row">
        <label class="md-editor__label">图层</label>
        <span class="md-editor__value">{{ layer?.name ?? '未选择' }}</span>
      </div>
      <div class="md-editor__row">
        <label class="md-editor__label">ID</label>
        <MdInput v-model="idText" readonly />
      </div>
      <div class="md-editor__row">
        <label class="md-editor__label">名称</label>
        <MdInput v-model="nameText" :disabled="!writable" placeholder="要素名称" />
      </div>
      <div class="md-editor__row">
        <label class="md-editor__label">类型</label>
        <MdInput v-model="typeText" :disabled="!writable" placeholder="可选：消防/医疗…" />
      </div>
      <div class="md-editor__row">
        <label class="md-editor__label">备注</label>
        <MdInput v-model="markText" type="textarea" :rows="2" :disabled="!writable" placeholder="备注信息" />
      </div>
      <div class="md-editor__row md-editor__row--style">
        <label class="md-editor__label">颜色</label>
        <input type="color" class="md-color" v-model="colorText" :disabled="!writable" />
        <label class="md-editor__label md-editor__label--sm">宽度</label>
        <input type="number" class="md-num" min="1" max="20" v-model.number="widthNum" :disabled="!writable" />
        <label class="md-editor__label md-editor__label--sm">透明度</label>
        <input
          type="number"
          class="md-num"
          min="0"
          max="1"
          step="0.05"
          v-model.number="opacityNum"
          :disabled="!writable"
        />
      </div>
      <div class="md-editor__geom">
        <div class="md-editor__geom-head">
          <span class="md-editor__label">几何</span>
          <div class="md-editor__geom-modes">
            <button class="md-editor__mode" :class="{ active: geomMode === 'readonly' }" @click="geomMode = 'readonly'">
              经纬度预览
            </button>
            <button class="md-editor__mode" :class="{ active: geomMode === 'lnglat' }" @click="geomMode = 'lnglat'">
              编辑经纬度
            </button>
            <button class="md-editor__mode" :class="{ active: geomMode === 'raw' }" @click="geomMode = 'raw'">
              编辑 3857
            </button>
          </div>
        </div>
        <MdInput
          v-model="geometryPreview"
          type="textarea"
          :rows="4"
          :readonly="geomMode === 'readonly'"
          :placeholder="geomMode === 'raw' ? '3857 坐标数组 JSON' : '4326 经纬度数组 JSON'"
          @blur="applyGeomFromText"
        />
        <div v-if="geomMode !== 'readonly'" class="md-editor__geom-tip">
          修改后失焦即同步到地图（仅内存态，不落库）；点「保存（WFS-T）」才写入数据库 geom 字段。
        </div>
        <button v-if="geomMode !== 'readonly' && geomDirty" class="md-editor__geom-revert" @click="revertGeomFromText">
          放弃几何改动
        </button>
        <div v-else-if="isFenceLayer(layer)" class="md-editor__geom-tip md-editor__geom-tip--fence">
          围栏约束：不可与同层其它围栏交叠，靠近时自动贴边；保存前会校验拦截。
        </div>
      </div>
      <div class="md-editor__actions">
        <button class="md-pbtn md-pbtn--primary" @click="onSave" :disabled="!canSave">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path
              fill="currentColor"
              d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4zM12 19a3 3 0 110-6 3 3 0 010 6zm3-10H5V5h10v4z"
            />
          </svg>
          保存（WFS-T）
        </button>
        <button class="md-pbtn md-pbtn--danger" @click="onDelete" :disabled="!writable">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path fill="currentColor" d="M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
          </svg>
          删除
        </button>
      </div>
    </div>
    <div v-else class="md-editor__empty">未选中任何要素 — 列表点选或图上点击</div>
  </section>
</template>

<style scoped>
.md-editor__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.md-editor__row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.md-editor__row--col {
  flex-direction: column;
  align-items: stretch;
}
.md-editor__row--style {
  flex-wrap: wrap;
}
.md-editor__label {
  width: 48px;
  font-size: 12px;
  color: var(--md-text-2);
  flex-shrink: 0;
}
.md-editor__label--sm {
  width: auto;
}
.md-editor__value {
  font-size: 13px;
  color: var(--md-text);
}
.md-color {
  width: 36px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--md-border);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}
.md-num {
  width: 56px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--md-border);
  border-radius: 6px;
  background: rgba(20, 30, 48, 0.5);
  color: var(--md-text);
  font-size: 12px;
  outline: none;
}
:root:not([data-theme="NIGHT"]) .md-num {
  background: rgba(255, 255, 255, 0.6);
}
.md-num:focus {
  border-color: var(--md-border-strong);
}
.md-editor__actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.md-pbtn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 12px;
  border-radius: var(--md-radius-sm);
  border: 1px solid var(--md-border);
  background: rgba(20, 30, 48, 0.5);
  color: var(--md-text);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
}
:root:not([data-theme="NIGHT"]) .md-pbtn {
  background: rgba(255, 255, 255, 0.6);
}
.md-pbtn:hover:not(:disabled) {
  border-color: var(--md-border-strong);
}
.md-pbtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.md-pbtn--primary {
  background: linear-gradient(135deg, var(--md-accent-1), var(--md-accent-2));
  color: #0a1525;
  border-color: transparent;
  font-weight: 600;
}
.md-pbtn--primary:hover:not(:disabled) {
  box-shadow: 0 4px 14px var(--md-accent-glow);
}
.md-pbtn--danger {
  background: linear-gradient(135deg, var(--md-danger), var(--md-danger-2));
  color: #fff;
  border-color: transparent;
  font-weight: 600;
}
.md-pbtn--danger:hover:not(:disabled) {
  box-shadow: 0 4px 14px rgba(245, 54, 92, 0.35);
}
.md-editor__geom {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.md-editor__geom-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.md-editor__geom-modes {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
.md-editor__mode {
  height: 22px;
  padding: 0 8px;
  border-radius: 5px;
  border: 1px solid var(--md-border);
  background: transparent;
  color: var(--md-text-2);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.16s ease;
}
.md-editor__mode:hover:not(:disabled) {
  border-color: var(--md-border-strong);
  color: var(--md-accent-1);
}
.md-editor__mode.active {
  background: linear-gradient(135deg, var(--md-accent-1), var(--md-accent-2));
  color: #0a1525;
  border-color: transparent;
  font-weight: 600;
}
.md-editor__mode:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.md-editor__geom-tip {
  font-size: 11px;
  line-height: 1.5;
  color: var(--md-text-3);
}
.md-editor__geom-revert {
  align-self: flex-start;
  height: 24px;
  padding: 0 10px;
  border-radius: 5px;
  border: 1px solid var(--md-border);
  background: transparent;
  color: var(--md-text-2);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.16s ease;
}
.md-editor__geom-revert:hover {
  border-color: var(--md-danger);
  color: var(--md-danger);
}
.md-editor__geom-tip--fence {
  color: var(--md-warning);
  padding: 4px 8px;
  border-radius: 5px;
  background: rgba(245, 166, 35, 0.1);
  border: 1px solid rgba(245, 166, 35, 0.28);
}
.md-editor__empty {
  padding: 18px 0;
  font-size: 12px;
  color: var(--md-text-3);
  text-align: center;
  border: 1px dashed var(--md-border);
  border-radius: var(--md-radius-sm);
}
</style>
