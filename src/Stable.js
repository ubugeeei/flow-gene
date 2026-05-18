/* @flow strict */

export function stableStringify(value: mixed): string {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const object: { +[string]: mixed } = (value as any);
  const keys = Object.keys(object).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
}
