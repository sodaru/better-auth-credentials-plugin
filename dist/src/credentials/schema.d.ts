import * as z from "zod";
import * as z3 from "zod/v3";
export type DefaultCredentialsType = {
    email: string;
    password: string;
    rememberMe?: boolean | undefined;
};
export declare const defaultCredentialsSchema: z.ZodObject<{
    email: z.ZodEmail;
    password: z.ZodString;
    rememberMe: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip> | z3.ZodObject<{
    email: z3.ZodString;
    password: z3.ZodString;
    rememberMe: z3.ZodOptional<z3.ZodBoolean>;
}, "strip", z3.ZodTypeAny, {
    email: string;
    password: string;
    rememberMe?: boolean | undefined;
}, {
    email: string;
    password: string;
    rememberMe?: boolean | undefined;
}>;
