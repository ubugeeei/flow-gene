# FlowGene

> Experimental: FlowGene is an early GraphQL layer for the FlowCell ecosystem. APIs may change while the compiler and cache model settle.

FlowGene is a fragment-colocation-first GraphQL layer for the FlowCell ecosystem. Components declare the data they render with `gql.fragment`; route-level operations compose those fragments into executable GraphQL. GraphQL stays visible, while FlowGene provides the compiler-shaped pieces around it: operation typing, fragment reads, normalized storage, and Suspense resources.

The center of the API is deliberately small:

- `gql.fragment` is the component-local data contract.
- `gql.query` composes colocated fragments at route or RSC boundaries.
- `gql.mutation` and `gql.subscription` keep GraphQL operation types explicit.
- normalized records live in a `flow-cell` cell.
- resources work with both `await` and React 19 `use(resource)`.
- fragment reads use `use(UserCard_user.read(user))`; no GraphQL-specific hook is required.

## Fragment colocation

Put the fragment next to the component that renders it. Parent queries should spread child fragments instead of spelling out child fields.

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

// UserAvatar.js
export const UserAvatar_image = gql.fragment`
  fragment UserAvatar_image on User {
    avatarUrl
  }
`;

component UserAvatar(user: FragmentRef<typeof UserAvatar_image>) {
  const data = use(UserAvatar_image.read(user));
  return <img src={data.avatarUrl} alt="" />;
}

// UserCard.js
export const UserCard_user = gql.fragment`
  fragment UserCard_user on User {
    id
    name
    ...UserAvatar_image
  }
`;

component UserCard(user: FragmentRef<typeof UserCard_user>) {
  const data = use(UserCard_user.read(user));

  return (
    <article>
      <UserAvatar user={data} />
      <h2>{data.name}</h2>
    </article>
  );
}

// UserPage.js
export const UserPage_query = gql.query`
  query UserPage_query($id: ID!) {
    user(id: $id) {
      ...UserCard_user
    }
  }
`;
```

When `UserPage_query.load()` runs, FlowGene sends an executable document containing `UserPage_query`, `UserCard_user`, and `UserAvatar_image`. The network operation is still plain GraphQL; colocation only changes where the data contract lives.

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
  return (
    <article>
      <UserAvatar user={data} />
      <h2>{data.name}</h2>
    </article>
  );
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

## Apollo-style cache

The normalized store is also exposed through an explicit cache API. It follows the familiar Apollo shape while staying backed by a `flow-cell` cell.

```js
const environment = createEnvironment({ fetcher });

environment.cache.writeQuery({
  query: UserPage_query,
  variables: { id: "1" },
  data: {
    user: {
      __typename: "User",
      id: "1",
      name: "Ada",
      avatarUrl: "/ada.png",
    },
  },
});

const data = environment.cache.readQuery({
  query: UserPage_query,
  variables: { id: "1" },
});

environment.cache.writeFragment({
  fragment: UserCard_user,
  from: "User:1",
  data: {
    __typename: "User",
    id: "1",
    name: "Ada Lovelace",
    avatarUrl: "/ada.png",
  },
});

environment.cache.modify({
  id: "User:1",
  fields: {
    name: value => `${String(value)}!`,
  },
});

const snapshot = environment.cache.extract();
environment.cache.restore(snapshot);
```

The cache supports `readQuery`, `writeQuery`, `readFragment`, `writeFragment`, `modify`, `evict`, `extract`, `restore`, and `watch`.

## Scripts

```sh
yarn install
yarn verify
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
git tag v0.3.0
git push origin v0.3.0
```
