import { computeRouteMetrics } from "./routeMetrics";
import type { LngLat } from "./routeMetrics";

type RouteMetricsRequest = {
  id: number;
  path: LngLat[];
  lastMileMeters?: number;
};

self.onmessage = (event: MessageEvent<RouteMetricsRequest>) => {
  const { id, path, lastMileMeters } = event.data;
  self.postMessage({
    id,
    metrics: computeRouteMetrics(path, lastMileMeters),
  });
};
