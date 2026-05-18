# FlowGene

> Experimental: FlowGene is an early GraphQL layer for the FlowCell ecosystem. APIs may change while the compiler and cache model settle.

FlowGene makes GraphQL a first-class primitive instead of hiding it behind a generic data-fetching channel. The package is intentionally small:

- `gql.fragment` declares component-local data dependencies.
- `gql.query`, `gql.mutation`, and `gql.subscription` keep GraphQL operation types explicit.
- query and mutation results write into a normalized store backed by a `flow-cell` cell.
- `load()` returns a resource that works with both `await` and React 19 `use(resource)`.
- fragments read through `use(UserCard_user.read(user))` without adding a GraphQL-specific hook.

```js
import { gql, createEnvironment } from "flow-gene";

createEnvironment({
  fetcher: async ({ document, variables, operationName }) => {
    const response = await fetch("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: document, variables, operationName }),
    });
    return await response.json();
  },
});

export const UserCard_user = gql.fragment`
  fragment UserCard_user on User {
    id
    name
    avatarUrl
  }
`;

export const UserPage_query = gql.query`
  query UserPage_query($id: ID!) {
    user(id: $id) {
      ...UserCard_user
    }
  }
`;
```

React usage stays close to Suspense:

```js
import { use } from "react";

component UserPage(id: string) {
  const result = UserPage_query.load({ id });

  return (
    <Suspense fallback={<UserSkeleton />}>
      <UserScreen result={result} />
    </Suspense>
  );
}

component UserScreen(result: Resource<typeof UserPage_query>) {
  const data = use(result);
  return <UserCard user={data.user} />;
}

component UserCard(user: FragmentRef<typeof UserCard_user>) {
  const data = use(UserCard_user.read(user));
  return <h2>{data.name}</h2>;
}
```

## FlowCell alignment

FlowGene uses `flow-cell` as its graph substrate:

- the normalized store is exposed as `environment.storeCell`;
- every resource has a `status` readable cell with `pending`, `fulfilled`, and `rejected` states;
- writes are batched with `transaction`;
- the package shape mirrors FlowCell with `src/`, PascalCase files, CJS/ESM builds, Flow declarations, and `client` / `server` entries.

## Mutations and forms

GraphQL mutation stays in FlowGene; form payload shaping can live in `flow-vesicle`.

```js
export const UpdateProfile = gql.mutation`
  mutation UpdateProfile($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      user {
        id
        name
        bio
        ...UserCard_user
      }
    }
  }
`;

// Compatible with <form action>.
const action = UpdateProfile.action;
```

`action(formData)` converts `FormData` to an object. When the mutation has exactly one variable and that variable is not already present, the object is wrapped under that variable name.

## Store model

The default identifier is `__typename:id`, or `id:<id>` when `__typename` is absent. Pass `identify` to `createEnvironment` to use schema-specific global IDs.

```js
createEnvironment({
  fetcher,
  identify(value) {
    return value.__typename != null && value.id != null
      ? `${value.__typename}:${value.id}`
      : null;
  },
});
```

## Scripts

```sh
npm install
npm run verify
```

## Publishing

The first publish can be done locally:

```sh
npm publish --access public
```

After the package exists on npm, configure a Trusted Publisher for:

- repository: `ubugeeei/flow-gene`
- workflow: `.github/workflows/publish.yml`

Future releases publish from signed GitHub OIDC by pushing a version tag that matches `package.json`.

```sh
git tag v0.1.0
git push origin v0.1.0
```
