import Elysia from "elysia";

export const errorPlugin = new Elysia({ name: "error-handler" }).onError(
  ({ error, set, code }) => {
    const status = code === "NOT_FOUND" ? 404 : code === "VALIDATION" ? 400 : 500;
    const type =
      code === "NOT_FOUND"
        ? "NOT_FOUND"
        : code === "VALIDATION"
          ? "VALIDATION_ERROR"
          : "INTERNAL_ERROR";
    const message =
      error instanceof Error ? error.message : String(error);

    set.status = status;
    return { error: { type, message } };
  }
);
