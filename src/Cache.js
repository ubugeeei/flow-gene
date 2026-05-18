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

export function createCache(store: GeneStore): GeneCacheInterface {
  const cache: GeneCacheInterface = {
    readQuery<TData, TVariables = Variables>(
      options: CacheReadQueryOptions<TData, TVariables>,
    ): ?TData {
      return store.readOperation(
        options.query,
        options.variables ?? ({} as any),
      );
    },

    writeQuery<TData, TVariables = Variables>(
      options: CacheWriteQueryOptions<TData, TVariables>,
    ): void {
      store.writeOperation(
        options.query,
        options.variables ?? ({} as any),
        options.data,
      );
    },

    readFragment<TData>(options: CacheReadFragmentOptions<TData>): TData {
      return store.readFragment(options.fragment, options.from);
    },

    writeFragment<TData>(options: CacheWriteFragmentOptions<TData>): void {
      store.writeFragment(options.fragment, options.from, options.data);
    },

    modify(options: CacheModifyOptions): boolean {
      return store.modify(options.id, options.fields);
    },

    evict(options: CacheEvictOptions): boolean {
      return store.evict(options.id);
    },

    extract(): StoreSnapshot {
      return store.getSnapshot();
    },

    restore(snapshot: StoreSnapshot): GeneCacheInterface {
      store.restore(snapshot);
      return cache;
    },

    watch(listener: CacheWatchListener): Unsubscribe {
      return store.cell.subscribe(() => {
        listener(store.getSnapshot());
      });
    },
  };

  return Object.freeze(cache);
}

export function GeneCacheImpl(store: GeneStore): GeneCacheInterface {
  return createCache(store);
}
