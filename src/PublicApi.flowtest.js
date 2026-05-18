/* @flow strict */

import type {
  FragmentDocument,
  FragmentRef,
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

const UserCard_user: FragmentDocument<User> = gql.fragment`
  fragment UserCard_user on User {
    id
    name
    avatarUrl
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

createEnvironment({
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

void status;
void fragmentResult;
