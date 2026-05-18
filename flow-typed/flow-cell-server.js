/* @flow */

declare module "flow-cell/server" {
  declare export type Listener = () => void;
  declare export type Unsubscribe = () => void;

  declare export interface Readable<+T> {
    get(): T;
    subscribe(listener: Listener): Unsubscribe;
  }

  declare export interface Writable<T> extends Readable<T> {
    set(value: T): void;
    update(fn: (value: T) => T): void;
  }

  declare export type Cell<T> = Writable<T>;
  declare export type Derived<+T> = Readable<T>;
  declare export type Getter = <T>(readable: Readable<T>) => T;
  declare export type NodeOptions = {
    +key?: string,
    +name?: string,
  };

  declare export function cell<T>(initial: T, options?: NodeOptions): Cell<T>;
  declare export function transaction(fn: () => void): void;
  declare export function derived<T>(fn: (get: Getter) => T, options?: NodeOptions): Derived<T>;
}
