/* @flow */

import {
  createEnvironment,
  gql,
} from "./FlowGene";

test("query.load fetches, normalizes, and exposes a cell-backed resource", async () => {
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

  const fragmentData = await UserCard_user.read(data.user);
  expect(fragmentData).toEqual({
    id: "1",
    name: "Ada",
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
