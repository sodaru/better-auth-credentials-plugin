import { BetterAuthOptions, User } from "better-auth";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { credentials } from "./index.js";
import { defaultCredentialsSchema } from "./schema.js";
export declare const credentialsClient: <U extends User = User, P extends string = "/sign-in/credentials", Z extends StandardSchemaV1 = typeof defaultCredentialsSchema, O extends (BetterAuthOptions | undefined) = undefined>() => {
    id: "credentials";
    $InferServerPlugin: ReturnType<typeof credentials<U, P, Z, O>>;
};
