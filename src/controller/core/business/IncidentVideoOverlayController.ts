/*
 * @Description: 灾情现场视频弹出控制器：点击调派后，以 OpenLayers Overlay 将原生 <video> 弹窗绑定到灾情经纬度坐标附近。
 * @FilePath: src\controller\core\business\IncidentVideoOverlayController.ts
 */
import Overlay from 'ol/Overlay';
import type OlMap from 'ol/Map';
import { fromLonLat } from 'ol/proj';

/** 现场视频服务目录；必须以 / 结尾，视频由浏览器通过 HTTP Range 分段加载 */
const VIDEO_BASE_URL = 'http://192.168.169.58:8090/video/';
/** 现场视频候选文件；未明确指定视频时，每次弹窗从中随机选择一个。 */
const VIDEO_FILE_CANDIDATES = [
  'MVI_39511.mp4',
  'MVI_39401.mp4',
  'MVI_39371.mp4',
  'MVI_39361.mp4',
  'MVI_39311.mp4',
  'MVI_39271.mp4',
  'MVI_39211.mp4',
  'MVI_39051.mp4',
  'MVI_39031.mp4',
  'iii.mp4',
] as const;
/** 左右视频框与灾情锚点的水平间距。 */
const PANEL_HORIZONTAL_OFFSET_PIXELS = 96;
/** 视频框相对锚点的垂直错位量：左侧向上，右侧向下。 */
const PANEL_VERTICAL_OFFSET_PIXELS = 170;

const pickRandomVideoPath = (excludedPath?: string): string => {
  const candidates = excludedPath
    ? VIDEO_FILE_CANDIDATES.filter(path => path !== excludedPath)
    : VIDEO_FILE_CANDIDATES;
  return candidates[Math.floor(Math.random() * candidates.length)];
};

/** 随机抽取两个不同的视频；显式指定视频时将其作为左侧视频。 */
const pickVideoPair = (preferredPath?: string): [string, string] => {
  const leftPath = preferredPath?.trim() || pickRandomVideoPath();
  return [leftPath, pickRandomVideoPath(leftPath)];
};

type VideoPanelSide = 'left' | 'right';

type SingleVideoSession = {
  overlay: Overlay;
  video: HTMLVideoElement;
  timerId: number;
  resolve: () => void;
};

/**
 * 将每次请求携带的视频相对路径拼接到固定视频服务目录。
 * 同时限制结果必须仍位于 /video/ 下，避免路径穿越或跳转到其他域名。
 */
const resolveVideoHttpUrl = (videoPath: string): string | null => {
  if (typeof videoPath !== 'string') return null;
  const normalizedPath = videoPath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalizedPath) return null;

  const url = new URL(normalizedPath, VIDEO_BASE_URL);
  return url.href.startsWith(VIDEO_BASE_URL) ? url.href : null;
};

/**
 * 探测服务器是否支持 HTTP Range（Accept-Ranges: bytes）。
 * 大视频的可分段加载依赖浏览器对 <video src> 自动发起的 Range 请求，
 * 服务器不支持时仅告警提示（本功能不做后端转流，由部署侧保证）。
 */
const probeHttpRangeSupport = async (url: string): Promise<void> => {
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-1' } });
    const supported = response.status === 206
      || response.headers.get('accept-ranges')?.toLowerCase() === 'bytes';
    if (!supported) {
      console.warn(
        '[IncidentVideoOverlay] 服务器未支持 HTTP Range（Accept-Ranges: bytes），大视频将整段下载而无法分段加载',
      );
    }
  } catch (error) {
    console.warn('[IncidentVideoOverlay] HTTP Range 探测失败，无法确认分段加载能力', error);
  }
};

/**
 * 灾情现场视频弹出控制器。
 * 以原生 <video>（HTTP 直链，服务器需支持 Range 分段加载）创建 OpenLayers Overlay，
 * 绑定到指定 EPSG:4326 经纬度坐标，随地图缩放平移跟随灾情点。
 */
export class IncidentVideoOverlayController {
  /** 同一地图只保留一组双视频弹窗，避免不同业务入口重复叠加。 */
  private static readonly activeControllerByMap = new WeakMap<OlMap, IncidentVideoOverlayController>();

  private readonly map: OlMap;
  private readonly overlays = new Map<VideoPanelSide, Overlay>();
  private readonly videos = new Map<VideoPanelSide, HTMLVideoElement>();
  private completionResolver: (() => void) | null = null;
  private readonly singleSessions = new Map<string, SingleVideoSession>();

  constructor(map: OlMap) {
    this.map = map;
  }

  /**
   * 在指定经纬度（EPSG:4326）锚点左右各弹出一个视频。
   * 未传 videoPath 时随机选择两个不同视频；传入时作为左侧视频，右侧仍随机且不重复。
   */
  public show(longitude: number, latitude: number, videoPath?: string): void {
    void this.play(longitude, latitude, videoPath);
  }

  /** 播放一组双视频，并在两侧均播放结束或被关闭后完成。 */
  public play(longitude: number, latitude: number, videoPath?: string): Promise<void> {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      console.warn('[IncidentVideoOverlay] 警情坐标无效，跳过视频弹出');
      return Promise.resolve();
    }

    const videoPaths = pickVideoPair(videoPath);
    const videoUrls = videoPaths.map(resolveVideoHttpUrl);
    if (videoUrls.some(url => !url)) {
      console.warn('[IncidentVideoOverlay] 视频相对路径无效，跳过视频弹出：', videoPaths);
      return Promise.resolve();
    }
    console.info('[IncidentVideoOverlay] 播放现场视频：', videoUrls);

    const activeController = IncidentVideoOverlayController.activeControllerByMap.get(this.map);
    if (activeController && activeController !== this) activeController.close();
    this.close();
    IncidentVideoOverlayController.activeControllerByMap.set(this.map, this);

    return new Promise<void>((resolve) => {
      this.completionResolver = resolve;
      const position = fromLonLat([longitude, latitude]);
      (videoUrls as string[]).forEach((url, index) => {
        const side: VideoPanelSide = index === 0 ? 'left' : 'right';
        const overlay = this.createOverlay(url, side);
        this.overlays.set(side, overlay);
        this.map.addOverlay(overlay);
        overlay.setPosition(position);
      });
    });
  }

  /**
   * 在监控点附近播放一个视频。不同 checkpointKey 相互独立，可同时播放；
   * 同一 key 再次触发时会先关闭旧实例。durationMs 到时无条件自动关闭。
   */
  public playSingle(
    checkpointKey: string,
    longitude: number,
    latitude: number,
    durationMs: number,
    videoPath?: string,
  ): Promise<void> {
    if (!checkpointKey || !Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      console.warn('[IncidentVideoOverlay] 监控点参数无效，跳过视频弹出');
      return Promise.resolve();
    }
    const url = resolveVideoHttpUrl(videoPath?.trim() || pickRandomVideoPath());
    if (!url) return Promise.resolve();

    this.closeSingle(checkpointKey);
    return new Promise<void>((resolve) => {
      const { overlay, video } = this.createSingleOverlay(url, () => this.closeSingle(checkpointKey));
      const timerId = window.setTimeout(
        () => this.closeSingle(checkpointKey),
        Math.max(0, durationMs),
      );
      this.singleSessions.set(checkpointKey, { overlay, video, timerId, resolve });
      this.map.addOverlay(overlay);
      overlay.setPosition(fromLonLat([longitude, latitude]));
      void probeHttpRangeSupport(video.src);
    });
  }

  /** 关闭左右两个弹窗并彻底销毁 overlay 与视频元素，释放内存。 */
  public close(): void {
    [...this.singleSessions.keys()].forEach((key) => this.closeSingle(key));
    for (const overlay of this.overlays.values()) {
      this.map.removeOverlay(overlay);
    }
    this.overlays.clear();
    this.releaseVideos();
    this.releaseActiveController();
    this.resolveCompletion();
  }

  /** 销毁控制器：从地图移除 overlay 并释放视频资源。 */
  public destroy(): void {
    this.close();
  }

  /** 仅关闭用户点击的单侧视频面板，另一侧保持播放。 */
  private closePanel(side: VideoPanelSide): void {
    const overlay = this.overlays.get(side);
    if (overlay) {
      this.map.removeOverlay(overlay);
      this.overlays.delete(side);
    }

    const video = this.videos.get(side);
    if (video) {
      this.releaseVideo(video);
      this.videos.delete(side);
    }

    if (this.overlays.size === 0) {
      this.releaseActiveController();
      this.resolveCompletion();
    }
  }

  private resolveCompletion(): void {
    const resolve = this.completionResolver;
    this.completionResolver = null;
    resolve?.();
  }

  private closeSingle(checkpointKey: string): void {
    const session = this.singleSessions.get(checkpointKey);
    if (!session) return;
    window.clearTimeout(session.timerId);
    this.map.removeOverlay(session.overlay);
    this.releaseVideo(session.video);
    this.singleSessions.delete(checkpointKey);
    session.resolve();
  }

  private releaseActiveController(): void {
    if (IncidentVideoOverlayController.activeControllerByMap.get(this.map) === this) {
      IncidentVideoOverlayController.activeControllerByMap.delete(this.map);
    }
  }

  private createOverlay(videoUrl: string, side: VideoPanelSide): Overlay {
    const container = document.createElement('div');
    // 动态创建的元素不带 Vue scoped 属性，样式以内联方式声明
    Object.assign(container.style, {
      position: 'relative',
      width: '320px',
      border: '1px solid rgba(148, 163, 184, 0.35)',
      borderRadius: '8px',
      background: '#050b14',
      boxShadow: '0 14px 36px rgba(2, 6, 23, 0.58)',
    } satisfies Partial<CSSStyleDeclaration>);

    const header = document.createElement('div');
    Object.assign(header.style, {
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      height: '40px',
      padding: '0 10px 0 14px',
      borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
      borderRadius: '8px 8px 0 0',
      background: 'linear-gradient(180deg, #162234 0%, #0b1320 100%)',
      color: '#f8fafc',
    } satisfies Partial<CSSStyleDeclaration>);

    const title = document.createElement('span');
    title.textContent = '实时监控视频';
    Object.assign(title.style, {
      fontSize: '16px',
      fontWeight: '600',
      letterSpacing: '1px',
    } satisfies Partial<CSSStyleDeclaration>);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', '关闭实时监控视频');
    closeButton.textContent = '×';
    Object.assign(closeButton.style, {
      width: '26px',
      height: '26px',
      border: '0',
      padding: '0',
      background: 'transparent',
      color: '#cbd5e1',
      fontSize: '24px',
      lineHeight: '1',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    closeButton.addEventListener('click', () => this.closePanel(side));
    header.append(title, closeButton);

    const video = document.createElement('video');
    video.src = videoUrl;
    video.autoplay = true;
    video.muted = true; // 浏览器自动播放策略要求静音
    video.playsInline = true;
    video.preload = 'auto';
    Object.assign(video.style, {
      display: 'block',
      width: '320px',
      height: '180px',
      background: '#000',
      borderRadius: '0 0 8px 8px',
      objectFit: 'cover',
    } satisfies Partial<CSSStyleDeclaration>);
    // 通过内联样式表隐藏浏览器原生控件（播放/进度条/全屏等），避免 DOM 注入
    const hideControlsStyle = document.createElement('style');
    hideControlsStyle.textContent = [
      'video::-webkit-media-controls-panel { display: none !important; }',
      'video::-webkit-media-controls-enclosure { display: none !important; }',
      'video::-moz-media-controls { display: none !important; }',
      'video::-ms-media-controls { display: none !important; }',
    ].join(' ');
    container.appendChild(hideControlsStyle);
    video.addEventListener('error', () => {
      console.error('[IncidentVideoOverlay] 视频加载失败：', video.src);
      this.closePanel(side);
    });
    // 播放结束仅关闭对应一侧的弹窗并释放该视频资源
    video.addEventListener('ended', () => this.closePanel(side));

    const pointer = document.createElement('span');
    Object.assign(pointer.style, {
      position: 'absolute',
      top: '50%',
      width: '0',
      height: '0',
      transform: 'translateY(-50%)',
      borderTop: '12px solid transparent',
      borderBottom: '12px solid transparent',
      ...(side === 'left'
        ? { right: '-12px', borderLeft: '12px solid #0b1320' }
        : { left: '-12px', borderRight: '12px solid #0b1320' }),
    } satisfies Partial<CSSStyleDeclaration>);

    container.append(header, video, pointer);
    this.videos.set(side, video);

    // 探测仅消耗 2 字节（Range: bytes=0-1），用于确认服务器分段加载能力
    void probeHttpRangeSupport(video.src);

    return new Overlay({
      element: container,
      positioning: side === 'left' ? 'center-right' : 'center-left',
      offset: side === 'left'
        ? [-PANEL_HORIZONTAL_OFFSET_PIXELS, -PANEL_VERTICAL_OFFSET_PIXELS]
        : [PANEL_HORIZONTAL_OFFSET_PIXELS, PANEL_VERTICAL_OFFSET_PIXELS],
      stopEvent: true,
      autoPan: { animation: { duration: 250 }, margin: 32 },
    });
  }

  private createSingleOverlay(
    videoUrl: string,
    onClose: () => void,
  ): { overlay: Overlay; video: HTMLVideoElement } {
    const container = document.createElement('div');
    Object.assign(container.style, {
      position: 'relative',
      width: '280px',
      border: '1px solid rgba(148, 163, 184, 0.35)',
      borderRadius: '8px',
      background: '#050b14',
      boxShadow: '0 12px 30px rgba(2, 6, 23, 0.5)',
    } satisfies Partial<CSSStyleDeclaration>);

    const header = document.createElement('div');
    Object.assign(header.style, {
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: '34px',
      padding: '0 8px 0 12px',
      borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
      background: 'linear-gradient(180deg, #162234 0%, #0b1320 100%)',
      color: '#f8fafc',
    } satisfies Partial<CSSStyleDeclaration>);

    const title = document.createElement('span');
    title.textContent = '实时监控视频';
    Object.assign(title.style, { fontSize: '14px', fontWeight: '600' });
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', '关闭实时监控视频');
    Object.assign(closeButton.style, {
      width: '24px',
      height: '24px',
      border: '0',
      padding: '0',
      background: 'transparent',
      color: '#cbd5e1',
      fontSize: '22px',
      lineHeight: '1',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    closeButton.addEventListener('click', onClose);
    header.append(title, closeButton);

    const video = document.createElement('video');
    video.src = videoUrl;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    Object.assign(video.style, {
      display: 'block',
      width: '280px',
      height: '158px',
      background: '#000',
      borderRadius: '0 0 8px 8px',
      objectFit: 'cover',
    } satisfies Partial<CSSStyleDeclaration>);
    const status = document.createElement('div');
    status.textContent = '视频加载中…';
    status.setAttribute('role', 'status');
    Object.assign(status.style, {
      position: 'absolute',
      inset: '34px 0 0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#cbd5e1',
      fontSize: '13px',
      background: '#050b14',
      borderRadius: '0 0 8px 8px',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    video.addEventListener('playing', () => {
      status.style.display = 'none';
    });
    video.addEventListener('error', () => {
      console.error('[IncidentVideoOverlay] 监控点视频加载失败：', video.src, video.error);
      // 加载失败也保留到正常展示时间结束，避免弹窗一闪而过。
      status.textContent = '视频加载失败，请检查视频源';
      status.style.display = 'flex';
    });

    const pointer = document.createElement('span');
    Object.assign(pointer.style, {
      position: 'absolute',
      left: '-10px',
      bottom: '18px',
      width: '0',
      height: '0',
      borderTop: '9px solid transparent',
      borderBottom: '9px solid transparent',
      borderRight: '10px solid #0b1320',
    } satisfies Partial<CSSStyleDeclaration>);
    container.append(header, video, status, pointer);

    return {
      video,
      overlay: new Overlay({
        element: container,
        positioning: 'bottom-left',
        offset: [18, -18],
        stopEvent: true,
        autoPan: false,
      }),
    };
  }

  private releaseVideos(): void {
    for (const video of this.videos.values()) {
      this.releaseVideo(video);
    }
    this.videos.clear();
  }

  private releaseVideo(video: HTMLVideoElement): void {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}
