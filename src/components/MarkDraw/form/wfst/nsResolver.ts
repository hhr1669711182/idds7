/**
 * 命名空间解析：通过 fetchFeatureTypeInfo 缓存几何字段、featureNS 等。
 */
import { fetchFeatureTypeInfo } from "../../utils/featureType";
import type { MarkDrawLayer } from "../../engine/types";

export const resolveFeatureType = (layer: MarkDrawLayer) => fetchFeatureTypeInfo(layer);
