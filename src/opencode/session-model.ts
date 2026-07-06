import type { ModelRef } from "../config.js";
import type { PluginInput } from "@opencode-ai/plugin";

type OpenCodeClient = PluginInput["client"];
type SessionMessagesResult = Awaited<ReturnType<OpenCodeClient["session"]["messages"]>>;
type SessionMessageEntry = NonNullable<SessionMessagesResult["data"]>[number];
type SessionMessageInfo = SessionMessageEntry["info"];

interface SessionModelFields {
	readonly providerID?: string;
	readonly modelID?: string;
	readonly model?: {
		readonly providerID?: string;
		readonly modelID?: string;
		readonly id?: string;
	};
}

function modelRefFromFields(fields: SessionModelFields | undefined): ModelRef | undefined {
	if (!fields) {
		return undefined;
	}

	if (fields.model?.providerID && fields.model.modelID) {
		return {
			provider: fields.model.providerID,
			id: fields.model.modelID,
		};
	}

	if (fields.model?.providerID && fields.model.id) {
		return {
			provider: fields.model.providerID,
			id: fields.model.id,
		};
	}

	if (fields.providerID && fields.modelID) {
		return {
			provider: fields.providerID,
			id: fields.modelID,
		};
	}

	return undefined;
}

function modelRefFromMessageInfo(info: SessionMessageInfo): ModelRef | undefined {
	if (info.role === "user") {
		return modelRefFromFields(info as SessionModelFields);
	}

	if (info.role === "assistant") {
		return modelRefFromFields(info as SessionModelFields);
	}

	return undefined;
}

export async function resolveOpenCodeSessionModelRef(
	client: OpenCodeClient,
	sessionID: string,
): Promise<ModelRef> {
	const session = await client.session.get({ path: { id: sessionID } });
	const sessionModel = modelRefFromFields(session.data as SessionModelFields | undefined);
	if (sessionModel) {
		return sessionModel;
	}

	const messages = await client.session.messages({ path: { id: sessionID } });
	for (const entry of [...(messages.data ?? [])].reverse()) {
		const modelRef = modelRefFromMessageInfo(entry.info);
		if (modelRef) {
			return modelRef;
		}
	}

	throw new Error("batch_queue objective mode requires a session model on the parent session");
}
