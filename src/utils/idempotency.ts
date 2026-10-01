/** 生成一个新的幂等键；同一次操作的重试要沿用同一个键，服务端据此返回首次结果而不是重做。 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
