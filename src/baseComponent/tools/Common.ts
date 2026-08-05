const LOCATION_TYPE_LABELS: Record<string, string> = {
  SJDW: "手机定位",
  SGBZ: "手工标注",
  ECDW: "二次定位",
  WZBJDW: "微站报警",
  WZWDW: "位置网定位",
  AFDZDW: "案发地址定位",
  SZDDW: "三字段定位",
  HLWDW: "互联网定位",
  PADWZHC: "pad位置回传",
  DXDW: "短信定位",
  "WZWDW-JZ": "位置网基站定位",
  "WZWDW-WL": "位置网网络定位",
  "WZWDW-GPS": "位置网精准定位",
};

export function getLocationType(type?: string) {
  const normalizedType = `${type ?? ""}`.replace(/_s$/i, "");
  return LOCATION_TYPE_LABELS[normalizedType] ?? "未知";
}
