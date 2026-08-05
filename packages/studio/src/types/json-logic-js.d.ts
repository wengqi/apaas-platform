declare module 'json-logic-js' {
  interface JsonLogic {
    apply(rule: unknown, data?: Record<string, unknown>): unknown;
    addOperation(name: string, fn: (...args: unknown[]) => unknown): void;
    uses_data(rule: unknown, data?: Record<string, unknown>): boolean;
  }
  const jsonLogic: JsonLogic;
  export default jsonLogic;
}
