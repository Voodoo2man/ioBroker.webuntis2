/* eslint-disable jsdoc/no-blank-blocks, jsdoc/require-param */

import type { WebUntisErrorCode } from "./WebUntisTypes";

/**
 *
 */
export class WebUntisError extends Error {
	public readonly code: WebUntisErrorCode;

	/**
	 *
	 */
	public constructor(code: WebUntisErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "WebUntisError";
		this.code = code;
	}
}

/**
 *
 */
export function classifyWebUntisError(error: unknown): WebUntisErrorCode {
	if (error instanceof WebUntisError) {
		return error.code;
	}
	if (error instanceof DOMException && error.name === "AbortError") {
		return "TIMEOUT";
	}
	if (error instanceof TypeError) {
		return "SERVER_UNREACHABLE";
	}
	return "UNEXPECTED_RESPONSE";
}
