/*
 * BIM\building3d.js
 *
 * Load gis:view_env_building from GeoServer (WFS JSON) and extrude polygons
 * into Three.js meshes with height = met_upfloors * floorHeightMeters.
 * Default floor height is 3 meters (overridable).
 */
import * as THREE from "three";
import { lonLatToLocalCoord } from "./module/commonThree.js";
import { commonSetting } from "./module/commonSetting.js";

const DEFAULT_FLOOR_HEIGHT_M = 3;
const SCENE_UNIT = 0.01; // 1 meter -> 0.01 Three units (matches commonThree.js)

/**
 * Load gis:view_env_building features from GeoServer via WFS.
 * Endpoint uses the same dev proxy as createWhiteBuildings.js: /geoserver/{ws}/ows
 */
export async function loadEnvBuildings(options = {}) {
  const ws = options.workspace || commonSetting.gisWorkspace;
  const layer = options.layerName || "gis:view_env_building";
  const geom = options.geomName || "geom";
  const limit = options.limit || 500;

  const bbox = options.bbox || defaultBbox();
  const body = `
    <wfs:GetFeature service="WFS" version="1.1.0" outputFormat="json"
      xmlns:wfs="http://www.opengis.net/wfs"
      xmlns:ogc="http://www.opengis.net/ogc"
      xmlns:gml="http://www.opengis.net/gml">
      <wfs:Query typeName="${layer}">
        <ogc:Filter>
          <ogc:BBOX>
            <ogc:PropertyName>${geom}</ogc:PropertyName>
            <gml:Envelope srsName="EPSG:4326">
              <gml:lowerCorner>${bbox[0]} ${bbox[1]}</gml:lowerCorner>
              <gml:upperCorner>${bbox[2]} ${bbox[3]}</gml:upperCorner>
            </gml:Envelope>
          </ogc:BBOX>
        </ogc:Filter>
      </wfs:Query>
    </wfs:GetFeature>`;

  const url = `geoserver/${ws}/ows?maxFeatures=${limit}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body,
  });
  if (!res.ok) throw new Error(`WFS request failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.features || [];
}

function defaultBbox() {
  const lon = commonSetting.basePoint.baseLon;
  const lat = commonSetting.basePoint.baseLat;
  const d = 0.005; // ~550m box
  return [lon - d, lat - d, lon + d, lat + d];
}

/**
 * Extrude features into Three meshes and add them to `group`.
 * Returns the meshes so the caller can clean up on unmount.
 */
export function createExtrudedBuildings(features, group, options = {}) {
  const floorHeight = options.floorHeightMeters ?? DEFAULT_FLOOR_HEIGHT_M;
  const material = new THREE.MeshLambertMaterial({
    color: options.color ?? 0xf5f5f5,
    transparent: true,
    opacity: options.opacity ?? 0.85,
    side: THREE.DoubleSide,
  });

  const meshes = [];
  for (const feature of features) {
    const floors = parseFloorCount(feature.properties && feature.properties.met_upfloors);
    if (floors <= 0) continue;
    const polygons = toPolygonRings(feature.geometry);
    for (const ring of polygons) {
      if (!ring || ring.length < 3) continue;
      const shape = new THREE.Shape(
        ring.map(([lon, lat]) => lonLatToLocalCoord(lon, lat))
      );
      const depth = floors * floorHeight * SCENE_UNIT;
      const geom = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
      const mesh = new THREE.Mesh(geom, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        kind: "env-building",
        feature,
        floorCount: floors,
        heightMeters: floors * floorHeight,
      };
      group.add(mesh);
      meshes.push(mesh);
    }
  }
  return meshes;
}

function parseFloorCount(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function toPolygonRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.map((poly) => poly[0]);
  return [];
}