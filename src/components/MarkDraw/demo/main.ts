/**
 * Demo 独立入口（可选）
 */
import { createApp } from "vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import DemoPage from "./DemoPage.vue";

const app = createApp(DemoPage);
app.use(ElementPlus);
app.mount("#app");
