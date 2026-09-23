/**
 * 样式序列化：OL Style <-> JSON
 */
import { Style, Stroke, Fill, Circle as CircleStyle, Icon, Text } from "ol/style";
import type { StyleLike } from "ol/style/Style";
import type { StyleJson } from "../engine/types";

const safeArrayAnchor = (anchor: number[] | undefined): [number, number] | undefined => {
  if (!anchor) return undefined;
  if (anchor.length >= 2) return [anchor[0] as number, anchor[1] as number];
  return undefined;
};

const safeNumber = (v: unknown): number | undefined => {
  return typeof v === "number" ? v : undefined;
};

const safeColor = (c: unknown): string => {
  if (typeof c === "string") return c;
  return "#000";
};

export const styleToJson = (style: StyleLike | undefined): StyleJson | StyleJson[] | null => {
  if (!style) return null;
  const list = Array.isArray(style) ? style : [style as Style];
  const arr = list.map((s) => styleOne(s)).filter(Boolean) as StyleJson[];
  return arr.length === 1 ? arr[0] : arr;
};

const styleOne = (s: Style): StyleJson | null => {
  const out: Record<string, unknown> = {};
  const image = s.getImage();
  const stroke = s.getStroke();
  const fill = s.getFill();
  const text = s.getText();
  if (stroke) {
    out.stroke = {
      color: safeColor(stroke.getColor()),
      width: stroke.getWidth() ?? 2,
      lineDash: stroke.getLineDash() ?? undefined,
    };
  }
  if (fill) {
    out.fill = { color: safeColor(fill.getColor()) };
  }
  if (image instanceof CircleStyle) {
    out.image = {
      kind: "circle",
      radius: image.getRadius(),
      fill: safeColor(image.getFill()?.getColor()),
      stroke: safeColor(image.getStroke()?.getColor()),
    };
  } else if (image instanceof Icon) {
    out.image = {
      kind: "icon",
      src: image.getSrc() ?? undefined,
      anchor: safeArrayAnchor(image.getAnchor()),
      scale: safeNumber(image.getScale()),
      rotation: image.getRotation(),
    };
  }
  if (text) {
    out.text = {
      text: text.getText() ?? "",
      font: text.getFont() ?? undefined,
      fill: safeColor(text.getFill()?.getColor()),
      stroke: safeColor(text.getStroke()?.getColor()),
      offsetY: text.getOffsetY(),
    };
  }
  return Object.keys(out).length ? (out as StyleJson) : null;
};

export const styleFromJson = (json: StyleJson | null | undefined): Style | undefined => {
  if (!json) return undefined;
  const opts: ConstructorParameters<typeof Style>[0] = {};
  if (json.stroke) {
    opts.stroke = new Stroke({
      color: json.stroke.color,
      width: json.stroke.width,
      lineDash: json.stroke.lineDash,
    });
  }
  if (json.fill) {
    opts.fill = new Fill({ color: json.fill.color });
  }
  if (json.text) {
    opts.text = new Text({
      text: json.text.text,
      font: json.text.font,
      fill: new Fill({ color: json.text.fill ?? "#000" }),
      stroke: new Stroke({ color: json.text.stroke ?? "#fff", width: 3 }),
      offsetY: json.text.offsetY,
    });
  }
  if (json.image?.kind === "icon" && json.image.src) {
    opts.image = new Icon({
      src: json.image.src,
      anchor: json.image.anchor,
      scale: json.image.scale ?? 1,
      rotation: json.image.rotation ?? 0,
    });
  } else if (json.image?.kind === "circle") {
    opts.image = new CircleStyle({
      radius: json.image.radius ?? 6,
      fill: new Fill({ color: json.image.fill ?? "#fff" }),
      stroke: new Stroke({ color: json.image.stroke ?? "#f00", width: 2 }),
    });
  }
  return new Style(opts);
};
