import dotenv from "dotenv";
import PropertiesReader from "properties-reader";
import path from "path";
import fs from "fs";

const PROPERTIES_CONFIG = "bot.properties";
const CONFIG_KEYS = [
	// Bot config
	"TOKEN",
	"CLIENT_ID",
	"GUILD_ID",
	"SERVER_STATUS_WEBHOOK_URL",
	"SERVER_STATUS_CHANNEL_ID",
	"CHAT_MESSAGES_WEBHOOK_URL",
	"CHAT_MESSAGES_CHANNEL_ID",
	"DEATH_MESSAGES_WEBHOOK_URL",
	"DEATH_MESSAGES_CHANNEL_ID",
	"ACHIEVEMENT_MESSAGES_WEBHOOK_URL",
	"ACHIEVEMENT_MESSAGES_CHANNEL_ID",
	"JOIN_MESSAGES_WEBHOOK_URL",
	"JOIN_MESSAGES_CHANNEL_ID",
	"LEAVE_MESSAGES_WEBHOOK_URL",
	"LEAVE_MESSAGES_CHANNEL_ID",

	// Server config
	"SERVER_PATH",
	"SERVER_JAR_FILE",
	"SERVER_MEMORY",
	"EMPTY_SERVER_SHUTDOWN_MINUTES",
];

dotenv.config();

function toKebabCase(key: string) {
	return `${key.toLowerCase().replace(/_/g, "-")}`;
}

// Create bot.properties with all keys if it doesn't exist
const propertiesPath = path.resolve(process.cwd(), PROPERTIES_CONFIG);
if (!fs.existsSync(propertiesPath)) {
	const defaultContent = CONFIG_KEYS.map((key) => toKebabCase(key) + "=").join("\n");

	fs.writeFileSync(propertiesPath, defaultContent, {
		encoding: "utf-8",
	});
	console.log("bot.properties did not exist. Created default bot.properties file for bot config.");
}

const properties = PropertiesReader(propertiesPath);

// Helper function to get from .env or .properties
function getConfigValue(key: string): string | undefined {
	const propertiesKey = toKebabCase(key);

	// Check .env first
	if (process.env[propertiesKey] !== undefined) return process.env[propertiesKey];

	// Try .properties using lower-case dash format (e.g., SERVER_PATH -> server-path)
	const value = properties.get(propertiesKey);

	return typeof value === "string" ? value : undefined;
}

// Generate the Config object dynamically
export const Config = Object.fromEntries(CONFIG_KEYS.map((key) => [key, getConfigValue(key)])) as Record<
	(typeof CONFIG_KEYS)[number],
	string | undefined
>;
