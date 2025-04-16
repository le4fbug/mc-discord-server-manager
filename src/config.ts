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
	"SERVER_MAX_MEMORY",
	"SERVER_MIN_MEMORY",
	"EMPTY_SERVER_SHUTDOWN_MINUTES",
	"ADMIN_ROLE_IDS",
	"ADMIN_USER_IDS",
];

interface ConfigType {
	TOKEN?: string;
	CLIENT_ID?: string;
	GUILD_ID?: string;
	SERVER_STATUS_WEBHOOK_URL?: string;
	SERVER_STATUS_CHANNEL_ID?: string;
	CHAT_MESSAGES_WEBHOOK_URL?: string;
	CHAT_MESSAGES_CHANNEL_ID?: string;
	DEATH_MESSAGES_WEBHOOK_URL?: string;
	DEATH_MESSAGES_CHANNEL_ID?: string;
	ACHIEVEMENT_MESSAGES_WEBHOOK_URL?: string;
	ACHIEVEMENT_MESSAGES_CHANNEL_ID?: string;
	JOIN_MESSAGES_WEBHOOK_URL?: string;
	JOIN_MESSAGES_CHANNEL_ID?: string;
	LEAVE_MESSAGES_WEBHOOK_URL?: string;
	LEAVE_MESSAGES_CHANNEL_ID?: string;
	SERVER_PATH?: string;
	SERVER_JAR_FILE?: string;
	SERVER_MAX_MEMORY?: string;
	SERVER_MIN_MEMORY?: string;
	EMPTY_SERVER_SHUTDOWN_MINUTES?: string;

	// Added permission-related keys with specific array types
	ADMIN_ROLE_IDS: string[];
	ADMIN_USER_IDS: string[];
}

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
	if (process.env[propertiesKey] !== "" && process.env[propertiesKey] !== undefined) return process.env[propertiesKey];
	// Try .properties using lower-case dash format (e.g., SERVER_PATH -> server-path)
	const value = properties.get(propertiesKey);

	return value ? String(value) : undefined;
}

const parsedConfig = CONFIG_KEYS.reduce((acc, key) => {
	const value = getConfigValue(key);
	acc[key] = value;
	return acc;
}, {} as Record<string, string | undefined>);

// Handle the parsing for ALLOWED_ROLE_IDS and ALLOWED_USER_IDS
const Config: ConfigType = {
	...parsedConfig,
	ADMIN_ROLE_IDS: parsedConfig.ADMIN_ROLE_IDS
		? parsedConfig.ADMIN_ROLE_IDS.split(",").map((id) => id.trim())
		: [],
	ADMIN_USER_IDS: parsedConfig.ADMIN_USER_IDS
		? parsedConfig.ADMIN_USER_IDS.split(",").map((id) => id.trim())
		: [],
};

export default Config;