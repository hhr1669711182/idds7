# 独立 WS 测试控制台与 GIS 反向代理

1. 在 ids-gis-web 启动 GIS 开发服务（默认 8888）。开发 WS 地址指向 v2 单入口 ws://localhost:18080/message-client/ws，连接后首帧发送 {"action":"connect","token":"<accessToken>","clientId":"ids-seat-web"} 完成鉴权（见 integration-guide-v2.md §2）。
2. 在 ids-gis-test 执行 npm.cmd run dev。
3. 打开 http://localhost:18080/__test/ ，填写测试身份和 Token，选择状态并写入。
4. 点击“打开 GIS 地图”，打开 http://localhost:18080/#/map 。连接控制服务并推送消息。

控制台和代理地图同源，共用 localStorage。写入会通过浏览器 storage 事件通知已打开的地图。请勿使用 8888 地图测试共享状态；原有 8888 的 localStorage 不会迁移，需要在新控制台重新填写。

/__test/ 是控制台；其余 HTTP 请求代理到 GIS_TARGET（默认 http://localhost:8888），包括 Vite 模块、地图资源及业务接口。模拟 WS 地址和 /mock-control 由测试服务处理，其他 WS 升级代理到 Vite，用于热更新。

可设置 GIS_TARGET、PORT、HOST 环境变量。更改 PORT 时需要同时调整 GIS 的开发 WS 配置。服务仅供可信本地开发环境使用。

不需要 ids-gis-web 中的桥接路由、桥接 HTML 或任何 .ws-* 临时目录。生产环境配置不受影响。
