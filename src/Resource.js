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

function createStatusCell<T>(options?: ResourceOptions<T>): Cell<ResourceState<T>> {
  const pendingState: ResourceState<T> = { status: "pending" };
  return cell(options?.initialState ?? pendingState, {
    key: options?.key,
    name: options?.name,
  });
}

function settleIntoStatus<T>(
  input: Promise<T> | T,
  status: Cell<ResourceState<T>>,
): Promise<T> {
  return Promise.resolve(input).then(
    value => {
      transaction(() => {
        status.set({ status: "fulfilled", value });
      });
      return value;
    },
    error => {
      transaction(() => {
        status.set({ status: "rejected", error });
      });
      throw error;
    },
  );
}

function readResourceState<T>(
  status: Cell<ResourceState<T>>,
  promise: Promise<T>,
): T {
  const state = status.get();

  if (state.status === "fulfilled") {
    return state.value;
  }

  if (state.status === "rejected") {
    throw state.error;
  }

  throw promise;
}

function createGeneResource<T>(
  input: Promise<T> | T,
  options?: ResourceOptions<T>,
): Resource<T> {
  const status = createStatusCell(options);
  const promise = settleIntoStatus(input, status);
  const resource: Resource<T> = {
    status,
    then: (onFulfilled?: any, onRejected?: any): any =>
      promise.then(onFulfilled, onRejected),
    catch: (onRejected?: any): any =>
      promise.catch(onRejected),
    finally: (onFinally?: ?() => mixed): Promise<T> =>
      onFinally == null ? promise.finally(() => {}) : promise.finally(onFinally),
    read: (): T => readResourceState(status, promise),
  };

  return Object.freeze(resource);
}

export function GeneResource<T>(
  input: Promise<T> | T,
  options?: ResourceOptions<T>,
): Resource<T> {
  return createGeneResource(input, options);
}

export function createResource<T>(
  promise: Promise<T>,
  options?: ResourceOptions<T>,
): Resource<T> {
  return createGeneResource(promise, options);
}

export function resolvedResource<T>(
  value: T,
  options?: ResourceOptions<T>,
): Resource<T> {
  return createGeneResource(Promise.resolve(value), {
    ...options,
    initialState: { status: "fulfilled", value },
  });
}

export function rejectedResource<T>(
  error: mixed,
  options?: ResourceOptions<T>,
): Resource<T> {
  return createGeneResource((Promise.reject(error) as Promise<T>), {
    ...options,
    initialState: { status: "rejected", error },
  });
}
