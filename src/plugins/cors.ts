import Elysia from "elysia";
import cors from "@elysiajs/cors";

export const corsPlugin = new Elysia({ name: "cors" }).use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
