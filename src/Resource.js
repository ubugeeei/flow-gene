/* @flow strict */

import {
  cell,
  transaction,
} from "flow-cell/server";
import type {
  Cell,
} from "flow-cell/server";
import type {
  Resource,
  ResourceOptions,
  ResourceState,
} from "./Types";

export class GeneResource<T> implements Resource<T> {
  status: Cell<ResourceState<T>>;
  _promise: Promise<T>;

  constructor(input: Promise<T> | T, options?: ResourceOptions<T>): void {
    const pendingState: ResourceState<T> = { status: "pending" };
    const initialState: ResourceState<T> = options?.initialState ?? pendingState;
    this.status = cell(initialState, {
      key: options?.key,
      name: options?.name,
    });

    this._promise = Promise.resolve(input).then(
      value => {
        transaction(() => {
          this.status.set({ status: "fulfilled", value });
        });
        return value;
      },
      error => {
        transaction(() => {
          this.status.set({ status: "rejected", error });
        });
        throw error;
      },
    );
  }

  then(onFulfilled?: any, onRejected?: any): any {
    return this._promise.then(onFulfilled, onRejected);
  }

  catch(onRejected?: any): any {
    return this._promise.catch(onRejected);
  }

  finally(onFinally?: ?() => mixed): Promise<T> {
    return onFinally == null
      ? this._promise.finally(() => {})
      : this._promise.finally(onFinally);
  }

  read(): T {
    const state = this.status.get();

    if (state.status === "fulfilled") {
      return state.value;
    }

    if (state.status === "rejected") {
      throw state.error;
    }

    throw this._promise;
  }
}

export function createResource<T>(
  promise: Promise<T>,
  options?: ResourceOptions<T>,
): Resource<T> {
  return new GeneResource(promise, options);
}

export function resolvedResource<T>(
  value: T,
  options?: ResourceOptions<T>,
): Resource<T> {
  return new GeneResource(Promise.resolve(value), {
    ...options,
    initialState: { status: "fulfilled", value },
  });
}

export function rejectedResource<T>(
  error: mixed,
  options?: ResourceOptions<T>,
): Resource<T> {
  return new GeneResource((Promise.reject(error) as Promise<T>), {
    ...options,
    initialState: { status: "rejected", error },
  });
}
