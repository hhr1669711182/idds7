import { ref, computed } from "vue";
import type { CarItem } from "@/composables/useCarFeatures";
import type { JRAlarmData } from "../amap/mapData.ts";
import dayjs from "dayjs";

type AlarmDetailRow = {
  label: string;
  value?: string | number | null;
  visible?: boolean;
};

const joinText = (...values: Array<string | number | null | undefined>) =>
  values.filter((value) => value !== null && value !== undefined && value !== "").join("");

const hasText = (value: string | number | null | undefined) =>
  value !== null && value !== undefined && value !== "";

const formatCoordinateText = (lng?: string | number | null, lat?: string | number | null) => {
  if (!hasText(lng) && !hasText(lat)) return "";
  if (!hasText(lng)) return String(lat);
  if (!hasText(lat)) return String(lng);
  return `${lng}, ${lat}`;
};

const CAR_TYPE_LABELS: Record<CarItem["carType"], string> = {
  fireEngine: "消防车",
  rescue: "救援车",
  ladder: "云梯车",
  command: "指挥车",
};

const CAR_STATUS_LABELS: Record<NonNullable<CarItem["status"]>, string> = {
  online: "在线",
  offline: "离线",
  maintenance: "维修中",
};

export const carTypeLabel = (t?: CarItem["carType"]) => (t ? CAR_TYPE_LABELS[t] ?? t : "");
export const carStatusLabel = (s?: CarItem["status"]) => (s ? CAR_STATUS_LABELS[s] ?? s : "");

export function useMapPopups() {
  // === 队站 (Fire Station) Popup ===
  const firePopupRef = ref<HTMLElement | null>(null);
  const firePopupVisible = ref(false);
  const fireSelected = ref<any | null>(null);

  const closeFirePopup = () => {
    firePopupVisible.value = false;
    fireSelected.value = null;
  };

  // === 在线车辆 (Car) Popup ===
  const carPopupRef = ref<HTMLElement | null>(null);
  const carPopupVisible = ref(false);
  const carSelected = ref<CarItem | null>(null);

  const closeCarPopup = () => {
    carPopupVisible.value = false;
    carSelected.value = null;
  };

  // === 警情规划 (Alarm) Popup ===
  const alarmPopupRef = ref<HTMLElement | null>(null);
  const alarmPopupVisible = ref(false);
  const alarmData = ref<any>(null);

  const alarmPopupTitle = computed(() => alarmData.value?.aoi || alarmData.value?.address || "警情详情");
  const alarmPopupRows = computed<AlarmDetailRow[]>(() => {
    const data = alarmData.value;
    return [
      { label: "地址", value: data?.address },
      { label: "状态", value: data?.status },
      { label: "时间", value: data?.alarmTime },
      { label: "类型", value: data?.alarmType },
      { label: "燃烧物", value: data?.burningMaterial },
      { label: "重点单位", value: data?.keyUnit },
      { label: "辖区", value: joinText(data?.district, data?.street) },
      { label: "坐标", value: formatCoordinateText(data?.lng, data?.lat) },
      { label: "详情", value: data?.description },
    ];
  });

  const closeAlarmPopup = () => {
    alarmPopupVisible.value = false;
    alarmData.value = null;
  };

  // === 今日灾情 (JRAlarm) Popup ===
  const jrAlarmPopupRef = ref<HTMLElement | null>(null);
  const jrAlarmPopupVisible = ref(false);
  const jrAlarmData = ref<JRAlarmData | null>(null);

  const jrAlarmPopupTitle = computed(() => {
    const data = jrAlarmData.value;
    const left = data?.disasterTypeLabel ?? "警情";
    const right = data?.disasterGradeLabel ?? data?.disasterGrade ?? "";
    return right ? `${left} - ${right}` : left;
  });

  const jrAlarmPopupRows = computed<AlarmDetailRow[]>(() => {
    const data = jrAlarmData.value;
    return [
      { label: "警情类型", value: data?.disasterTypeLabel },
      { label: "报警时间", value: dayjs(data?.createdAt || "").format("YYYY-MM-DD HH:mm:ss") },
      { label: "警情等级", value: data?.disasterGradeLabel ?? data?.disasterGrade },
      { label: "事发地址", value: data?.disasterAddress },
      { label: "警情编号", value: data?.incidentId },
      { label: "主管队站", value: data?.mOrgIdLabel ?? data?.mOrgId },
      { label: "坐标", value: formatCoordinateText(data?.lng, data?.lat) },
    ];
  });

  const closeJRAlarmPopup = () => {
    jrAlarmPopupVisible.value = false;
    jrAlarmData.value = null;
  };

  return {
    formatCoordinateText,
    firePopupRef,
    firePopupVisible,
    fireSelected,
    closeFirePopup,
    carPopupRef,
    carPopupVisible,
    carSelected,
    closeCarPopup,
    alarmPopupRef,
    alarmPopupVisible,
    alarmData,
    alarmPopupTitle,
    alarmPopupRows,
    closeAlarmPopup,
    jrAlarmPopupRef,
    jrAlarmPopupVisible,
    jrAlarmData,
    jrAlarmPopupTitle,
    jrAlarmPopupRows,
    closeJRAlarmPopup,
  };
}
