import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import Home from "./components/Home.vue";
import RcsLayout from "./components/RcsLayout.vue";
import NotFound from "./components/NotFound.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout: RcsLayout,
  NotFound: NotFound,
  enhanceApp({ app }) {
    app.component("CustomHome", Home);
  },
} satisfies Theme;
