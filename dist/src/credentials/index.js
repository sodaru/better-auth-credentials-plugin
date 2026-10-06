// Adaptado de https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/plugins/username/index.ts
// e https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/api/routes/sign-in.ts
import { createAuthEndpoint, sendVerificationEmailFn } from "better-auth/api";
import { CREDENTIALS_ERROR_CODES as CREDENTIALS_ERROR_CODES } from "./error-codes.js";
import { setSessionCookie } from "better-auth/cookies";
import { APIError } from "@better-auth/core/error";
import { defaultCredentialsSchema } from "./schema.js";
import { parseUserOutput } from "better-auth/db";
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
export const credentials = (options, betterAuthOptions) => {
    const inputSchema = (options.inputSchema || defaultCredentialsSchema);
    return {
        id: "credentials",
        options: options,
        endpoints: {
            signInCredentials: createAuthEndpoint(
            // Endpoints are inferred from the server plugin by adding a $InferServerPlugin key to the client plugin.
            // Without this 'as' key the inferred client plugin would not work properly.
            (options.path || "/sign-in/credentials"), {
                method: "POST",
                body: inputSchema,
                metadata: {
                    $Infer: {
                        body: {},
                        returned: {},
                    },
                    openapi: {
                        summary: "Sign in with Credentials",
                        description: "Sign in with credentials using the user's email and password or other configured fields.",
                        responses: {
                            200: {
                                description: "Success",
                                content: {
                                    "application/json": {
                                        schema: {
                                            type: "object",
                                            properties: {
                                                token: {
                                                    type: "string",
                                                    description: "Session token for the authenticated session",
                                                },
                                                user: {
                                                    $ref: "#/components/schemas/User",
                                                },
                                            },
                                            required: ["token", "user"],
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }, async (ctx) => {
                // ================== 1. Validate the input data ===================
                // TODO: double check if the body was *really* parsed against the input schema
                const parsed = ctx.body;
                if (!parsed || typeof parsed !== "object") {
                    ctx.context.logger.error("Invalid request body", { credentials });
                    throw APIError.from("INTERNAL_SERVER_ERROR", CREDENTIALS_ERROR_CODES.UNEXPECTED_ERROR);
                }
                // ================== 2. Calling Callback Function ===================
                let callbackResult;
                try {
                    callbackResult = await options.callback(ctx, parsed);
                    if (!callbackResult) {
                        ctx.context.logger.error("Authentication failed, callback didn't returned user data", { credentials });
                        throw new Error("Authentication failed: callback didn't returned user data");
                    }
                }
                catch (e) {
                    ctx.context.logger.error("Authentication failed", { error: e, credentials });
                    if (e instanceof APIError) {
                        throw e;
                    }
                    throw APIError.from("UNAUTHORIZED", CREDENTIALS_ERROR_CODES.INVALID_CREDENTIALS);
                }
                let { onSignIn, onSignUp, onLinkAccount, email, providerId, ..._userData } = callbackResult;
                let userData = _userData;
                // Fallback email from body if not provided in callback result
                if (!email) {
                    email = "email" in parsed && typeof parsed.email === "string" ? parsed.email : undefined;
                    if (!email) {
                        ctx.context.logger.error("Email is required for credentials authentication", { credentials });
                        throw APIError.from("UNPROCESSABLE_ENTITY", CREDENTIALS_ERROR_CODES.EMAIL_REQUIRED);
                    }
                }
                email = email.toLowerCase();
                // ================== 3. Find User by email ===================
                let user = await ctx.context.adapter.findOne({
                    model: "user",
                    where: [
                        {
                            field: "email",
                            value: email,
                        },
                    ],
                });
                // If no user is found and autoSignUp is not enabled, throw an error
                if (!options.autoSignUp && !user) {
                    // TODO: timing attack mitigation?
                    ctx.context.logger.error("User not found", { credentials });
                    // TODO: Opaque UNAUTHORIZED error thrown, Check if error should be passed through to the client
                    throw APIError.from("UNAUTHORIZED", CREDENTIALS_ERROR_CODES.INVALID_CREDENTIALS);
                }
                // If email verification is required, return early
                if (user && !user.emailVerified &&
                    ctx.context.options.emailAndPassword?.requireEmailVerification) {
                    await sendVerificationEmailFn(ctx, user);
                    throw APIError.from("FORBIDDEN", CREDENTIALS_ERROR_CODES.EMAIL_NOT_VERIFIED);
                }
                let account = null;
                if (!user) {
                    // ===================================================================
                    // =                          SIGN UP                                =
                    // =      Create a new User and Account, for this provider           =
                    // ===================================================================
                    // 
                    // ================== 4. create new User ====================
                    try {
                        if (onSignUp && typeof onSignUp === "function") {
                            const newData = await onSignUp({ email: email, ...userData });
                            if (!newData) {
                                throw new Error("onSignUp callback returned null, failed sign up");
                            }
                            userData = newData;
                        }
                        if (!userData || !email) {
                            throw APIError.from("UNPROCESSABLE_ENTITY", CREDENTIALS_ERROR_CODES.EMAIL_REQUIRED);
                        }
                        delete userData.email;
                        const { name, ...restUserData } = userData;
                        user = await ctx.context.internalAdapter.createUser({
                            email: email,
                            name: name, // Yes, the type is wrong, NAME IS OPTIONAL
                            emailVerified: false,
                            ...restUserData,
                        });
                    }
                    catch (e) {
                        ctx.context.logger.error("Failed to create user", e);
                        if (e instanceof APIError) {
                            throw e;
                        }
                        throw APIError.from("UNAUTHORIZED", CREDENTIALS_ERROR_CODES.INVALID_CREDENTIALS);
                    }
                    if (!user) {
                        ctx.context.logger.error("Failed to create user without errors, adapter returned falsy", { user });
                        throw APIError.from("INTERNAL_SERVER_ERROR", CREDENTIALS_ERROR_CODES.UNEXPECTED_ERROR);
                    }
                    // ================== 5. create new Account ====================
                    let accountData = {};
                    try {
                        if (onLinkAccount && typeof onLinkAccount === "function") {
                            accountData = await onLinkAccount(user);
                        }
                    }
                    catch (e) {
                        // Undoing the user creation if account linking fails, to avoid having users without accounts
                        ctx.context.logger.error("Failed to get account data from onLinkAccount callback during sign-up, cleaning up: deleting newly created user...", e);
                        await ctx.context.internalAdapter.deleteUser(user.id);
                        if (e instanceof APIError) {
                            throw e;
                        }
                        throw APIError.from("UNAUTHORIZED", CREDENTIALS_ERROR_CODES.INVALID_CREDENTIALS);
                    }
                    account = await ctx.context.internalAdapter.linkAccount({
                        userId: user.id,
                        providerId: callbackResult?.providerId || options.providerId || "credential",
                        accountId: user.id,
                        ...accountData
                    });
                    // If the user is created, we can send the verification email if required
                    if (!user.emailVerified &&
                        (ctx.context.options.emailVerification?.sendOnSignUp ||
                            ctx.context.options.emailAndPassword?.requireEmailVerification)) {
                        await sendVerificationEmailFn(ctx, user);
                        // If email verification is required, just return the user without a token and no session is created (this mimics the behavior of the email and password sign-up flow)
                        if (ctx.context.options.emailAndPassword?.requireEmailVerification) {
                            return ctx.json({
                                token: null,
                                user: parseUserOutput(ctx.context.options, user),
                            });
                        }
                    }
                }
                else {
                    // ===================================================================
                    // =                          SIGN IN                                =
                    // =                  Find/Link Account, for this provider           =
                    // ===================================================================
                    // 
                    // =============== 4.  Get the user account with the chosen provider ==============
                    account = await ctx.context.adapter.findOne({
                        model: "account",
                        where: [
                            {
                                field: "userId",
                                value: user.id,
                            },
                            {
                                field: "providerId",
                                value: callbackResult?.providerId || options.providerId || "credential",
                            },
                        ],
                    });
                    if ((!options.autoSignUp || !options.linkAccountIfExisting) && !account) {
                        ctx.context.logger.error("User exists but no account found for this provider", { credentials });
                        // TODO: Opaque UNAUTHORIZED error thrown, Check if error should be passed through to the client
                        throw APIError.from("UNAUTHORIZED", CREDENTIALS_ERROR_CODES.INVALID_CREDENTIALS);
                    }
                    if (account && account.providerId === "credential" && account.password) {
                        ctx.context.logger.error("Shouldn't login with credentials, this user has a account with password", { credentials });
                        // TODO: Opaque UNAUTHORIZED error thrown, Check if error should be passed through to the client
                        throw APIError.from("UNAUTHORIZED", CREDENTIALS_ERROR_CODES.INVALID_CREDENTIALS);
                    }
                    // =============== 5. Update user data ==============
                    try {
                        if (onSignIn && typeof onSignIn === "function") {
                            const newData = await onSignIn({ email: email, ...userData }, user, account);
                            if (!newData) {
                                throw new Error("onSignIn callback returned null, failed on sign in");
                            }
                            userData = newData;
                        }
                    }
                    catch (e) {
                        ctx.context.logger.error("Failed to update user data on sign in", e);
                        if (e instanceof APIError) {
                            throw e;
                        }
                        throw APIError.from("UNAUTHORIZED", CREDENTIALS_ERROR_CODES.INVALID_CREDENTIALS);
                    }
                    // Doing the linking after onSignIn callback, so if it fails no account is created
                    if (!account) {
                        // Create an account for the user if it doesn't exist
                        let accountData = {};
                        try {
                            if (onLinkAccount && typeof onLinkAccount === "function") {
                                accountData = await onLinkAccount(user);
                            }
                        }
                        catch (e) {
                            ctx.context.logger.error("Failed to get account data from onLinkAccount callback during sign-in", e);
                            if (e instanceof APIError) {
                                throw e;
                            }
                            throw APIError.from("UNAUTHORIZED", CREDENTIALS_ERROR_CODES.INVALID_CREDENTIALS);
                        }
                        account = await ctx.context.internalAdapter.linkAccount({
                            userId: user.id,
                            providerId: callbackResult?.providerId || options.providerId || "credential",
                            accountId: user.id,
                            ...accountData
                        });
                    }
                    // Update the user with the new data (excluding email)
                    if (userData) {
                        delete userData.email;
                        if (Object.keys(userData).length > 0) {
                            user = (await ctx.context.internalAdapter.updateUser(user.id, userData));
                        }
                    }
                }
                // ===================================================================
                // =                          AUTHENTICATED!                         =
                // =                   Proceed with login flow                       =
                // ===================================================================
                const rememberMe = "rememberMe" in parsed ? parsed.rememberMe : false;
                const session = await ctx.context.internalAdapter.createSession(user.id, rememberMe === false);
                if (!session) {
                    ctx.context.logger.error("Failed to create session");
                    throw APIError.from("INTERNAL_SERVER_ERROR", CREDENTIALS_ERROR_CODES.FAILED_TO_CREATE_SESSION);
                }
                await setSessionCookie(ctx, { session, user }, rememberMe === false);
                // =============== Response with user data ==============
                return ctx.json({
                    token: session.token,
                    user: parseUserOutput(ctx.context.options, user),
                });
            }),
        },
        $ERROR_CODES: CREDENTIALS_ERROR_CODES,
    };
};
