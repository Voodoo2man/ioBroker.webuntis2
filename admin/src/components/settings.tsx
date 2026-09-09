import React from "react";
import Button from "@material-ui/core/Button";
import CircularProgress from "@material-ui/core/CircularProgress";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import { withStyles } from "@material-ui/core/styles";
import I18n from "@iobroker/adapter-react/i18n";
import { rankSchoolResults } from "../../../src/lib/webuntis/SchoolDiscovery";
import type { SchoolSearchResult } from "../../../src/lib/webuntis/WebUntisTypes";

type SchoolResult = SchoolSearchResult;

const ThemeButton = withStyles(theme => ({
	root: {
		color: theme.palette.text.primary,
	},
}))(Button);

interface SettingsProps {
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
}

class Settings extends React.Component<SettingsProps, SettingsState> {
	public state: SettingsState = { query: "", results: [], searching: false, testing: false, status: "" };
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
		this.setState({ results: [], status: "SCHOOL_SELECTED" });
	}

	private renderField(label: string, key: string, type = "text"): React.JSX.Element {
		return (
			<TextField
				fullWidth
				margin="normal"
				label={this.translate(label)}
				type={type}
				value={this.props.native[key] ?? ""}
				onChange={event => this.props.onChange(key, event.target.value)}
			/>
		);
	}

	public render(): React.JSX.Element {
		const selected =
			typeof this.props.native.schoolDisplayName === "string" ? this.props.native.schoolDisplayName : "";
		const address = typeof this.props.native.schoolAddress === "string" ? this.props.native.schoolAddress : "";
		return (
			<form>
				<Typography
					variant="h6"
					color="textPrimary"
				>
					{this.translate("school")}
				</Typography>
				<TextField
					fullWidth
					margin="normal"
					label={this.translate("schoolSearch")}
					value={this.state.query}
					onChange={event => this.setState({ query: event.target.value })}
				/>
				<ThemeButton
					type="button"
					variant="contained"
					color="primary"
					disabled={this.state.searching || this.state.query.trim().length < 2}
					onClick={() => void this.search()}
				>
					{this.state.searching ? <CircularProgress size={20} /> : this.translate("searchSchool")}
				</ThemeButton>
				{selected ? (
					<Typography
						variant="body1"
						color="textPrimary"
					>
						{this.translate("selectedSchool")}: {selected}
						{address ? `, ${address}` : ""}{" "}
						<ThemeButton
							type="button"
							size="small"
							onClick={() => this.setState({ query: "", status: "" })}
						>
							{this.translate("changeSchool")}
						</ThemeButton>
					</Typography>
				) : null}
				<List>
					{this.state.results.map(school => (
						<ListItem
							button
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
				{this.renderField("username", "username")}
				{this.renderField("password", "password", "password")}
				<ThemeButton
					type="button"
					variant="outlined"
					disabled={this.state.testing}
					onClick={() => void this.testConnection()}
				>
					{this.state.testing ? <CircularProgress size={20} /> : this.translate("testConnection")}
				</ThemeButton>
				{this.state.status ? (
					<Typography
						variant="body2"
						color="textPrimary"
					>
						{this.translate(this.state.status)}
					</Typography>
				) : null}
			</form>
		);
	}
}

export default Settings;
