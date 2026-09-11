/* eslint-disable jsdoc/require-jsdoc */

export interface NamespaceCleanupAdapter {
	getObjectAsync(id: string): Promise<unknown>;
	delObjectAsync(id: string, options: { recursive: boolean }): Promise<void>;
}

export async function cleanupLegacyNamespace(adapter: NamespaceCleanupAdapter, namespace: string): Promise<void> {
	if (await adapter.getObjectAsync(namespace)) {
		await adapter.delObjectAsync(namespace, { recursive: true });
	}
}
