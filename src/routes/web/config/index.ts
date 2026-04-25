import { Hono } from "hono";
import providers from "./providers";
import models from "./models";
import agents from "./agents";
import skills from "./skills";
import mcp from "./mcp";

const app = new Hono();
app.route("/", providers);
app.route("/", models);
app.route("/", agents);
app.route("/", skills);
app.route("/", mcp);

export default app;
