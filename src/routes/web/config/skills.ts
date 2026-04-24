import { Hono } from "hono";
import { sessionAuth } from "../../../auth/middleware";
import {
  listSkills,
  getSkill,
  setSkill,
  deleteSkill,
  enableSkill,
  disableSkill,
} from "../../../services/skill";

const app = new Hono();

function successResponse(data: unknown) {
  return { success: true, data };
}

function errorResponse(code: string, message: string) {
  return { success: false, error: { code, message } };
}

async function handleList(c: any) {
  const skills = await listSkills();
  return c.json(successResponse({ skills }));
}

async function handleGet(c: any, body: { name?: string }) {
  if (!body.name) {
    return c.json(errorResponse("VALIDATION_ERROR", "Missing 'name' field"), 400);
  }
  const skill = await getSkill(body.name);
  if (!skill) {
    return c.json(errorResponse("NOT_FOUND", `Skill '${body.name}' not found`), 404);
  }
  return c.json(successResponse(skill));
}

async function handleSet(c: any, body: { name?: string; data?: { description: string; content: string; metadata?: Record<string, string> } }) {
  if (!body.name) {
    return c.json(errorResponse("VALIDATION_ERROR", "Missing 'name' field"), 400);
  }
  if (!body.data || !body.data.description || !body.data.content) {
    return c.json(errorResponse("VALIDATION_ERROR", "Missing required fields: data.description, data.content"), 400);
  }
  const result = await setSkill(body.name, body.data);
  return c.json(successResponse({ name: result.name, enabled: result.enabled }));
}

async function handleDelete(c: any, body: { name?: string }) {
  if (!body.name) {
    return c.json(errorResponse("VALIDATION_ERROR", "Missing 'name' field"), 400);
  }
  const deleted = await deleteSkill(body.name);
  if (!deleted) {
    return c.json(errorResponse("NOT_FOUND", `Skill '${body.name}' not found`), 404);
  }
  return c.json(successResponse(null));
}

async function handleEnable(c: any, body: { name?: string }) {
  if (!body.name) {
    return c.json(errorResponse("VALIDATION_ERROR", "Missing 'name' field"), 400);
  }
  const enabled = await enableSkill(body.name);
  if (!enabled) {
    return c.json(errorResponse("NOT_FOUND", `Skill '${body.name}' not found in disabled directory`), 404);
  }
  return c.json(successResponse({ name: body.name, enabled: true }));
}

async function handleDisable(c: any, body: { name?: string }) {
  if (!body.name) {
    return c.json(errorResponse("VALIDATION_ERROR", "Missing 'name' field"), 400);
  }
  const disabled = await disableSkill(body.name);
  if (!disabled) {
    return c.json(errorResponse("NOT_FOUND", `Skill '${body.name}' not found in enabled directory`), 404);
  }
  return c.json(successResponse({ name: body.name, enabled: false }));
}

type SkillBody = { action: string; name?: string; data?: { description: string; content: string; metadata?: Record<string, string> } };

app.post("/config/skills", sessionAuth, async (c) => {
  const body = await c.req.json<SkillBody>().catch((): SkillBody => ({ action: "" }));
  const { action } = body;

  switch (action) {
    case "list": return handleList(c);
    case "get": return handleGet(c, body);
    case "set": return handleSet(c, body);
    case "delete": return handleDelete(c, body);
    case "enable": return handleEnable(c, body);
    case "disable": return handleDisable(c, body);
    default:
      return c.json(errorResponse("VALIDATION_ERROR", `Unknown action: ${action}`), 400);
  }
});

export default app;
