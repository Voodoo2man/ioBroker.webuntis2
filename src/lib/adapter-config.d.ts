// This file extends the AdapterConfig type from "@iobroker/types"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig {
			server: string;
			schoolName: string;
			schoolDisplayName: string;
			schoolAddress: string;
			schoolId: number | null;
			username: string;
			password: string;
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
