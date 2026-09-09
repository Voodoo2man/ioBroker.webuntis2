/* eslint-disable @typescript-eslint/no-require-imports */
import React from "react";
import { type Theme, type StyleRules, withStyles } from "@material-ui/core/styles";

import GenericApp from "@iobroker/adapter-react/GenericApp";
import Settings from "./components/settings";
import type { GenericAppProps, GenericAppSettings } from "@iobroker/adapter-react/types";
import { mergeSchoolSelection } from "../../src/lib/webuntis/SchoolDiscovery";
import type { SchoolSearchResult } from "../../src/lib/webuntis/WebUntisTypes";

const styles = (_theme: Theme): StyleRules => ({
	root: {},
});

class App extends GenericApp {
	constructor(props: GenericAppProps) {
		const extendedProps: GenericAppSettings = {
			...props,
			translations: {
				en: require("./i18n/en.json"),
				de: require("./i18n/de.json"),
				ru: require("./i18n/ru.json"),
				pt: require("./i18n/pt.json"),
				nl: require("./i18n/nl.json"),
				fr: require("./i18n/fr.json"),
				it: require("./i18n/it.json"),
				es: require("./i18n/es.json"),
				pl: require("./i18n/pl.json"),
				"zh-cn": require("./i18n/zh-cn.json"),
			},
		};
		super(extendedProps, undefined);
	}

	private selectSchool(school: SchoolSearchResult): void {
		const native = mergeSchoolSelection(this.state.native, school) as unknown as ioBroker.AdapterConfig;
		this.setState({ native, changed: this.getIsChanged(native) });
	}

	onConnectionReady(): void {
		// executed when connection is ready
	}

	render(): React.JSX.Element {
		if (!this.state.loaded) {
			return super.render();
		}

		return (
			<div className="App">
				<Settings
					native={this.state.native}
					socket={this.socket}
					instance={this.instanceId}
					onSchoolSelected={school => this.selectSchool(school)}
					onChange={(attr, value) => this.updateNativeValue(attr, value)}
				/>
				{this.renderError()}
				{this.renderToast()}
				{this.renderSaveCloseButtons()}
			</div>
		);
	}
}

export default withStyles(styles)(App);
