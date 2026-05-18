/* @flow */

import {
  createEnvironment,
  gql,
} from "./FlowGene";

test("query.load composes colocated fragments, normalizes, and exposes a cell-backed resource", async () => {
  const UserAvatar_image = gql.fragment`
    fragment UserAvatar_image on User {
      avatarUrl
    }
  `;

  const UserCard_user = gql.fragment`
    fragment UserCard_user on User {
      id
      name
      ...UserAvatar_image
    }
  `;

  const UserPage_query = gql.query`
    query UserPage_query($id: ID!) {
      user(id: $id) {
        ...UserCard_user
      }
    }
  `;

  const calls = [];
  createEnvironment({
    fetcher: async context => {
      calls.push(context);
      return {
        data: {
          user: {
            id: "1",
            name: "Ada",
            avatarUrl: "/ada.png",
          },
        },
      };
    },
  });

  const resource = UserPage_query.load({ id: "1" });
  expect(resource.status.get().status).toBe("pending");

  const data = await resource;

  expect(data).toEqual({
    user: {
      id: "1",
      name: "Ada",
      avatarUrl: "/ada.png",
    },
  });
  expect(resource.status.get().status).toBe("fulfilled");
  expect(calls.length).toBe(1);
  expect(calls[0].document).toContain("fragment UserCard_user on User");
  expect(calls[0].document).toContain("fragment UserAvatar_image on User");

  const fragmentData = await UserCard_user.read(data.user);
  expect(fragmentData).toEqual({
    id: "1",
    name: "Ada",
    avatarUrl: "/ada.png",
  });

  const avatarData = await UserAvatar_image.read(fragmentData);
  expect(avatarData).toEqual({
    avatarUrl: "/ada.png",
  });
});

test("query.read uses the normalized cache before fetching", async () => {
  const UserPage_query = gql.query`
    query UserPage_query($id: ID!) {
      user(id: $id) {
        id
        name
      }
    }
  `;

  let calls = 0;
  createEnvironment({
    fetcher: async () => {
      calls += 1;
      return {
        data: {
          user: {
            id: "2",
            name: "Grace",
          },
        },
      };
    },
  });

  await UserPage_query.load({ id: "2" });
  const cached = await UserPage_query.read({ id: "2" });

  expect(cached).toEqual({
    user: {
      id: "2",
      name: "Grace",
    },
  });
  expect(calls).toBe(1);
});

test("environment.cache exposes Apollo-style normalized cache operations", () => {
  const UserCard_user = gql.fragment`
    fragment UserCard_user on User {
      id
      name
      avatarUrl
    }
  `;

  const UserPage_query = gql.query`
    query UserPage_query($id: ID!) {
      user(id: $id) {
        id
        name
        avatarUrl
      }
    }
  `;

  const environment = createEnvironment({
    fetcher: async () => ({ data: {} }),
  });
  const watched = [];
  const unsubscribe = environment.cache.watch(snapshot => {
    watched.push(snapshot);
  });

  environment.cache.writeQuery({
    query: UserPage_query,
    variables: { id: "3" },
    data: {
      user: {
        __typename: "User",
        id: "3",
        name: "Mary",
        avatarUrl: "/mary.png",
      },
    },
  });

  expect(environment.cache.readQuery({
    query: UserPage_query,
    variables: { id: "3" },
  })).toEqual({
    user: {
      id: "3",
      name: "Mary",
      avatarUrl: "/mary.png",
    },
  });

  environment.cache.writeFragment({
    fragment: UserCard_user,
    from: "User:3",
    data: {
      __typename: "User",
      id: "3",
      name: "Mary Jackson",
      avatarUrl: "/jackson.png",
    },
  });

  expect(environment.cache.readFragment({
    fragment: UserCard_user,
    from: "User:3",
  })).toEqual({
    id: "3",
    name: "Mary Jackson",
    avatarUrl: "/jackson.png",
  });

  expect(environment.cache.modify({
    id: "User:3",
    fields: {
      name: value => `${String(value)}!`,
    },
  })).toBe(true);

  expect(environment.cache.readFragment({
    fragment: UserCard_user,
    from: { $ref: "User:3" },
  })).toEqual({
    id: "3",
    name: "Mary Jackson!",
    avatarUrl: "/jackson.png",
  });

  const snapshot = environment.cache.extract();
  const restoredEnvironment = createEnvironment({
    fetcher: async () => ({ data: {} }),
    snapshot,
    setAsDefault: false,
  });

  expect(restoredEnvironment.cache.readFragment({
    fragment: UserCard_user,
    from: "User:3",
  })).toEqual({
    id: "3",
    name: "Mary Jackson!",
    avatarUrl: "/jackson.png",
  });

  expect(restoredEnvironment.cache.evict({ id: "User:3" })).toBe(true);
  expect(restoredEnvironment.cache.readFragment({
    fragment: UserCard_user,
    from: "User:3",
  })).toBe(null);

  unsubscribe();
  expect(watched.length).toBe(3);
});

test("mutation.action maps FormData to a single input variable", async () => {
  const UpdateProfile = gql.mutation`
    mutation UpdateProfile($input: UpdateProfileInput!) {
      updateProfile(input: $input) {
        user {
          id
          name
          bio
        }
      }
    }
  `;

  const variablesSeen = [];
  createEnvironment({
    fetcher: async context => {
      variablesSeen.push(context.variables);
      return {
        data: {
          updateProfile: {
            user: {
              id: "1",
              name: context.variables.input.name,
              bio: context.variables.input.bio,
            },
          },
        },
      };
    },
  });

  const form = new FormData();
  form.set("name", "Ada");
  form.set("bio", "Analytical engine notes");

  const data = await UpdateProfile.action(form);

  expect(variablesSeen).toEqual([
    {
      input: {
        name: "Ada",
        bio: "Analytical engine notes",
      },
    },
  ]);
  expect(data.updateProfile.user.name).toBe("Ada");
});

test("subscriptions write incoming payloads into the same store cell", () => {
  const UserUpdated = gql.subscription`
    subscription UserUpdated($id: ID!) {
      userUpdated(id: $id) {
        id
        name
      }
    }
  `;

  let listener = null;
  const environment = createEnvironment({
    fetcher: async () => ({ data: {} }),
    subscriber: (context, sink) => {
      listener = sink;
      return () => {
        listener = null;
      };
    },
  });

  const values = [];
  const unsubscribeStore = environment.storeCell.subscribe(() => {
    values.push(environment.storeCell.get());
  });

  const unsubscribe = UserUpdated.subscribe({ id: "1" }, data => {
    values.push(data);
  });

  listener.next({
    data: {
      userUpdated: {
        id: "1",
        name: "Katherine",
      },
    },
  });

  unsubscribe();
  unsubscribeStore();

  expect(values.length).toBe(2);
  expect(values[1]).toEqual({
    userUpdated: {
      id: "1",
      name: "Katherine",
    },
  });
});
