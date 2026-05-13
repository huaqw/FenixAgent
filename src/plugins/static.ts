import Elysia from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, "../../web/dist");
const webDir = existsSync(resolve(distDir, "index.html")) ? distDir : resolve(__dirname, "../../web");

export const ctrlStaticPlugin = new Elysia({ name: "ctrl-static" })
  .use(
    staticPlugin({
      assets: webDir,
      prefix: "/ctrl",
      indexHTML: true,
    })
  )
  // /ctrl/:sessionId/user/* → redirect to file preview API (for iframe embedding)
  .get("/ctrl/:sessionId/user/:filePath", ({ params, redirect }) => {
    return redirect(`/web/sessions/${params.sessionId}/user/${params.filePath}?preview=true`);
  });
