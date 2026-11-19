export declare const E2E_WALLET_MARKERS: string[];
export declare function findE2EWalletMarkers(dir: string, markers?: string[]): { file: string; markers: string[] }[];
export declare function assertE2EWalletBuild(input: { distDir: string; enabled: boolean }): string;
