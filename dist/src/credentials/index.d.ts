import { Account, BetterAuthOptions, User } from "better-auth";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { AuthEndpointContext } from "@better-auth/core/context";
type GetBodyParsed<Z> = Z extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<Z> : {
    email: string;
    password: string;
    rememberMe?: boolean | undefined;
};
type MaybePromise<T> = T | Promise<T>;
export type CallbackResult<U extends User> = (Partial<U> & {
    onSignUp?: (userData: Partial<U>) => MaybePromise<Partial<U> | null>;
    onSignIn?: (userData: Partial<U>, user: U, account: Account | null) => MaybePromise<Partial<U> | null>;
    onLinkAccount?: (user: U) => MaybePromise<Partial<Account>>;
    providerId?: string;
}) | null | undefined;
export type CredentialOptions<U extends User = User, P extends string = "/sign-in/credentials", Z extends (StandardSchemaV1 | undefined) = undefined> = {
    /**
     * Function that receives the credential and password and returns a Promise with the partial user data to be updated.
     *
     * If the user does not exists it will be created if `autoSignUp` is true, in this case a
     * the returned user data will be used to create the user, otherwise, if the user exists, it will be updated with the returned user data.
     *
     * If a custom inputSchema is set and it hasn't an `email` field, then you should return the `email` field to uniquely identify the user (Better auth can't operate without emails anyway).
     *
     * The `onSignIn` and `onSignUp` callbacks are optional, but if returned they will be called to handle updating the user data differently based if the user is signing in or signing up.
     *
     * The `onLinkAccount` callback is called whenever a Account is created or if the user already exists and an account is linked to the user, use it to store custom data on the Account.
     */
    callback: (ctx: AuthEndpointContext, parsed: GetBodyParsed<Z>) => MaybePromise<CallbackResult<U>>;
    /**
     * Schema for the input data, if not provided it will use the default schema that mirrors default email and password with rememberMe option.
     *
     * Supports any Standard Schema compatible validator (e.g. Zod v3/v4, Valibot, ArkType, etc).
     */
    inputSchema?: Z;
    /**
     * Whether to sign up the user if they successfully authenticate but do not exist locally
     * @default false
     */
    autoSignUp?: boolean;
    /**
     * If is allowed to link an account to an existing user without an Account of this provider (No effect if autoSignUp is false).
     *
     * Basically, if the user already exists, but with another provider (e.g. email and password), if this is true a
     * new Account will be created and linked to this user (as if new login method), otherwise it will throw an error.
     * @default false
     */
    linkAccountIfExisting?: boolean;
    /**
     * The Id of the provider to be used for the account created, fallback to "credential", the same used by the email and password flow.
     *
     * Obs: If you are using this plugin with the email and password plugin enabled and did not change the providerId, users that have a password set will not be able to log in with this credentials plugin.
     * @default "credential"
     */
    providerId?: string;
    /**
     * The path for the endpoint
     * @default "/sign-in/credentials"
     */
    path?: P;
    /**
     * This is used to infer the User type to be used, never used otherwise. If not provided it will be the default User type.
     *
     * For example, to add a lastLogin input value:
     * @example {} as User & {lastLogin: Date}
     */
    UserType?: U;
};
/**
 * Customized Credentials plugin for BetterAuth.
 *
 * The options allow you to customize the input schema, the callback function, and other behaviors.
 *
 * Summary of the stages of this authentication flow:
 * 1. Validate the input data against `inputSchema`
 * 2. Call the `callback` function
 *   - If the callback throws an error, or doesn't return a object with user data, a generic 401 Unauthorized error is thrown.
 * 3. Find the user by email (given by callback or parsed input), if exists proceed to [SIGN IN], if not [SIGN UP] (only when `autoSignUp` is true).
 *
 * **[SIGN IN]**
 *
 * 4. Find the Account with the providerId
 *   - If the account is not found, and `linkAccountIfExisting` or `autoSignUp` is false, login fails with a 401 Unauthorized error.
 * 5. If provided, Call the `onSignIn` callback function, but yet don't update the user data.
 * 6. If no Account was found on step 4. call the `onLinkAccount` callback function to get the account data to be stored, and then create a new Account for the user with the providerId.
 * 7. Update the user with the provided data (Either returned by the auth callback function or the `onSignIn` callback function).
 *
 * **[SIGN UP]**
 *
 * 4. If provided, call the `onSignUp` callback function to get the user data to be stored.
 * 5. Create a new User with the provided data (Either returned by the auth callback function or the `onSignUp` callback function).
 * 5. If provided, call the `onLinkAccount` callback function to get the account data to be stored
 * 6. Then create a new Account for the user with the providerId.
 *
 * **[AUTHENTICATED!]**
 *
 * 6. Create a new session for the user and set the session cookie.
 * 7. Return the user data and the session token.
 *
 * @example
 * ```ts
 * credentials({
 *   autoSignUp: true,
 *   callback: async (ctx, parsed) => {
 *     // 1. Verify the credentials
 *
 *     // 2. On success, return the user data
 *     return {
 *       email: parsed.email
 *     };
 * })
 */
export declare const credentials: <U extends User = User, P extends string = "/sign-in/credentials", Z extends (StandardSchemaV1 | undefined) = undefined, O extends (BetterAuthOptions | undefined) = undefined>(options: CredentialOptions<U, P, Z>, betterAuthOptions?: O) => {
    id: "credentials";
    options: CredentialOptions<U, P, Z>;
    endpoints: {
        signInCredentials: import("better-auth").StrictEndpoint<P, {
            method: "POST";
            body: Z extends undefined ? import("better-auth").ZodObject<{
                email: import("better-auth").ZodEmail;
                password: import("better-auth").ZodString;
                rememberMe: import("better-auth").ZodOptional<import("better-auth").ZodBoolean>;
            }, import("better-auth").$strip> | import("zod/v3").ZodObject<{
                email: import("zod/v3").ZodString;
                password: import("zod/v3").ZodString;
                rememberMe: import("zod/v3").ZodOptional<import("zod/v3").ZodBoolean>;
            }, "strip", import("zod/v3").ZodTypeAny, {
                email: string;
                password: string;
                rememberMe?: boolean | undefined;
            }, {
                email: string;
                password: string;
                rememberMe?: boolean | undefined;
            }> : Z;
            metadata: {
                $Infer: {
                    body: GetBodyParsed<Z>;
                    returned: {
                        redirect: boolean;
                        token: string;
                        url?: string | undefined;
                        user: O extends BetterAuthOptions ? {
                            id: string;
                            createdAt: Date;
                            updatedAt: Date;
                            email: string;
                            emailVerified: boolean;
                            name: string;
                            image?: string | null | undefined;
                        } & import("better-auth").InferDBFieldsFromOptions<O["user"]> & import("better-auth").InferDBFieldsFromPlugins<"user", O["plugins"]> extends infer T ? { [K in keyof T]: T[K]; } : never : U;
                    };
                };
                openapi: {
                    summary: string;
                    description: string;
                    responses: {
                        200: {
                            description: string;
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object";
                                        properties: {
                                            token: {
                                                type: string;
                                                description: string;
                                            };
                                            user: {
                                                $ref: string;
                                            };
                                        };
                                        required: string[];
                                    };
                                };
                            };
                        };
                    };
                };
            };
        }, {
            token: string | null;
            user: O extends BetterAuthOptions ? {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                email: string;
                emailVerified: boolean;
                name: string;
                image?: string | null | undefined;
            } & import("better-auth").InferDBFieldsFromOptions<O["user"]> & import("better-auth").InferDBFieldsFromPlugins<"user", O["plugins"]> extends infer T_1 ? { [K in keyof T_1]: T_1[K]; } : never : U;
        }>;
    };
    $ERROR_CODES: {
        UNEXPECTED_ERROR: import("better-auth").RawError<"UNEXPECTED_ERROR">;
        INVALID_CREDENTIALS: import("better-auth").RawError<"INVALID_CREDENTIALS">;
        EMAIL_REQUIRED: import("better-auth").RawError<"EMAIL_REQUIRED">;
        EMAIL_NOT_VERIFIED: import("better-auth").RawError<"EMAIL_NOT_VERIFIED">;
        USERNAME_IS_ALREADY_TAKEN: import("better-auth").RawError<"USERNAME_IS_ALREADY_TAKEN">;
        USER_NOT_FOUND: import("better-auth").RawError<"USER_NOT_FOUND">;
        FAILED_TO_CREATE_SESSION: import("better-auth").RawError<"FAILED_TO_CREATE_SESSION">;
        NO_USER_DATA_PROVIDED: import("better-auth").RawError<"NO_USER_DATA_PROVIDED">;
        ACCOUNT_NOT_FOUND: import("better-auth").RawError<"ACCOUNT_NOT_FOUND">;
        ACCOUNT_HAS_PASSWORD: import("better-auth").RawError<"ACCOUNT_HAS_PASSWORD">;
    };
};
export {};
