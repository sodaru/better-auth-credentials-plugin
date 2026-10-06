export const isZodV4 = (schema) => {
    return "_zod" in schema;
};
