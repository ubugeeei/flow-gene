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

export class GeneStoreImpl implements GeneStoreInterface {
  _snapshot: Cell<StoreSnapshot>;
  _identify: IdentifyFunction;

  constructor(options?: StoreOptions): void {
    this._identify = options?.identify ?? defaultIdentify;
    nextStoreID += 1;
    this._snapshot = cell(options?.snapshot ?? EMPTY_SNAPSHOT, {
      key: options?.key ?? `flow-gene.store.${String(nextStoreID)}`,
      name: options?.name ?? "FlowGene store",
    });
  }

  get cell(): Cell<StoreSnapshot> {
    return this._snapshot;
  }

  getSnapshot(): StoreSnapshot {
    return this._snapshot.get();
  }

  restore(snapshot: StoreSnapshot): void {
    transaction(() => {
      this._snapshot.set(snapshot);
    });
  }

  hasOperation(operation: OperationDocument<any, any>, variables?: ?Variables): boolean {
    const key = operationCacheKey(operation, variables);
    return hasOwn(this._snapshot.get().roots, key);
  }

  writeOperation<TData, TVariables>(
    operation: OperationDocument<TData, TVariables>,
    variables: TVariables,
    data: TData,
  ): void {
    const snapshot = this._snapshot.get();
    const records: { [string]: NormalizedRecord } = { ...snapshot.records };
    const roots: { [string]: mixed } = { ...snapshot.roots };
    const key = operationCacheKey(operation, (variables as any));
    const root = normalizeValue(
      data,
      operation.definition.selectionSet,
      records,
      [key],
      operation,
      this._identify,
    );

    roots[key] = root;

    transaction(() => {
      this._snapshot.set({
        version: 1,
        records,
        roots,
      });
    });
  }

  readOperation<TData, TVariables>(
    operation: OperationDocument<TData, TVariables>,
    variables: TVariables,
  ): ?TData {
    const snapshot = this._snapshot.get();
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

  readFragment<TData>(
    fragment: FragmentDocument<TData>,
    ref: mixed,
  ): TData {
    const snapshot = this._snapshot.get();
    let value = targetID(ref) == null ? ref : { $ref: targetID(ref) };

    if (isObject(ref) && typeof (ref as any).$ref !== "string") {
      const id = this._identify((ref as any), {
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

  writeFragment<TData>(
    fragment: FragmentDocument<TData>,
    ref: mixed,
    data: TData,
  ): void {
    const snapshot = this._snapshot.get();
    const records: { [string]: NormalizedRecord } = { ...snapshot.records };
    const roots: { [string]: mixed } = { ...snapshot.roots };
    const id = targetID(ref) ?? (
      isObject(data)
        ? this._identify((data as any), {
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
      this._identify,
      id,
    );

    transaction(() => {
      this._snapshot.set({
        version: 1,
        records,
        roots,
      });
    });
  }

  modify(id: string, fields: CacheModifyFields): boolean {
    const snapshot = this._snapshot.get();
    const record = snapshot.records[id];

    if (record == null) {
      return false;
    }

    const records: { [string]: NormalizedRecord } = { ...snapshot.records };
    const nextRecord: { [string]: mixed } = { ...record };

    for (const key of Object.keys(fields)) {
      nextRecord[key] = fields[key](record[key], record);
    }

    records[id] = nextRecord;
    transaction(() => {
      this._snapshot.set({
        version: 1,
        records,
        roots: snapshot.roots,
      });
    });

    return true;
  }

  evict(id: string): boolean {
    const snapshot = this._snapshot.get();
    if (snapshot.records[id] == null && snapshot.roots[id] == null) {
      return false;
    }

    const records: { [string]: NormalizedRecord } = { ...snapshot.records };
    const roots: { [string]: mixed } = { ...snapshot.roots };
    delete records[id];
    delete roots[id];

    transaction(() => {
      this._snapshot.set({
        version: 1,
        records,
        roots,
      });
    });

    return true;
  }
}

export function createStore(options?: StoreOptions): GeneStoreInterface {
  return new GeneStoreImpl(options);
}

export function cacheKey(
  operation: OperationDocument<any, any>,
  variables?: ?Variables,
): string {
  return operationCacheKey(operation, variables);
}
