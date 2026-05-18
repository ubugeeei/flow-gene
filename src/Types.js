/* @flow strict */

import type {
  Cell,
  Readable,
  Unsubscribe,
} from "flow-cell/server";

export type Variables = { +[string]: mixed };
export type OperationType = "query" | "mutation" | "subscription";
export type DocumentKind = "document" | "fragment" | OperationType;

export type GraphQLErrorLike = {
  +message: string,
  +locations?: mixed,
  +path?: mixed,
  +extensions?: mixed,
};

export type GraphQLResponse<TData> = {
  +data?: TData,
  +errors?: $ReadOnlyArray<GraphQLErrorLike>,
  +extensions?: mixed,
};

export type FetchContext<TVariables> = {
  +document: string,
  +operationName: string,
  +operationType: OperationType,
  +variables: TVariables,
  +signal?: AbortSignal,
};

export type Fetcher<TData, TVariables> = (
  context: FetchContext<TVariables>,
) => Promise<GraphQLResponse<TData> | TData>;

export type HeaderMap = { +[string]: string };

export type ResourceState<+T> =
  | { +status: "pending" }
  | { +status: "fulfilled", +value: T }
  | { +status: "rejected", +error: mixed };

export interface Resource<+T> {
  then(onFulfilled?: any, onRejected?: any): any;
  catch(onRejected?: any): any;
  finally(onFinally?: ?() => mixed): Promise<T>;
  read(): T;
  +status: Readable<ResourceState<T>>;
}

export type ResourceOptions<T> = {
  +key?: string,
  +name?: string,
  +initialState?: ResourceState<T>,
};

export type EntityRef = { +$ref: string };
export type NormalizedRecord = { [string]: mixed };

export type StoreSnapshot = {
  +version: 1,
  +records: { +[string]: NormalizedRecord },
  +roots: { +[string]: mixed },
};

export type IdentifyContext = {
  +path: $ReadOnlyArray<string>,
  +selectionSet?: any,
};

export type IdentifyFunction = (
  value: { +[string]: mixed },
  context: IdentifyContext,
) => ?string;

export type StoreOptions = {
  +snapshot?: StoreSnapshot,
  +identify?: IdentifyFunction,
  +key?: string,
  +name?: string,
};

export interface GeneStore {
  +cell: Cell<StoreSnapshot>;
  getSnapshot(): StoreSnapshot;
  restore(snapshot: StoreSnapshot): void;
  hasOperation(operation: OperationDocument<any, any>, variables?: ?Variables): boolean;
  writeOperation<TData, TVariables>(
    operation: OperationDocument<TData, TVariables>,
    variables: TVariables,
    data: TData,
  ): void;
  readOperation<TData, TVariables>(
    operation: OperationDocument<TData, TVariables>,
    variables: TVariables,
  ): ?TData;
  readFragment<TData>(
    fragment: FragmentDocument<TData>,
    ref: mixed,
  ): TData;
  writeFragment<TData>(
    fragment: FragmentDocument<TData>,
    ref: mixed,
    data: TData,
  ): void;
  modify(id: string, fields: CacheModifyFields): boolean;
  evict(id: string): boolean;
}

export type CacheReadQueryOptions<TData, TVariables = Variables> = {
  +query: QueryDocument<TData, TVariables>,
  +variables?: TVariables,
};

export type CacheWriteQueryOptions<TData, TVariables = Variables> = {
  +query: QueryDocument<TData, TVariables>,
  +variables?: TVariables,
  +data: TData,
};

export type CacheReadFragmentOptions<TData> = {
  +fragment: FragmentDocument<TData>,
  +from: mixed,
};

export type CacheWriteFragmentOptions<TData> = {
  +fragment: FragmentDocument<TData>,
  +from: mixed,
  +data: TData,
};

export type CacheModifyFunction = (
  value: mixed,
  record: NormalizedRecord,
) => mixed;

export type CacheModifyFields = { +[string]: CacheModifyFunction };

export type CacheModifyOptions = {
  +id: string,
  +fields: CacheModifyFields,
};

export type CacheEvictOptions = {
  +id: string,
};

export type CacheWatchListener = (snapshot: StoreSnapshot) => mixed;

export interface GeneCache {
  readQuery<TData, TVariables = Variables>(
    options: CacheReadQueryOptions<TData, TVariables>,
  ): ?TData;
  writeQuery<TData, TVariables = Variables>(
    options: CacheWriteQueryOptions<TData, TVariables>,
  ): void;
  readFragment<TData>(options: CacheReadFragmentOptions<TData>): TData;
  writeFragment<TData>(options: CacheWriteFragmentOptions<TData>): void;
  modify(options: CacheModifyOptions): boolean;
  evict(options: CacheEvictOptions): boolean;
  extract(): StoreSnapshot;
  restore(snapshot: StoreSnapshot): GeneCache;
  watch(listener: CacheWatchListener): Unsubscribe;
}

export type FetchPolicy = "cache-first" | "network-only" | "cache-and-network";

export type LoadOptions<TData> = {
  +environment?: Environment,
  +fetchPolicy?: FetchPolicy,
  +dedupe?: boolean,
  +signal?: AbortSignal,
  +optimisticResponse?: TData,
};

export type ReadOptions = {
  +environment?: Environment,
};

export type SubscribeSink<TData> = {
  +next?: (data: TData) => mixed,
  +error?: (error: mixed) => mixed,
  +complete?: () => mixed,
} | ((data: TData) => mixed);

export type SubscribeOptions = {
  +environment?: Environment,
  +signal?: AbortSignal,
};

export type SubscriptionContext<TVariables> = FetchContext<TVariables>;

export type Subscriber<TData, TVariables> = (
  context: SubscriptionContext<TVariables>,
  sink: {
    +next: (response: GraphQLResponse<TData> | TData) => mixed,
    +error: (error: mixed) => mixed,
    +complete: () => mixed,
  },
) => Unsubscribe;

export type EnvironmentOptions = {
  +fetcher?: Fetcher<any, any>,
  +subscriber?: Subscriber<any, any>,
  +endpoint?: string,
  +headers?: HeaderMap | ((context: FetchContext<any>) => HeaderMap),
  +fetch?: any,
  +store?: GeneStore,
  +snapshot?: StoreSnapshot,
  +identify?: IdentifyFunction,
  +setAsDefault?: boolean,
};

export interface Environment {
  +store: GeneStore;
  +cache: GeneCache;
  +storeCell: Cell<StoreSnapshot>;
  execute<TData, TVariables>(
    operation: OperationDocument<TData, TVariables>,
    variables: TVariables,
    options?: LoadOptions<TData>,
  ): Resource<TData>;
  readOperation<TData, TVariables>(
    operation: OperationDocument<TData, TVariables>,
    variables: TVariables,
    options?: LoadOptions<TData>,
  ): Resource<TData>;
  readFragment<TData>(
    fragment: FragmentDocument<TData>,
    ref: mixed,
    options?: ReadOptions,
  ): Resource<TData>;
  subscribe<TData, TVariables>(
    operation: SubscriptionDocument<TData, TVariables>,
    variables: TVariables,
    sink: SubscribeSink<TData>,
    options?: SubscribeOptions,
  ): Unsubscribe;
  snapshot(): StoreSnapshot;
}

export interface BaseDocument {
  +kind: DocumentKind;
  +name: string;
  +source: string;
  +ast: any;
  +definition: any;
  toString(): string;
}

export interface FragmentDocument<+TData> extends BaseDocument {
  +kind: "fragment";
  read(ref: mixed, options?: ReadOptions): Resource<TData>;
}

export interface QueryDocument<TData, TVariables = Variables> extends BaseDocument {
  +kind: "query";
  load(variables?: TVariables, options?: LoadOptions<TData>): Resource<TData>;
  read(variables?: TVariables, options?: LoadOptions<TData>): Resource<TData>;
}

export interface MutationDocument<TData, TVariables = Variables> extends BaseDocument {
  +kind: "mutation";
  load(variables?: TVariables, options?: LoadOptions<TData>): Resource<TData>;
  commit(variables?: TVariables, options?: LoadOptions<TData>): Resource<TData>;
  action(input?: mixed, options?: LoadOptions<TData>): Resource<TData>;
}

export interface SubscriptionDocument<TData, TVariables = Variables> extends BaseDocument {
  +kind: "subscription";
  subscribe(
    variables: TVariables,
    sink: SubscribeSink<TData>,
    options?: SubscribeOptions,
  ): Unsubscribe;
}

export type OperationDocument<TData, TVariables = Variables> =
  | QueryDocument<TData, TVariables>
  | MutationDocument<TData, TVariables>
  | SubscriptionDocument<TData, TVariables>;

export type AnyDocument =
  | BaseDocument
  | FragmentDocument<any>
  | OperationDocument<any, any>;

export type FragmentRef<+TFragment> = mixed;

export type GqlTag = {
  (strings: TaggedTemplateLiteralArray, ...values: Array<mixed>): AnyDocument,
  +fragment: <TData>(
    strings: TaggedTemplateLiteralArray,
    ...values: Array<mixed>
  ) => FragmentDocument<TData>,
  +query: <TData, TVariables = Variables>(
    strings: TaggedTemplateLiteralArray,
    ...values: Array<mixed>
  ) => QueryDocument<TData, TVariables>,
  +mutation: <TData, TVariables = Variables>(
    strings: TaggedTemplateLiteralArray,
    ...values: Array<mixed>
  ) => MutationDocument<TData, TVariables>,
  +subscription: <TData, TVariables = Variables>(
    strings: TaggedTemplateLiteralArray,
    ...values: Array<mixed>
  ) => SubscriptionDocument<TData, TVariables>,
};
