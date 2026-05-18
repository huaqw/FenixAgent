import Elysia from "elysia";
import providers from "./providers";
import models from "./models";
import agents from "./agents";
import skills from "./skills";
import mcp from "./mcp";

const app = new Elysia({ name: "web-config" }).use(providers).use(models).use(agents).use(skills).use(mcp);

export default app;
