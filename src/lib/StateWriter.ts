const SUBSTITUTE_INITIAL_VALUE_QUALITY = 0x20;

/** Adapter state methods used to write acknowledged output states. */
export interface AcknowledgedStateWriter {
	/** Reads a state before choosing the write method. */
	getStateAsync(id: string): Promise<ioBroker.State | null | undefined>;
	/** Writes a state even when its value is unchanged. */
	setStateAsync(id: string, value: ioBroker.StateValue, ack: boolean): Promise<unknown>;
	/** Writes a state only when its value differs. */
	setStateChangedAsync(id: string, value: ioBroker.StateValue, ack: boolean): Promise<unknown>;
}

/**
 * Acknowledges initial or unacknowledged values before using change-only writes.
 *
 * @param adapter Adapter state methods
 * @param id Local state ID
 * @param value State value to write
 */
export async function setStateChangedOrInitialize(
	adapter: AcknowledgedStateWriter,
	id: string,
	value: ioBroker.StateValue,
): Promise<void> {
	const current = await adapter.getStateAsync(id);
	if (current?.q === SUBSTITUTE_INITIAL_VALUE_QUALITY || current?.ack === false) {
		await adapter.setStateAsync(id, value, true);
		return;
	}
	await adapter.setStateChangedAsync(id, value, true);
}
