/* @flow strict */

import {
  cell,
  transaction,
} from "flow-cell/server";
import type {
  Cell,
} from "flow-cell/server";
import {
  resolveFragmentDefinition,
} from "./Document";
import { stableStringify } from "./Stable";
import type {
  CacheModifyFields,
  FragmentDocument,
  GeneStore as GeneStoreInterface,
  IdentifyContext,
  IdentifyFunction,
  NormalizedRecord,
  OperationDocument,
  StoreOptions,
  StoreSnapshot,
  Variables,
} from "./Types";

const EMPTY_SNAPSHOT: StoreSnapshot = {
  version: 1,
  records: {},
  roots: {},
};

let nextStoreID = 0;

function hasOwn(object: { +[string]: mixed }, key: string): boolean {
  return Object.hasOwn(object, key);
}

function responseKey(field: any): string {
  return field.alias == null ? field.name.value : field.alias.value;
}

function fieldName(field: any): string {
  return field.name.value;
}

function isObject(value: mixed): boolean {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function defaultIdentify(
  value: { +[string]: mixed },
  context: IdentifyContext,
): ?string {
  const id = value.id ?? value._id;
  if (id != null) {
    const typename = value.__typename;
    return typename == null ? `id:${String(id)}` : `${String(typename)}:${String(id)}`;
  }

  if (context.path.length > 0) {
    return context.path.join(".");
  }

  return null;
}

function operationCacheKey(
  operation: OperationDocument<any, any>,
  variables?: ?Variables,
): string {
  return `${operation.kind}:${operation.name}:${stableStringify(variables ?? {})}`;
}

function selectionApplies(selection: any, value: mixed): boolean {
  if (selection.typeCondition == null || !isObject(value)) {
    return true;
  }

  const typename = (value as any).__typename;
  return typename == null || typename === selection.typeCondition.name.value;
}

function forEachSelection(
  owner: any,
  selectionSet: any,
  value: mixed,
  visit: (field: any) => void,
): void {
  if (selectionSet == null) {
    return;
  }

  for (const selection of selectionSet.selections) {
    if (selection.kind === "Field") {
      visit(selection);
      continue;
    }

    if (selection.kind === "InlineFragment") {
      if (selectionApplies(selection, value)) {
        forEachSelection(owner, selection.selectionSet, value, visit);
      }
      continue;
    }

    if (selection.kind === "FragmentSpread") {
      const fragment = resolveFragmentDefinition(owner, selection.name.value);
      if (fragment != null && selectionApplies(fragment, value)) {
        forEachSelection(owner, fragment.selectionSet, value, visit);
      }
    }
  }
}

function normalizeValue(
  value: mixed,
  selectionSet: any,
  records: { [string]: NormalizedRecord },
  path: Array<string>,
  owner: any,
  identify: IdentifyFunction,
  forcedID?: ?string,
): mixed {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      normalizeValue(item, selectionSet, records, [...path, String(index)], owner, identify)
    );
  }

  if (!isObject(value)) {
    return value;
  }

  if (selectionSet == null) {
    return value;
  }

  const objectValue: { +[string]: mixed } = (value as any);
  const id = forcedID ?? identify(objectValue, { path, selectionSet }) ?? path.join(".");
  const previous = records[id] ?? {};
  const record: { [string]: mixed } = {
    ...previous,
    __id: id,
  };

  if (objectValue.__typename != null) {
    record.__typename = objectValue.__typename;
  }
  if (objectValue.id != null) {
    record.id = objectValue.id;
  }
  if (objectValue._id != null) {
    record._id = objectValue._id;
  }

  forEachSelection(owner, selectionSet, value, field => {
    const key = responseKey(field);
    const sourceName = fieldName(field);
    if (!hasOwn(objectValue, key) && !hasOwn(objectValue, sourceName)) {
      return;
    }

    const fieldValue = hasOwn(objectValue, key) ? objectValue[key] : objectValue[sourceName];
    record[key] = normalizeValue(
      fieldValue,
      field.selectionSet,
      records,
      [...path, key],
      owner,
      identify,
    );
  });

  records[id] = record;
  return { $ref: id };
}

function dereference(snapshot: StoreSnapshot, value: mixed): mixed {
  if (
    isObject(value) &&
    typeof (value as any).$ref === "string"
  ) {
    return snapshot.records[(value as any).$ref] ?? null;
  }

  return value;
}

function targetID(ref: mixed): ?string {
  if (typeof ref === "string") {
    return ref;
  }

  if (
    isObject(ref) &&
    typeof (ref as any).$ref === "string"
  ) {
    return (ref as any).$ref;
  }

  return null;
}

function readSelectedValue(
  snapshot: StoreSnapshot,
  value: mixed,
  selectionSet: any,
  owner: any,
): mixed {
  if (Array.isArray(value)) {
    return value.map(item => readSelectedValue(snapshot, item, selectionSet, owner));
  }

  const source = dereference(snapshot, value);
  if (!isObject(source) || selectionSet == null) {
    return source;
  }

  const sourceObject: { +[string]: mixed } = (source as any);
  const result: { [string]: mixed } = {};

  forEachSelection(owner, selectionSet, source, field => {
    const key = responseKey(field);
    const sourceName = fieldName(field);
    const fieldValue = hasOwn(sourceObject, key) ? sourceObject[key] : sourceObject[sourceName];
    result[key] = readSelectedValue(snapshot, fieldValue, field.selectionSet, owner);
  });

  return result;
}

function createSnapshotCell(options?: StoreOptions): Cell<StoreSnapshot> {
  nextStoreID += 1;
  return cell(options?.snapshot ?? EMPTY_SNAPSHOT, {
    key: options?.key ?? `flow-gene.store.${String(nextStoreID)}`,
    name: options?.name ?? "FlowGene store",
  });
}

function setSnapshot(
  snapshotCell: Cell<StoreSnapshot>,
  snapshot: StoreSnapshot,
): void {
  transaction(() => {
    snapshotCell.set(snapshot);
  });
}

function writeOperationSnapshot<TData, TVariables>(
  snapshot: StoreSnapshot,
  operation: OperationDocument<TData, TVariables>,
  variables: TVariables,
  data: TData,
  identify: IdentifyFunction,
): StoreSnapshot {
  const records: { [string]: NormalizedRecord } = { ...snapshot.records };
  const roots: { [string]: mixed } = { ...snapshot.roots };
  const key = operationCacheKey(operation, (variables as any));
  const root = normalizeValue(
    data,
    operation.definition.selectionSet,
    records,
    [key],
    operation,
    identify,
  );

  roots[key] = root;
  return {
    version: 1,
    records,
    roots,
  };
}

function readOperationSnapshot<TData, TVariables>(
  snapshot: StoreSnapshot,
  operation: OperationDocument<TData, TVariables>,
  variables: TVariables,
): ?TData {
  const key = operationCacheKey(operation, (variables as any));

  if (!hasOwn(snapshot.roots, key)) {
    return null;
  }

  return (readSelectedValue(
    snapshot,
    snapshot.roots[key],
    operation.definition.selectionSet,
    operation,
  ) as any);
}

function readFragmentSnapshot<TData>(
  snapshot: StoreSnapshot,
  fragment: FragmentDocument<TData>,
  ref: mixed,
  identify: IdentifyFunction,
): TData {
  const refID = targetID(ref);
  let value = refID == null ? ref : { $ref: refID };

  if (isObject(ref) && typeof (ref as any).$ref !== "string") {
    const id = identify((ref as any), {
      path: [fragment.name],
      selectionSet: fragment.definition.selectionSet,
    });

    if (id != null && snapshot.records[id] != null) {
      value = { $ref: id };
    }
  }

  return (readSelectedValue(
    snapshot,
    value,
    fragment.definition.selectionSet,
    fragment,
  ) as any);
}

function writeFragmentSnapshot<TData>(
  snapshot: StoreSnapshot,
  fragment: FragmentDocument<TData>,
  ref: mixed,
  data: TData,
  identify: IdentifyFunction,
): StoreSnapshot {
  const records: { [string]: NormalizedRecord } = { ...snapshot.records };
  const roots: { [string]: mixed } = { ...snapshot.roots };
  const id = targetID(ref) ?? (
    isObject(data)
      ? identify((data as any), {
        path: [fragment.name],
        selectionSet: fragment.definition.selectionSet,
      })
      : null
  );

  normalizeValue(
    data,
    fragment.definition.selectionSet,
    records,
    [id ?? fragment.name],
    fragment,
    identify,
    id,
  );

  return {
    version: 1,
    records,
    roots,
  };
}

function modifySnapshot(
  snapshot: StoreSnapshot,
  id: string,
  fields: CacheModifyFields,
): ?StoreSnapshot {
  const record = snapshot.records[id];

  if (record == null) {
    return null;
  }

  const records: { [string]: NormalizedRecord } = { ...snapshot.records };
  const nextRecord: { [string]: mixed } = { ...record };

  for (const key of Object.keys(fields)) {
    nextRecord[key] = fields[key](record[key], record);
  }

  records[id] = nextRecord;
  return {
    version: 1,
    records,
    roots: snapshot.roots,
  };
}

function evictSnapshot(snapshot: StoreSnapshot, id: string): ?StoreSnapshot {
  if (snapshot.records[id] == null && snapshot.roots[id] == null) {
    return null;
  }

  const records: { [string]: NormalizedRecord } = { ...snapshot.records };
  const roots: { [string]: mixed } = { ...snapshot.roots };
  delete records[id];
  delete roots[id];

  return {
    version: 1,
    records,
    roots,
  };
}

export function createStore(options?: StoreOptions): GeneStoreInterface {
  const identify = options?.identify ?? defaultIdentify;
  const snapshotCell = createSnapshotCell(options);
  const store: GeneStoreInterface = {
    cell: snapshotCell,

    getSnapshot(): StoreSnapshot {
      return snapshotCell.get();
    },

    restore(snapshot: StoreSnapshot): void {
      setSnapshot(snapshotCell, snapshot);
    },

    hasOperation(operation: OperationDocument<any, any>, variables?: ?Variables): boolean {
      return hasOwn(snapshotCell.get().roots, operationCacheKey(operation, variables));
    },

    writeOperation<TData, TVariables>(
      operation: OperationDocument<TData, TVariables>,
      variables: TVariables,
      data: TData,
    ): void {
      setSnapshot(
        snapshotCell,
        writeOperationSnapshot(snapshotCell.get(), operation, variables, data, identify),
      );
    },

    readOperation<TData, TVariables>(
      operation: OperationDocument<TData, TVariables>,
      variables: TVariables,
    ): ?TData {
      return readOperationSnapshot(snapshotCell.get(), operation, variables);
    },

    readFragment<TData>(
      fragment: FragmentDocument<TData>,
      ref: mixed,
    ): TData {
      return readFragmentSnapshot(snapshotCell.get(), fragment, ref, identify);
    },

    writeFragment<TData>(
      fragment: FragmentDocument<TData>,
      ref: mixed,
      data: TData,
    ): void {
      setSnapshot(
        snapshotCell,
        writeFragmentSnapshot(snapshotCell.get(), fragment, ref, data, identify),
      );
    },

    modify(id: string, fields: CacheModifyFields): boolean {
      const nextSnapshot = modifySnapshot(snapshotCell.get(), id, fields);
      if (nextSnapshot == null) {
        return false;
      }

      setSnapshot(snapshotCell, nextSnapshot);
      return true;
    },

    evict(id: string): boolean {
      const nextSnapshot = evictSnapshot(snapshotCell.get(), id);
      if (nextSnapshot == null) {
        return false;
      }

      setSnapshot(snapshotCell, nextSnapshot);
      return true;
    },
  };

  return Object.freeze(store);
}

export function GeneStoreImpl(options?: StoreOptions): GeneStoreInterface {
  return createStore(options);
}

export function cacheKey(
  operation: OperationDocument<any, any>,
  variables?: ?Variables,
): string {
  return operationCacheKey(operation, variables);
}
