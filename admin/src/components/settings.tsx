import React from "react";
import AccountCircleIcon from "@material-ui/icons/AccountCircle";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import EditIcon from "@material-ui/icons/Edit";
import LockIcon from "@material-ui/icons/Lock";
import SearchIcon from "@material-ui/icons/Search";
import VisibilityIcon from "@material-ui/icons/Visibility";
import VisibilityOffIcon from "@material-ui/icons/VisibilityOff";
import Button from "@material-ui/core/Button";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import CardHeader from "@material-ui/core/CardHeader";
import CircularProgress from "@material-ui/core/CircularProgress";
import IconButton from "@material-ui/core/IconButton";
import InputAdornment from "@material-ui/core/InputAdornment";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import Paper from "@material-ui/core/Paper";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import { type StyleRules, type Theme, withStyles } from "@material-ui/core/styles";
import I18n from "@iobroker/adapter-react/i18n";
import { rankSchoolResults } from "../../../src/lib/webuntis/SchoolDiscovery";
import type { SchoolSearchResult } from "../../../src/lib/webuntis/WebUntisTypes";

type SchoolResult = SchoolSearchResult;

const styles = (theme: Theme): StyleRules => ({
	root: {
		maxWidth: 920,
		margin: "0 auto",
		padding: theme.spacing(3, 2.5, 4),
		[theme.breakpoints.down("xs")]: { padding: theme.spacing(2, 1.5, 3) },
	},
	header: { display: "flex", alignItems: "center", gap: theme.spacing(1.5), marginBottom: theme.spacing(2.5) },
	headerIcon: { fontSize: 36, color: theme.palette.primary.main },
	card: { marginTop: theme.spacing(2) },
	cardContent: { paddingTop: 0 },
	help: { marginBottom: theme.spacing(1.5), color: theme.palette.text.secondary },
	selected: {
		display: "flex",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: theme.spacing(2),
		padding: theme.spacing(1.5),
		marginTop: theme.spacing(1),
		[theme.breakpoints.down("xs")]: { flexDirection: "column" },
	},
	selectedDetails: { display: "flex", gap: theme.spacing(1), minWidth: 0 },
	selectedIcon: { color: theme.palette.success.main, marginTop: 2 },
	address: { wordBreak: "break-word" },
	results: {
		marginTop: theme.spacing(1.5),
		border: `1px solid ${theme.palette.divider}`,
		borderRadius: theme.shape.borderRadius,
	},
	result: {
		borderBottom: `1px solid ${theme.palette.divider}`,
		"&:last-child": { borderBottom: "none" },
	},
	actions: {
		display: "flex",
		alignItems: "center",
		gap: theme.spacing(1.5),
		marginTop: theme.spacing(2),
		flexWrap: "wrap",
	},
	status: { marginTop: theme.spacing(2) },
	statusSuccess: { borderColor: theme.palette.success.main, color: theme.palette.success.main },
	statusError: { borderColor: theme.palette.error.main, color: theme.palette.error.main },
});

interface SettingsProps {
	classes: Record<string, string>;
	native: Record<string, unknown>;
	socket: {
		sendTo: (
			instance: string,
			command: string,
			data: unknown,
		) => Promise<{ ok?: boolean; code?: string; results?: SchoolResult[] } | undefined>;
	};
	instance: string;
	onChange: (attr: string, value: unknown) => void;
	onSchoolSelected: (school: SchoolResult) => void;
}

interface SettingsState {
	query: string;
	results: SchoolResult[];
	searching: boolean;
	testing: boolean;
	status: string;
	searchMode: boolean;
	showPassword: boolean;
}

class Settings extends React.Component<SettingsProps, SettingsState> {
	public state: SettingsState = {
		query: "",
		results: [],
		searching: false,
		testing: false,
		status: "",
		searchMode: false,
		showPassword: false,
	};

	private translate(value: string): string {
		return I18n.t(value as AdminWord);
	}

	private async search(): Promise<void> {
		this.setState({ searching: true, status: "" });
		try {
			const response = await this.props.socket.sendTo(this.props.instance, "searchSchools", {
				query: this.state.query,
			});
			this.setState({
				results: rankSchoolResults(response?.results ?? [], this.state.query),
				status: response?.code ?? "",
			});
		} catch {
			this.setState({ status: "SERVER_UNREACHABLE" });
		} finally {
			this.setState({ searching: false });
		}
	}

	private async testConnection(): Promise<void> {
		if (
			typeof this.props.native.schoolId !== "number" ||
			!this.props.native.server ||
			!this.props.native.schoolName
		) {
			this.setState({ status: "SCHOOL_NOT_SELECTED" });
			return;
		}
		this.setState({ testing: true, status: "" });
		try {
			const response = await this.props.socket.sendTo(this.props.instance, "testConnection", this.props.native);
			this.setState({ status: response?.ok ? "CONNECTED" : (response?.code ?? "UNEXPECTED_RESPONSE") });
		} catch {
			this.setState({ status: "SERVER_UNREACHABLE" });
		} finally {
			this.setState({ testing: false });
		}
	}

	private selectSchool(school: SchoolResult): void {
		this.props.onSchoolSelected(school);
		this.setState({ results: [], status: "SCHOOL_SELECTED", searchMode: false });
	}

	private renderField(label: string, key: string, type = "text"): React.JSX.Element {
		const password = key === "password";
		return (
			<TextField
				fullWidth
				margin="dense"
				label={this.translate(label)}
				type={password && this.state.showPassword ? "text" : type}
				autoComplete={password ? "current-password" : "username"}
				value={this.props.native[key] ?? ""}
				onChange={event => this.props.onChange(key, event.target.value)}
				InputProps={{
					startAdornment: (
						<InputAdornment position="start">
							{password ? <LockIcon fontSize="small" /> : <AccountCircleIcon fontSize="small" />}
						</InputAdornment>
					),
					...(password
						? {
								endAdornment: (
									<InputAdornment position="end">
										<IconButton
											type="button"
											onClick={() => this.setState({ showPassword: !this.state.showPassword })}
											aria-label={this.translate(
												this.state.showPassword ? "hidePassword" : "showPassword",
											)}
											title={this.translate(
												this.state.showPassword ? "hidePassword" : "showPassword",
											)}
											edge="end"
										>
											{this.state.showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
										</IconButton>
									</InputAdornment>
								),
							}
						: {}),
				}}
			/>
		);
	}

	private renderStatus(): React.JSX.Element | null {
		if (!this.state.status) {
			return null;
		}
		const success = this.state.status === "CONNECTED" || this.state.status === "SCHOOL_SELECTED";
		return (
			<Paper
				className={`${this.props.classes.status} ${success ? this.props.classes.statusSuccess : this.props.classes.statusError}`}
				variant="outlined"
				role="alert"
				aria-live="polite"
				style={{ padding: 10, display: "flex", alignItems: "center", gap: 6 }}
			>
				{success && this.state.status === "CONNECTED" ? <CheckCircleIcon fontSize="small" /> : null}
				{this.translate(this.state.status)}
			</Paper>
		);
	}

	public render(): React.JSX.Element {
		const selected =
			typeof this.props.native.schoolDisplayName === "string" ? this.props.native.schoolDisplayName : "";
		const address = typeof this.props.native.schoolAddress === "string" ? this.props.native.schoolAddress : "";
		const showSearch = !selected || this.state.searchMode || this.state.results.length > 0;
		return (
			<form className={this.props.classes.root}>
				<header className={this.props.classes.header}>
					<SearchIcon
						className={this.props.classes.headerIcon}
						aria-hidden="true"
					/>
					<div>
						<Typography
							variant="h5"
							color="textPrimary"
						>
							WebUntis
						</Typography>
						<Typography
							variant="body2"
							color="textSecondary"
						>
							{this.translate("headerSubtitle")}
						</Typography>
					</div>
				</header>

				<Card className={this.props.classes.card}>
					<CardHeader title={this.translate("schoolCardTitle")} />
					<CardContent className={this.props.classes.cardContent}>
						<Typography
							variant="body2"
							className={this.props.classes.help}
						>
							{this.translate("schoolCardHelp")}
						</Typography>
						{selected ? (
							<Paper
								className={this.props.classes.selected}
								variant="outlined"
							>
								<div className={this.props.classes.selectedDetails}>
									<CheckCircleIcon
										className={this.props.classes.selectedIcon}
										aria-hidden="true"
									/>
									<div className={this.props.classes.address}>
										<Typography
											variant="subtitle1"
											color="textPrimary"
										>
											{selected}
										</Typography>
										{address ? (
											<Typography
												variant="body2"
												color="textSecondary"
											>
												{address}
											</Typography>
										) : null}
									</div>
								</div>
								<Button
									type="button"
									size="small"
									startIcon={<EditIcon />}
									onClick={() =>
										this.setState({ searchMode: true, query: "", results: [], status: "" })
									}
								>
									{this.translate("changeSchool")}
								</Button>
							</Paper>
						) : null}
						{showSearch ? (
							<>
								<TextField
									fullWidth
									margin="normal"
									label={this.translate("schoolSearch")}
									placeholder={this.translate("schoolSearchPlaceholder")}
									value={this.state.query}
									onChange={event => this.setState({ query: event.target.value })}
									onKeyDown={event => {
										if (event.key === "Enter") {
											event.preventDefault();
											if (!this.state.searching && this.state.query.trim().length >= 2) {
												void this.search();
											}
										}
									}}
									InputProps={{
										startAdornment: (
											<InputAdornment position="start">
												<SearchIcon fontSize="small" />
											</InputAdornment>
										),
									}}
								/>
								<Button
									type="button"
									variant="contained"
									color="primary"
									startIcon={
										this.state.searching ? (
											<CircularProgress
												size={18}
												color="inherit"
											/>
										) : (
											<SearchIcon />
										)
									}
									disabled={this.state.searching || this.state.query.trim().length < 2}
									onClick={() => void this.search()}
								>
									{this.state.searching
										? this.translate("searching")
										: this.translate("searchSchool")}
								</Button>
								{this.state.results.length ? (
									<List
										className={this.props.classes.results}
										aria-label={this.translate("searchResults")}
									>
										{this.state.results.map(school => (
											<ListItem
												button
												className={this.props.classes.result}
												key={`${school.schoolId}-${school.server}`}
												onClick={() => this.selectSchool(school)}
											>
												<ListItemText
													primary={school.displayName}
													secondary={school.address || this.translate("unknownAddress")}
													primaryTypographyProps={{ color: "textPrimary" }}
													secondaryTypographyProps={{ color: "textSecondary" }}
												/>
											</ListItem>
										))}
									</List>
								) : null}
							</>
						) : null}
					</CardContent>
				</Card>

				<Card className={this.props.classes.card}>
					<CardHeader title={this.translate("accountCardTitle")} />
					<CardContent className={this.props.classes.cardContent}>
						<Typography
							variant="body2"
							className={this.props.classes.help}
						>
							{this.translate("accountCardHelp")}
						</Typography>
						{this.renderField("username", "username")}
						{this.renderField("password", "password", "password")}
						<div className={this.props.classes.actions}>
							<Button
								type="button"
								variant="outlined"
								color="primary"
								startIcon={
									this.state.testing ? (
										<CircularProgress
											size={18}
											color="inherit"
										/>
									) : (
										<CheckCircleIcon />
									)
								}
								disabled={this.state.testing}
								onClick={() => void this.testConnection()}
							>
								{this.state.testing
									? this.translate("testingConnection")
									: this.translate("testConnection")}
							</Button>
							{this.renderStatus()}
						</div>
					</CardContent>
				</Card>
			</form>
		);
	}
}

export default withStyles(styles)(Settings);
