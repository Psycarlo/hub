import { api } from "@convex/_generated/api";
import type { UserView } from "@convex/users";
import { useQuery } from "convex/react";
import { createContext, use } from "react";

export type User = UserView;

/** The signed-in person, set once the workspace opens. */
export const MeContext = createContext<User | null>(null);

export function useMe(): User {
  const me = use(MeContext);
  if (!me) {
    throw new Error("useMe needs a MeContext provider.");
  }
  return me;
}

const NO_USERS: User[] = [];

/** Everyone with an account, by id. */
export function useUsers(): Map<string, User> {
  const users = useQuery(api.users.list) ?? NO_USERS;
  return new Map(users.map((user) => [user._id, user]));
}

/** Everyone with an account, by name. */
export function useUserList(): User[] {
  return useQuery(api.users.list) ?? NO_USERS;
}

/** How someone shows up: their name and photo, or a placeholder while loading. */
export function useUser(userId: string | undefined): {
  name: string;
  image?: string;
  user?: User;
} {
  const users = useUsers();
  const user = userId ? users.get(userId) : undefined;
  return { image: user?.image, name: user?.name ?? "Someone", user };
}
