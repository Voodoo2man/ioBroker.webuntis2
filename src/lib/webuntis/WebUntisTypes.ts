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
	| "ABORTED"
	| "UNSUPPORTED_LOGIN"
	| "INVALID_RESPONSE"
	| "HTML_RESPONSE"
	| "REDIRECTED"
	| "SESSION_EXPIRED"
	| "FORBIDDEN"
	| "MODULE_UNAVAILABLE"
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
	schoolCookieFormat?: "base64" | "plain";
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
	responseShape?: string;
	authContext?: "cookie" | "bearer";
	childScope?: "self" | "unresolved" | "unique" | "ambiguous" | "not-applicable";
	linkedStudentCount?: number;
	tenantIdPresent?: boolean;
	schoolYearIdPresent?: boolean;
	contextLoaded?: boolean;
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

export interface WebUntisInboxMessage {
	id: number | string;
	readInWebUntis: boolean;
	dateTime: string;
	sender: string;
	subject: string;
	content: string;
	contentIsPreview: boolean;
	hasAttachments: boolean;
}

export interface WebUntisMessageOfDay {
	id: string;
	subject: string;
	text: string;
	hasAttachments: boolean;
}

export interface WebUntisStudentIdentity {
	id: number;
	name: string;
}

export interface WebUntisSchoolYear {
	id: number;
	name: string;
	startDate: string;
	endDate: string;
}

export type WebUntisHomeworkStatus = boolean | "unknown";

export interface WebUntisHomework {
	id: string | number;
	date?: string;
	dueDate?: string;
	text?: string;
	remark?: string;
	attachments?: unknown[];
	lessonId?: number;
	studentId?: number;
	subject?: string;
	teacher?: string;
	status: WebUntisHomeworkStatus;
}

export interface WebUntisAbsence {
	id: number;
	studentId: number;
	startDate: string;
	endDate: string;
	startTime?: number;
	endTime?: number;
	reason?: string;
	text?: string;
	createDate?: number;
	lastUpdate?: number;
	createdUser?: string;
	updatedUser?: string;
	reasonId?: number;
	interruptions?: unknown;
	canEdit?: boolean;
	studentName?: string;
	excuseId?: number;
	excuseUserId?: number;
	excuseUsername?: string;
	isExcused?: boolean;
	excuseStatus: string;
	excuseText?: string;
	excuseDate?: string;
}

export interface WebUntisAbsenceResponse {
	absences: WebUntisAbsence[];
	absenceReasons: unknown;
	excuseStatuses: unknown;
	showAbsenceReasonChange?: boolean;
	showCreateAbsence?: boolean;
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
