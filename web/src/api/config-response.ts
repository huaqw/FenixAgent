/** Config 路由成功响应结构 */
export interface ConfigOkResponse<T> {
  success: true;
  data: T;
}

/** 从 config 路由响应中解包 data，非 success 时返回 null */
export function unwrapConfigData<T>(response: unknown): T | null {
  if (
    response &&
    typeof response === "object" &&
    "success" in response &&
    (response as { success: unknown }).success === true
  ) {
    return (response as ConfigOkResponse<T>).data;
  }
  return null;
}
