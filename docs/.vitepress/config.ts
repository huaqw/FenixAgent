import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Remote Control Server",
  description: "AI Agent 控制面板 — 基于 Hono + Bun 的远程 Agent 管理平台",
  lang: "zh-CN",
  markdown: {
    theme: {
      light: "github-light",
      dark: "github-light",
    },
  },
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }],
    ["meta", { name: "theme-color", content: "#e8853b" }],
    ["meta", { name: "og:type", content: "website" }],
    ["meta", { name: "og:locale", content: "zh_CN" }],
  ],
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "RCS",
    nav: [
      { text: "用户文档", link: "/user/" },
      { text: "开发者文档", link: "/developer/architecture/overview" },
    ],
    sidebar: {
      "/user/": [
        {
          text: "首页",
          items: [
            { text: "产品介绍", link: "/user/" },
          ],
        },
        {
          text: "配置",
          items: [
            { text: "大模型配置", link: "/user/models/" },
            { text: "Agent 管理", link: "/user/agents/" },
          ],
        },
        {
          text: "功能",
          items: [
            { text: "定时任务", link: "/user/scheduled-tasks/" },
            { text: "Skills", link: "/user/skills/" },
            { text: "MCP", link: "/user/mcp/" },
            { text: "知识库", link: "/user/knowledge-base/" },
            { text: "智能体编排", link: "/user/workflow/" },
          ],
        },
        {
          text: "帮助",
          items: [
            { text: "故障排查", link: "/user/troubleshooting/" },
          ],
        },
      ],
      "/developer/": [
        {
          text: "架构设计",
          items: [
            { text: "概览", link: "/developer/architecture/overview" },
            { text: "ACP 协议", link: "/developer/architecture/acp-protocol" },
            { text: "认证授权", link: "/developer/architecture/auth" },
            { text: "事件总线", link: "/developer/architecture/event-bus" },
          ],
        },
        {
          text: "API 参考",
          items: [
            { text: "Config API", link: "/developer/api/config" },
            { text: "Sessions API", link: "/developer/api/sessions" },
            { text: "Files API", link: "/developer/api/files" },
            { text: "Environments API", link: "/developer/api/environments" },
          ],
        },
        {
          text: "贡献指南",
          items: [
            { text: "开发指南", link: "/developer/contributing" },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/konghayao/remote-control-server" },
    ],
    search: {
      provider: "local",
      options: {
        translations: {
          button: {
            buttonText: "Search",
            buttonAriaLabel: "Search docs",
          },
          modal: {
            noResultsText: "No results found",
            resetButtonTitle: "Clear",
            footer: {
              selectText: "Select",
              navigateText: "Navigate",
              closeText: "Close",
            },
          },
        },
      },
    },
    editLink: {
      pattern: "https://github.com/konghayao/remote-control-server/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    outline: {
      level: [2, 3],
      label: "On This Page",
    },
    docFooter: {
      prev: "Prev",
      next: "Next",
    },
    returnToTopLabel: "Back to top",
    sidebarMenuLabel: "Menu",
    darkModeSwitchLabel: "Theme",
    lightModeSwitchTitle: "Switch to light theme",
    darkModeSwitchTitle: "Switch to dark theme",
  },
});
