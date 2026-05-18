/* @flow strict */

import {
  parse,
  print,
} from "graphql";
import { resolveEnvironment } from "./DefaultEnvironment";
import type {
  AnyDocument,
  DocumentKind,
  FragmentDocument,
  GqlTag,
  LoadOptions,
  MutationDocument,
  OperationType,
  QueryDocument,
  ReadOptions,
  Resource,
  SubscribeOptions,
  SubscribeSink,
  SubscriptionDocument,
  Variables,
} from "./Types";

type Definition = any;
type FragmentMap = Map<string, Definition>;

const fragmentRegistry: FragmentMap = new Map<string, Definition>();

function hasOwn(object: { +[string]: mixed }, key: string): boolean {
  return Object.hasOwn(object, key);
}

function definitionName(definition: Definition): string {
  return definition.name == null ? "anonymous" : definition.name.value;
}

function operationKind(definition: Definition): OperationType {
  return definition.operation;
}

function isOperationDefinition(definition: Definition): boolean {
  return definition.kind === "OperationDefinition";
}

function isFragmentDefinition(definition: Definition): boolean {
  return definition.kind === "FragmentDefinition";
}

function templateToSource(
  strings: TaggedTemplateLiteralArray,
  values: Array<mixed>,
): string {
  let source = "";

  for (let index = 0; index < strings.length; index += 1) {
    source += strings[index];

    if (index >= values.length) {
      continue;
    }

    const value = values[index];
    if (
      value != null &&
      typeof value === "object" &&
      typeof (value as any).source === "string"
    ) {
      source += (value as any).source;
    } else {
      source += String(value);
    }
  }

  return source;
}

function collectLocalFragments(ast: any): FragmentMap {
  const fragments: FragmentMap = new Map<string, Definition>();

  for (const definition of ast.definitions) {
    if (isFragmentDefinition(definition)) {
      fragments.set(definitionName(definition), definition);
      fragmentRegistry.set(definitionName(definition), definition);
    }
  }

  return fragments;
}

function primaryDefinition(ast: any, expectedKind?: DocumentKind): Definition {
  const definitions = ast.definitions;

  if (expectedKind === "fragment") {
    const fragment = definitions.find(isFragmentDefinition);
    if (fragment == null) {
      throw new Error("gql.fragment requires a fragment definition.");
    }
    return fragment;
  }

  if (
    expectedKind === "query" ||
    expectedKind === "mutation" ||
    expectedKind === "subscription"
  ) {
    const operation = definitions.find(definition =>
      isOperationDefinition(definition) && operationKind(definition) === expectedKind
    );
    if (operation == null) {
      throw new Error(`gql.${expectedKind} requires a ${expectedKind} operation.`);
    }
    return operation;
  }

  const operation = definitions.find(isOperationDefinition);
  if (operation != null) {
    return operation;
  }

  const fragment = definitions.find(isFragmentDefinition);
  if (fragment != null) {
    return fragment;
  }

  throw new Error("gql requires at least one GraphQL definition.");
}

function variableNames(definition: Definition): Array<string> {
  const variables = definition.variableDefinitions ?? [];
  return variables.map(variable => variable.variable.name.value);
}

function objectFromFormData(formData: FormData): { [string]: mixed } {
  const value: { [string]: mixed } = {};

  for (const [key, entry] of formData.entries()) {
    if (hasOwn(value, key)) {
      const current = value[key];
      value[key] = Array.isArray(current) ? [...current, entry] : [current, entry];
    } else {
      value[key] = entry;
    }
  }

  return value;
}

function actionInputToVariables(input: mixed, definition: Definition): mixed {
  let value = input;

  if (
    typeof FormData !== "undefined" &&
    input instanceof FormData
  ) {
    value = objectFromFormData(input);
  }

  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const names = variableNames(definition);
  if (
    names.length === 1 &&
    !hasOwn((value as any), names[0])
  ) {
    return { [names[0]]: value };
  }

  return value;
}

export class GraphQLBaseDocument {
  kind: any;
  name: string;
  source: string;
  ast: any;
  definition: Definition;
  _fragments: FragmentMap;

  constructor(kind: DocumentKind, source: string, ast: any, definition: Definition): void {
    this.kind = kind;
    this.source = source;
    this.ast = ast;
    this.definition = definition;
    this.name = definitionName(definition);
    this._fragments = collectLocalFragments(ast);
  }

  toString(): string {
    return this.source;
  }
}

export class GraphQLFragmentDocument<TData>
  extends GraphQLBaseDocument {

  constructor(source: string, ast: any, definition: Definition): void {
    super("fragment", source, ast, definition);
  }

  read(ref: mixed, options?: ReadOptions): Resource<TData> {
    return resolveEnvironment(options).readFragment(this, ref, options);
  }
}

export class GraphQLOperationDocument<TData, TVariables = Variables>
  extends GraphQLBaseDocument {

  constructor(kind: OperationType, source: string, ast: any, definition: Definition): void {
    super(kind, source, ast, definition);
  }

  load(variables?: TVariables, options?: LoadOptions<TData>): Resource<TData> {
    const environment = resolveEnvironment(options);
    return environment.execute((this as any), variables ?? ({} as any), options);
  }

  read(variables?: TVariables, options?: LoadOptions<TData>): Resource<TData> {
    const environment = resolveEnvironment(options);
    return environment.readOperation((this as any), variables ?? ({} as any), options);
  }
}

export class GraphQLQueryDocument<TData, TVariables = Variables>
  extends GraphQLOperationDocument<TData, TVariables>
  {

  constructor(source: string, ast: any, definition: Definition): void {
    super("query", source, ast, definition);
  }
}

export class GraphQLMutationDocument<TData, TVariables = Variables>
  extends GraphQLOperationDocument<TData, TVariables>
  {

  constructor(source: string, ast: any, definition: Definition): void {
    super("mutation", source, ast, definition);
  }

  commit(variables?: TVariables, options?: LoadOptions<TData>): Resource<TData> {
    return this.load(variables, options);
  }

  action(input?: mixed, options?: LoadOptions<TData>): Resource<TData> {
    return this.load((actionInputToVariables(input, this.definition) as any), options);
  }
}

export class GraphQLSubscriptionDocument<TData, TVariables = Variables>
  extends GraphQLBaseDocument {

  constructor(source: string, ast: any, definition: Definition): void {
    super("subscription", source, ast, definition);
  }

  subscribe(
    variables: TVariables,
    sink: SubscribeSink<TData>,
    options?: SubscribeOptions,
  ): any {
    return resolveEnvironment(options).subscribe((this as any), variables, sink, options);
  }
}

export function resolveFragmentDefinition(
  owner: GraphQLBaseDocument,
  name: string,
): ?Definition {
  return owner._fragments.get(name) ?? fragmentRegistry.get(name) ?? null;
}

function collectFragmentSpreads(
  owner: GraphQLBaseDocument,
  selectionSet: any,
  names: Set<string>,
): void {
  if (selectionSet == null) {
    return;
  }

  for (const selection of selectionSet.selections) {
    if (selection.kind === "FragmentSpread") {
      const name = selection.name.value;
      if (names.has(name)) {
        continue;
      }

      names.add(name);
      const fragment = resolveFragmentDefinition(owner, name);
      if (fragment != null) {
        collectFragmentSpreads(owner, fragment.selectionSet, names);
      }
    } else if (selection.selectionSet != null) {
      collectFragmentSpreads(owner, selection.selectionSet, names);
    }
  }
}

export function executableSource(document: GraphQLBaseDocument): string {
  if (document.kind === "fragment") {
    return print(document.ast);
  }

  const spreadNames: Set<string> = new Set<string>();
  collectFragmentSpreads(document, document.definition.selectionSet, spreadNames);

  const definitions = [document.definition];
  for (const name of spreadNames) {
    const fragment = resolveFragmentDefinition(document, name);
    if (fragment != null) {
      definitions.push(fragment);
    }
  }

  return print({
    kind: "Document",
    definitions,
  });
}

function createTypedDocument(source: string, expectedKind?: DocumentKind): AnyDocument {
  const ast = parse(source);
  const definition = primaryDefinition(ast, expectedKind);

  if (isFragmentDefinition(definition)) {
    return new GraphQLFragmentDocument(source, ast, definition);
  }

  const kind = operationKind(definition);
  if (kind === "query") {
    return new GraphQLQueryDocument(source, ast, definition);
  }
  if (kind === "mutation") {
    return new GraphQLMutationDocument(source, ast, definition);
  }
  if (kind === "subscription") {
    return new GraphQLSubscriptionDocument(source, ast, definition);
  }

  return new GraphQLBaseDocument("document", source, ast, definition);
}

function gqlTag(strings: TaggedTemplateLiteralArray, ...values: Array<mixed>): AnyDocument {
  return createTypedDocument(templateToSource(strings, values));
}

function fragmentTag<TData>(
  strings: TaggedTemplateLiteralArray,
  ...values: Array<mixed>
): FragmentDocument<TData> {
  return (createTypedDocument(templateToSource(strings, values), "fragment") as any);
}

function queryTag<TData, TVariables = Variables>(
  strings: TaggedTemplateLiteralArray,
  ...values: Array<mixed>
): QueryDocument<TData, TVariables> {
  return (createTypedDocument(templateToSource(strings, values), "query") as any);
}

function mutationTag<TData, TVariables = Variables>(
  strings: TaggedTemplateLiteralArray,
  ...values: Array<mixed>
): MutationDocument<TData, TVariables> {
  return (createTypedDocument(templateToSource(strings, values), "mutation") as any);
}

function subscriptionTag<TData, TVariables = Variables>(
  strings: TaggedTemplateLiteralArray,
  ...values: Array<mixed>
): SubscriptionDocument<TData, TVariables> {
  return (createTypedDocument(templateToSource(strings, values), "subscription") as any);
}

const gqlObject: any = gqlTag;
gqlObject.fragment = fragmentTag;
gqlObject.query = queryTag;
gqlObject.mutation = mutationTag;
gqlObject.subscription = subscriptionTag;

export const gql: GqlTag = (gqlObject as any);
