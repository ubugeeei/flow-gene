/* @flow strict */

import type {
  Environment,
} from "./Types";

let defaultEnvironment: ?Environment = null;

export function setDefaultEnvironment(environment: Environment): Environment {
  defaultEnvironment = environment;
  return environment;
}

export function getDefaultEnvironment(): Environment {
  if (defaultEnvironment == null) {
    throw new Error(
      "flow-gene needs an environment. Call createEnvironment({ fetcher }) or pass { environment }.",
    );
  }

  return defaultEnvironment;
}

export function resolveEnvironment(options?: { +environment?: Environment, ... }): Environment {
  if (options?.environment != null) {
    return options.environment;
  }

  return getDefaultEnvironment();
}
