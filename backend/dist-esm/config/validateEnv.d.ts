interface EnvVariable {
    name: string;
    required: boolean;
    defaultValue?: string;
    validator?: (value: string) => boolean;
    description?: string;
}
declare const ENV_VARIABLES: EnvVariable[];
export declare function validateEnvironmentVariables(): void;
export { ENV_VARIABLES };
//# sourceMappingURL=validateEnv.d.ts.map