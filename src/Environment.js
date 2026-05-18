/* @flow strict */

import {
  setDefaultEnvironment,
} from "./DefaultEnvironment";
import {
  executableSource,
} from "./Document";
import {
  createResource,
  resolvedResource,
} from "./Resource";
import {
  cacheKey,
  createStore,
} from "./Store";
import type {
  Cell,
} from "flow-cell/server";
import type {
  Environment as EnvironmentInterface,
  EnvironmentOptions,
  FetchContext,
  Fetcher,
  GeneStore,
  GraphQLResponse,
  HeaderMap,
  LoadOptions,
  OperationDocument,
  Resource,
  StoreSnapshot,
  SubscribeOptions,
  SubscribeSink,
  SubscriptionDocument,
  Variables,
} from "./Types";

function hasOwn(object: { +[string]: mixed }, key: string): boolean {
  return Object.hasOwn(object, key);
}

export class GraphQLResponseError extends Error {
  errors: $ReadOnlyArray<mixed>;
  response: mixed;

  constructor(errors: $ReadOnlyArray<mixed>, response: mixed): void {
    const message = errors
      .map(error => error != null && typeof error === "object" && typeof (error as any).message === "string"
        ? (error as any).message
        : String(error))
      .join("\n");
    super(message || "GraphQL response contains errors.");
    this.name = "GraphQLResponseError";
    this.errors = errors;
    this.response = response;
  }
}

function isGraphQLResponse(value: mixed): boolean {
  return (
    value != null &&
      typeof value === "object" &&
      (
      hasOwn((value as any), "data") ||
      hasOwn((value as any), "errors")
    )
  );
}

function unwrapResponse<TData>(response: GraphQLResponse<TData> | TData): TData {
  if (!isGraphQLResponse(response)) {
    return (response as any);
  }

  const graphQLResponse: GraphQLResponse<TData> = (response as any);
  if (graphQLResponse.errors != null && graphQLResponse.errors.length > 0) {
    throw new GraphQLResponseError(graphQLResponse.errors, response);
  }

  return (graphQLResponse.data as any);
}

function headersForContext(
  headers: ?(HeaderMap | ((context: FetchContext<any>) => HeaderMap)),
  context: FetchContext<any>,
): HeaderMap {
  if (typeof headers === "function") {
    return headers(context);
  }

  return headers ?? {};
}

function requestHeadersForContext(
  headers: ?(HeaderMap | ((context: FetchContext<any>) => HeaderMap)),
  context: FetchContext<any>,
): { [string]: string } {
  const requestHeaders: { [string]: string } = {
    "content-type": "application/json",
  };
  const extraHeaders = headersForContext(headers, context);

  for (const key of Object.keys(extraHeaders)) {
    requestHeaders[key] = extraHeaders[key];
  }

  return requestHeaders;
}

function createEndpointFetcher(options: EnvironmentOptions): Fetcher<any, any> {
  if (options.endpoint == null) {
    throw new Error("createEnvironment requires either fetcher or endpoint.");
  }

  const endpoint = options.endpoint;
  const fetchImpl = options.fetch ?? (globalThis as any).fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("flow-gene endpoint environments require a fetch implementation.");
  }

  return async context => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: requestHeadersForContext(options.headers, context),
      body: JSON.stringify({
        query: context.document,
        variables: context.variables,
        operationName: context.operationName,
      }),
      signal: context.signal,
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed with HTTP ${String(response.status)}.`);
    }

    return await response.json();
  };
}

function notifySink<TData>(sink: SubscribeSink<TData>, data: TData): void {
  if (typeof sink === "function") {
    sink(data);
    return;
  }

  sink.next?.(data);
}

export class GeneEnvironment {
  store: GeneStore;
  storeCell: Cell<StoreSnapshot>;
  _fetcher: Fetcher<any, any>;
  _subscriber: any;
  _inflight: Map<string, Resource<any>> = new Map();

  constructor(options?: EnvironmentOptions): void {
    const environmentOptions: EnvironmentOptions = options ?? {};
    this.store = environmentOptions.store ?? createStore({
      snapshot: environmentOptions.snapshot,
      identify: environmentOptions.identify,
    });
    this.storeCell = this.store.cell;
    this._fetcher = environmentOptions.fetcher ?? createEndpointFetcher(environmentOptions);
    this._subscriber = environmentOptions.subscriber;

    if (environmentOptions.setAsDefault !== false) {
      setDefaultEnvironment(this);
    }
  }

  execute<TData, TVariables>(
    operation: OperationDocument<TData, TVariables>,
    variables: TVariables,
    options?: LoadOptions<TData>,
  ): Resource<TData> {
    const fetchPolicy = options?.fetchPolicy ?? (operation.kind === "query" ? "cache-first" : "network-only");
    const normalizedVariables: TVariables = (variables ?? ({} as any));

    if (
      operation.kind === "query" &&
      fetchPolicy === "cache-first" &&
      this.store.hasOperation(operation, (normalizedVariables as any))
    ) {
      return resolvedResource(
        (this.store.readOperation(operation, normalizedVariables) as any),
        { name: `${operation.name} cache hit` },
      );
    }

    if (options?.optimisticResponse != null) {
      this.store.writeOperation(operation, normalizedVariables, options.optimisticResponse);
    }

    const key = cacheKey(operation, (normalizedVariables as any));
    const shouldDedupe = options?.dedupe ?? operation.kind === "query";
    const existing = this._inflight.get(key);
    if (shouldDedupe && existing != null) {
      return (existing as any);
    }

    const context = {
      document: executableSource((operation as any)),
      operationName: operation.name,
      operationType: operation.kind,
      variables: normalizedVariables,
      signal: options?.signal,
    };

    let resource: Resource<TData>;
    const promise = Promise.resolve()
      .then(() => this._fetcher(context))
      .then(response => {
        const data = unwrapResponse(response);
        this.store.writeOperation(operation, normalizedVariables, data);
        return (this.store.readOperation(operation, normalizedVariables) as any);
      })
      .finally(() => {
        if (this._inflight.get(key) === resource) {
          this._inflight.delete(key);
        }
      });

    resource = createResource(promise, {
      name: `${operation.kind} ${operation.name}`,
    });

    if (shouldDedupe) {
      this._inflight.set(key, resource);
    }

    return resource;
  }

  readOperation<TData, TVariables>(
    operation: OperationDocument<TData, TVariables>,
    variables: TVariables,
    options?: LoadOptions<TData>,
  ): Resource<TData> {
    const normalizedVariables: TVariables = (variables ?? ({} as any));
    if (this.store.hasOperation(operation, (normalizedVariables as any))) {
      return resolvedResource(
        (this.store.readOperation(operation, normalizedVariables) as any),
        { name: `${operation.name} read` },
      );
    }

    return this.execute(operation, normalizedVariables, options);
  }

  readFragment<TData>(
    fragment: any,
    ref: mixed,
  ): Resource<TData> {
    return resolvedResource(this.store.readFragment(fragment, ref), {
      name: `${fragment.name} fragment`,
    });
  }

  subscribe<TData, TVariables>(
    operation: SubscriptionDocument<TData, TVariables>,
    variables: TVariables,
    sink: SubscribeSink<TData>,
    options?: SubscribeOptions,
  ): any {
    if (this._subscriber == null) {
      throw new Error("This flow-gene environment does not define a subscriber.");
    }

    const normalizedVariables: TVariables = (variables ?? ({} as any));
    const context = {
      document: executableSource((operation as any)),
      operationName: operation.name,
      operationType: operation.kind,
      variables: normalizedVariables,
      signal: options?.signal,
    };

    return this._subscriber(context, {
      next: response => {
        const data = unwrapResponse(response);
        this.store.writeOperation(operation, normalizedVariables, data);
        notifySink(sink, (this.store.readOperation(operation, normalizedVariables) as any));
      },
      error: error => {
        if (typeof sink !== "function") {
          sink.error?.(error);
        }
      },
      complete: () => {
        if (typeof sink !== "function") {
          sink.complete?.();
        }
      },
    });
  }

  snapshot(): StoreSnapshot {
    return this.store.getSnapshot();
  }
}

export function createEnvironment(options: EnvironmentOptions): EnvironmentInterface {
  return (new GeneEnvironment(options) as any);
}
