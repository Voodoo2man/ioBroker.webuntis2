/* eslint-disable @typescript-eslint/require-await */

import { expect } from "chai";
import { setStateChangedOrInitialize, type AcknowledgedStateWriter } from "./StateWriter";

describe("setStateChangedOrInitialize", () => {
	it("writes an unchanged initial default as a real acknowledged value", async () => {
		const calls: string[] = [];
		const writer: AcknowledgedStateWriter = {
			getStateAsync: async () => ({ val: false, ack: true, q: 0x20 }) as ioBroker.State,
			setStateAsync: async (_id, value, ack) => {
				calls.push(`set:${value}:${ack}`);
			},
			setStateChangedAsync: async (_id, value, ack) => {
				calls.push(`changed:${value}:${ack}`);
			},
		};

		await setStateChangedOrInitialize(writer, "test.hasSchool", false);

		expect(calls).to.deep.equal(["set:false:true"]);
	});

	it("uses change-only writes after initial quality has cleared", async () => {
		const calls: string[] = [];
		const writer: AcknowledgedStateWriter = {
			getStateAsync: async () => ({ val: false, ack: true, q: 0 }) as ioBroker.State,
			setStateAsync: async () => {
				calls.push("set");
			},
			setStateChangedAsync: async (_id, value, ack) => {
				calls.push(`changed:${value}:${ack}`);
			},
		};

		await setStateChangedOrInitialize(writer, "test.hasSchool", false);

		expect(calls).to.deep.equal(["changed:false:true"]);
	});

	it("acknowledges unchanged unacknowledged values", async () => {
		const calls: string[] = [];
		const writer: AcknowledgedStateWriter = {
			getStateAsync: async () => ({ val: "[]", ack: false, q: 0 }) as ioBroker.State,
			setStateAsync: async (_id, value, ack) => {
				calls.push(`set:${value}:${ack}`);
			},
			setStateChangedAsync: async () => {
				calls.push("changed");
			},
		};

		await setStateChangedOrInitialize(writer, "inbox.unread", "[]");

		expect(calls).to.deep.equal(["set:[]:true"]);
	});
});
