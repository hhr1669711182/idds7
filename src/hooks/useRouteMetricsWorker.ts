/*
 * @Author: huanghuanrong
 * @Date: 2026-05-13 18:03:50
 * @LastEditTime: 2026-05-13 18:28:12
 * @LastEditors: huanghuanrong
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\hooks\useRouteMetricsWorker.ts
 */
import { computeRouteMetrics } from "../baseComponent/amap/routeMetrics";
import type { LngLat, RouteMetrics } from "../baseComponent/amap/routeMetrics";

type PendingTask = {
  resolve: (metrics: RouteMetrics) => void;
  reject: (error: Error) => void;
};

export const createRouteMetricsWorker = () => {
  let worker: Worker | null = null;
  let requestId = 0;
  const pending = new Map<number, PendingTask>();

  const ensureWorker = () => {
    if (worker || typeof Worker === "undefined") return worker;
    worker = new Worker(new URL("@/baseComponent/amap/routeMetrics.worker.ts", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (event: MessageEvent<{ id: number; metrics: RouteMetrics }>) => {
      const task = pending.get(event.data.id);
      if (!task) return;
      pending.delete(event.data.id);
      task.resolve(event.data.metrics);
    };

    worker.onerror = (event) => {
      const error = new Error(event.message || "Route metrics worker failed");
      pending.forEach((task) => task.reject(error));
      pending.clear();
    };

    return worker;
  };

  const compute = (path: LngLat[], lastMileMeters = 1000) => {
    const currentWorker = ensureWorker();
    if (!currentWorker) {
      return Promise.resolve(computeRouteMetrics(path, lastMileMeters));
    }

    const id = ++requestId;
    return new Promise<RouteMetrics>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      currentWorker.postMessage({ id, path, lastMileMeters });
    });
  };

  const destroy = () => {
    pending.forEach((task) => task.reject(new Error("Route metrics worker destroyed")));
    pending.clear();
    worker?.terminate();
    worker = null;
  };

  return { compute, destroy };
};
