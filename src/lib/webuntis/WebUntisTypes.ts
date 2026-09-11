/* eslint-disable jsdoc/no-blank-blocks, jsdoc/require-jsdoc */

export interface SchoolSearchResult {
	/**
	 *
	 */
	displayName: string;
	/**
	 *
	 */
	address: string;
	/**
	 *
	 */
	loginName: string;
	/**
	 *
	 */
	schoolId: number;
	/**
	 *
	 */
	server: string;
	/**
	 *
	 */
	serverUrl: string;
	/**
	 *
	 */
	mobileServiceUrl: string | null;
}

/**
 *
 */
export interface WebUntisSchoolConfig {
	/**
	 *
	 */
	server: string;
	/**
	 *
	 */
	schoolName: string;
	/**
	 *
	 */
	schoolDisplayName: string;
	/**
	 *
	 */
	schoolAddress: string;
	/**
	 *
	 */
	schoolId: number | null;
}

/**
 *
 */
export interface WebUntisConnectionConfig extends WebUntisSchoolConfig {
	/**
	 *
	 */
	username: string;
	/**
	 *
	 */
	password: string;
}

export type ConnectionResult =
	| {
			ok: true;
	  }
	| {
			ok: false;
			/**
			 *
			 */
			code: WebUntisErrorCode;
	  };

export type WebUntisErrorCode =
	| "INVALID_CONFIG"
	| "SCHOOL_NOT_SELECTED"
	| "USERNAME_REQUIRED"
	| "PASSWORD_REQUIRED"
	| "INVALID_CREDENTIALS"
	| "USER_BLOCKED"
	| "INVALID_SCHOOL"
	| "SERVER_UNREACHABLE"
	| "TIMEOUT"
	| "UNSUPPORTED_LOGIN"
	| "INVALID_RESPONSE"
	| "HTML_RESPONSE"
	| "REDIRECTED"
	| "SESSION_EXPIRED"
	| "API_REQUEST"
	| "UNEXPECTED_RESPONSE";

export interface WebUntisHttpDiagnostic {
	method?: string;
	status: number;
	contentType: string;
	url: string;
	redirected: boolean;
	length: number;
	type: "json" | "html" | "text" | "empty";
	keys?: string[];
	errorKeys?: string[];
	errorCode?: number;
	errorMessage?: string;
	cookiePresent?: boolean;
	cookieChanged?: boolean;
	sessionCookieChanged?: boolean;
	cookieCount?: number;
	sessionAgeSeconds?: number;
	sessionPresent?: boolean;
	requestSequence?: number;
	personIdPresent?: boolean;
	responseHeaders?: string[];
	personType?: number;
	klasseIdPresent?: boolean;
	elementType?: number;
	startDate?: number;
	endDate?: number;
	classIdType?: string;
	classIdPresent?: boolean;
	dataType?: string;
	dataKeys?: string[];
	classCandidateCount?: number;
	personCandidate?: boolean;
	resultKeys?: string[];
	resultType?: "array" | "object" | "primitive" | "missing";
	resultLength?: number;
}

/**
 *
 */
export interface SchoolSearchResponse {
	/**
	 *
	 */
	size: number;
	/**
	 *
	 */
	schools: unknown[];
}

/**
 *
 */
export interface AuthenticationResponse {
	/**
	 *
	 */
	sessionId: string;
	/**
	 *
	 */
	personType: number;
	/**
	 *
	 */
	personId: number;
	/**
	 *
	 */
	klasseId: number;
}

export interface WebUntisSession extends AuthenticationResponse {
	sessionId: string;
}

export interface WebUntisPeriod {
	[key: string]: unknown;
}

export interface TimetableQuery {
	startDate: number;
	endDate: number;
	element: {
		id: number;
		type: number;
	};
	onlyBaseTimetable: boolean;
	showBooking: boolean;
	showInfo: boolean;
	showSubstText: boolean;
	showLsText: boolean;
	showLsNumber: boolean;
	showStudentgroup: boolean;
}
