/* @flow strict */

import type {
  FragmentDocument,
  FragmentRef,
  GeneCache,
  QueryDocument,
  Resource,
} from "flow-gene";
import {
  createEnvironment,
  gql,
} from "flow-gene";
import type {
  Readable,
} from "flow-cell/server";

type User = {
  +id: string,
  +name: string,
  +avatarUrl?: string,
};

const UserAvatar_image: FragmentDocument<{
  +avatarUrl?: string,
}> = gql.fragment`
  fragment UserAvatar_image on User {
    avatarUrl
  }
`;

const UserCard_user: FragmentDocument<User> = gql.fragment`
  fragment UserCard_user on User {
    id
    name
    ...UserAvatar_image
  }
`;

const UserPage_query: QueryDocument<{
  +user: User,
}, {
  +id: string,
}> = gql.query`
  query UserPage_query($id: ID!) {
    user(id: $id) {
      ...UserCard_user
    }
  }
`;

const environment = createEnvironment({
  fetcher: async context => {
    const id: string = context.variables.id;
    return {
      data: {
        user: {
          id,
          name: "Ada",
        },
      },
    };
  },
});

const result: Resource<{ +user: User }> = UserPage_query.load({ id: "1" });
const status: Readable<mixed> = result.status;
const fragmentRef: FragmentRef<typeof UserCard_user> = {};
const fragmentResult: Resource<User> = UserCard_user.read(fragmentRef);
const avatarResult: Resource<{ +avatarUrl?: string }> = UserAvatar_image.read(fragmentRef);
const cache: GeneCache = environment.cache;

cache.writeQuery({
  query: UserPage_query,
  variables: { id: "1" },
  data: {
    user: {
      id: "1",
      name: "Ada",
    },
  },
});

const cachedUser: ?{ +user: User } = cache.readQuery({
  query: UserPage_query,
  variables: { id: "1" },
});

cache.modify({
  id: "id:1",
  fields: {
    name: value => value,
  },
});

void status;
void fragmentResult;
void avatarResult;
void cachedUser;
