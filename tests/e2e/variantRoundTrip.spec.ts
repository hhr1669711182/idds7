import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * 单实例常驻地图的主图↔调派往返回归 E2E。
 *
 * 背景：路线 Y 把主图与调派合到同一个常驻 OLMap 实例上，两套图层状态源
 * （layersStore / dispatchMapStore）共用同一组图层，BusinessMessageRuntime 的
 * attachMap 又是单槽位（后 attach 顶掉前一个）。因此调派态的操作会污染主图态，
 * 必须验证「切回主图态后图层与业务端口都复原」。
 *
 * 覆盖两条回归：
 *  1) 图层复原：调派态点图层工具栏 → 切回主图态 → 图层集合回到主图态初始值；
 *  2) attachment 复原：调派态 → 切回主图态 → addressRobotGisSearch 能真实触发。
 */

const MAIN_SHARED = {
  v: 1,
  updatedAt: 1,
  phase: "onDuty",
  mode: "normal",
  currentAlarm: null,
  auth: { accessToken: "variant-e2e", sessionId: "variant-session" },
  user: { userId: "variant-user" },
  seat: { seatNumber: "variant-seat" },
};

const DISPATCH_SHARED = {
  ...MAIN_SHARED,
  updatedAt: 2,
  phase: "inquiry",
  mode: "flood",
  currentAlarm: { incidentId: "INC-VARIANT", lifecycleStage: "active" },
};

/** storage 事件只在跨 tab 触发：开一个同 context 的 writer tab 写入，主 page 监听。 */
async function makeWriter(context: BrowserContext): Promise<Page> {
  const writer = await context.newPage();
  await writer.route("**/__storage-writer", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html></html>" }),
  );
  await writer.goto("/__storage-writer");
  return writer;
}

/** dev server 冷启动时先预热，再取页面（与 smoke 一致）。 */
const warmup = async (page: Page) => {
  await page.goto("/#/map");
  const inputButton = page.locator(".input-search-btn");
  try {
    await inputButton.waitFor({ state: "visible", timeout: 30_000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await inputButton.waitFor({ state: "visible", timeout: 30_000 });
  }
};

/** 读取常驻 OLMap 上的 WMS 图层 id 集合（底座 setLayerId:true，图层带 id 属性）。 */
const readWmsLayerIds = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const app = (document.querySelector("#app") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const map = pinia?._s?.get("mapStore")?.map;
    if (!map?.getLayers) return [];
    return map
      .getLayers()
      .getArray()
      .map((layer: any) => layer.get("id"))
      .filter((id: unknown): id is string => typeof id === "string");
  });

test("Given 主图态 When 进调派态改图层再切回主图态 Then 图层集合复原为主图态初始值", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await warmup(page);
  const writer = await makeWriter(context);

  // 主图态初始图层集合
  await expect(page.locator(".dispatch-variant-ui")).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  const mainLayerIds = await readWmsLayerIds(page);
  expect(mainLayerIds.length).toBeGreaterThan(0);

  // 进调派态
  await writer.evaluate(
    (s) => localStorage.setItem("seat-shared-state", JSON.stringify(s)),
    DISPATCH_SHARED,
  );
  await expect(page.locator(".dispatch-variant-ui")).toHaveCount(1, { timeout: 60_000 });

  // 调派态点图层工具栏（点第二个 tile，改写共用图层的可见集合）
  const dispatchTiles = page.locator(".dispatch-layer-toolbar .tile");
  await expect(dispatchTiles.first()).toBeVisible({ timeout: 30_000 });
  const tileCount = await dispatchTiles.count();
  for (let i = 0; i < tileCount; i += 1) {
    const tile = dispatchTiles.nth(i);
    const label = (await tile.locator(".label").textContent())?.trim() ?? "";
    if (label === "消防站") {
      await tile.click();
      break;
    }
  }
  await page.waitForTimeout(1000);
  const dispatchLayerIds = await readWmsLayerIds(page);
  expect(
    dispatchLayerIds,
    "调派态图层集合应与主图态不同（否则本用例失去回归意义）",
  ).not.toEqual(mainLayerIds);

  // 切回主图态
  await writer.evaluate(
    (s) => localStorage.setItem("seat-shared-state", JSON.stringify(s)),
    { ...MAIN_SHARED, updatedAt: 3 },
  );
  await expect(page.locator(".dispatch-variant-ui")).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(1500);

  const restoredLayerIds = await readWmsLayerIds(page);
  expect(
    restoredLayerIds.slice().sort(),
    "切回主图态后应复原为主图态初始图层集合",
  ).toEqual(mainLayerIds.slice().sort());
  expect(errors, `未捕获异常：
${errors.join("\n")}`).toEqual([]);
  await writer.close();
});

test("Given 主图态 When 进调派态再切回主图态 Then 主图业务端口可再次触发", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await warmup(page);
  const writer = await makeWriter(context);

  await expect(page.locator(".dispatch-variant-ui")).toHaveCount(0, { timeout: 60_000 });

  // 进调派态
  await writer.evaluate(
    (s) => localStorage.setItem("seat-shared-state", JSON.stringify(s)),
    DISPATCH_SHARED,
  );
  await expect(page.locator(".dispatch-variant-ui")).toHaveCount(1, { timeout: 60_000 });

  // 切回主图态
  await writer.evaluate(
    (s) => localStorage.setItem("seat-shared-state", JSON.stringify(s)),
    { ...MAIN_SHARED, updatedAt: 3 },
  );
  await expect(page.locator(".dispatch-variant-ui")).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(1000);

  // 主图业务端口：attachMap 为单槽位，切回主图态须重新挂回 kind:"map"，
  // 否则 addressRobotGisSearch 被旧 attachment 的 valid() 守卫成 no-op。
  const searchResult = await page.evaluate(async () => {
    const app = (document.querySelector("#app") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const runtime = pinia?._s?.get("messageStore");
    const businessRuntime = (runtime as any)?.__businessRuntime;
    const port = businessRuntime?.port;
    if (!port?.addressRobotGisSearch) {
      return { reachable: false, reason: "runtime port 不可达" };
    }
    try {
      await port.addressRobotGisSearch({
        gis_search: { keywords: "测试地址" },
        highlight_entities: [],
        overall_confidence: 0.9,
      });
      return { reachable: true, reason: "" };
    } catch (error) {
      return { reachable: false, reason: String(error) };
    }
  });

  expect(
    searchResult.reachable,
    `主图业务端口不可用：${searchResult.reason}`,
  ).toBe(true);
  expect(errors, `未捕获异常：
${errors.join("\n")}`).toEqual([]);
  await writer.close();
});
