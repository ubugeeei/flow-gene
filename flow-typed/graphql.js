/* @flow */

declare module "graphql" {
  declare export function parse(source: string): any;
  declare export function print(document: any): string;
}

declare class FormData {
  entries(): Iterator<[string, mixed]>;
  set(name: string, value: mixed): void;
}

declare class AbortSignal {}
