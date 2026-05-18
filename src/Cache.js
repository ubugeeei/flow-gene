/* @flow strict */

import type {
  CacheEvictOptions,
  CacheModifyOptions,
  CacheReadFragmentOptions,
  CacheReadQueryOptions,
  CacheWatchListener,
  CacheWriteFragmentOptions,
  CacheWriteQueryOptions,
  GeneCache as GeneCacheInterface,
  GeneStore,
  StoreSnapshot,
  Variables,
} from "./Types";
import type {
  Unsubscribe,
} from "flow-cell/server";

export class GeneCacheImpl implements GeneCacheInterface {
  _store: GeneStore;

  constructor(store: GeneStore): void {
    this._store = store;
  }

  readQuery<TData, TVariables = Variables>(
    options: CacheReadQueryOptions<TData, TVariables>,
  ): ?TData {
    return this._store.readOperation(
      options.query,
      options.variables ?? ({} as any),
    );
  }

  writeQuery<TData, TVariables = Variables>(
    options: CacheWriteQueryOptions<TData, TVariables>,
  ): void {
    this._store.writeOperation(
      options.query,
      options.variables ?? ({} as any),
      options.data,
    );
  }

  readFragment<TData>(options: CacheReadFragmentOptions<TData>): TData {
    return this._store.readFragment(options.fragment, options.from);
  }

  writeFragment<TData>(options: CacheWriteFragmentOptions<TData>): void {
    this._store.writeFragment(options.fragment, options.from, options.data);
  }

  modify(options: CacheModifyOptions): boolean {
    return this._store.modify(options.id, options.fields);
  }

  evict(options: CacheEvictOptions): boolean {
    return this._store.evict(options.id);
  }

  extract(): StoreSnapshot {
    return this._store.getSnapshot();
  }

  restore(snapshot: StoreSnapshot): GeneCacheInterface {
    this._store.restore(snapshot);
    return this;
  }

  watch(listener: CacheWatchListener): Unsubscribe {
    return this._store.cell.subscribe(() => {
      listener(this._store.getSnapshot());
    });
  }
}

export function createCache(store: GeneStore): GeneCacheInterface {
  return new GeneCacheImpl(store);
}
