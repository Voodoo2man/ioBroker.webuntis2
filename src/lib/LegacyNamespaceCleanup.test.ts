import { expect } from "chai";
import { cleanupLegacyNamespace, type NamespaceCleanupAdapter } from "./LegacyNamespaceCleanup";

describe("legacy namespace cleanup", () => {
	it("removes an existing namespace recursively", async () => {
		const deleted: Array<{ id: string; recursive: boolean }> = [];
		const adapter: NamespaceCleanupAdapter = {
			getObjectAsync: id => Promise.resolve(id === "messages" ? { type: "channel" } : null),
			delObjectAsync: (id, options) => {
				deleted.push({ id, recursive: options.recursive });
				return Promise.resolve();
			},
		};

		await cleanupLegacyNamespace(adapter, "messages");

		expect(deleted).to.deep.equal([{ id: "messages", recursive: true }]);
	});

	it("does nothing when the namespace does not exist", async () => {
		let deleteCalls = 0;
		const adapter: NamespaceCleanupAdapter = {
			getObjectAsync: () => Promise.resolve(null),
			delObjectAsync: () => {
				deleteCalls += 1;
				return Promise.resolve();
			},
		};

		await cleanupLegacyNamespace(adapter, "messages");
		await cleanupLegacyNamespace(adapter, "messages");

		expect(deleteCalls).to.equal(0);
	});

	it("does not touch other namespaces", async () => {
		const requested: string[] = [];
		const adapter: NamespaceCleanupAdapter = {
			getObjectAsync: id => {
				requested.push(id);
				return Promise.resolve(null);
			},
			delObjectAsync: () => Promise.resolve(),
		};

		await cleanupLegacyNamespace(adapter, "messages");

		expect(requested).to.deep.equal(["messages"]);
	});
});
