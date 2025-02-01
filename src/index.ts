#!/usr/bin/env node
import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ListToolsRequestSchema,
    CallToolRequestSchema,
    ErrorCode,
    McpError
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import {
    HangupCallResponse,
    StartCallResponse
} from "./types.js";

dotenv.config();

const API_KEY = process.env.VOYP_API_KEY;
if (!API_KEY) {
    throw new Error("VOYP_API_KEY environment variable is required");
}

const API_CONFIG = {
    BASE_URL: 'https://api.voyp.app/api/mcp/',
    ENDPOINTS: {
        USER: 'profile',
        CALL: 'call/',
        START: 'call/start',
        HANGUP: 'call/hangup',
        PLACES: 'places/search',
        PLACE: 'place/search',
        PLACE_NUMBER: 'place/'
    }
} as const;

const PROMPTS = {
    "start-call": {
        name: "start-call",
        description: "Start a new call",
        arguments: [
            {
                name: "number",
                description: "Number to call",
                required: true
            },
            {
                name: "context",
                description: "The full context of the call",
                required: true
            }
        ]
    },
    "hangup-call": {
        name: "hangup call",
        description: "Hangup an existing call",
        arguments: [
            {
                name: "id",
                description: "Id of the call",
                required: true
            }
        ]
    }
};

/**
 * Voyp MCP server
 * 
 * This server is used to start and hangup calls, search for places, and retrieve user profile.
 * 
 */
class VoypServer {
    private server: Server;
    private axiosInstance;

    constructor() {
        this.server = new Server({
            name: "voyp-mcp-server",
            version: "0.1.0"
        }, {
            capabilities: {
                tools: {},
                prompts: {}
            }
        });

        // Configure axios with defaults
        this.axiosInstance = axios.create({
            baseURL: API_CONFIG.BASE_URL,
            headers: {
                'Authorization': "Bearer " + API_KEY
            }
        });

        this.setupHandlers();
        this.setupErrorHandling();
        this.setupPrompts();
    }

    private setupPrompts() {
        // List available prompts
        this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
            return {
                prompts: Object.values(PROMPTS)
            };
        });

        // Get specific prompt
        this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
            // @ts-ignore
            const prompt = PROMPTS[request.params.name];
            if (!prompt) {
                throw new Error(`Prompt not found: ${request.params.name}`);
            }

            if (request.params.name === "start-call") {
                const number = request.params.arguments?.number || "Unknown";
                const context = request.params.arguments?.context || "Unknown";
                return {
                    messages: [
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: `help me make a phone call`
                            }
                        },
                        {
                            role: "assistant",
                            content: {
                                type: "text",
                                text: `sure, what number would you like to call?`
                            }
                        },
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: `call this number ${number}`
                            }
                        },
                        {
                            role: "assistant",
                            content: {
                                type: "text",
                                text: `what is the context of the call?`
                            }
                        },
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: `here is what I'd like you to do: ${context}`
                            }
                        }
                    ]
                };
            }

            if (request.params.name === "hangup-call") {
                const id = request.params.arguments?.id || "Unknown";
                return {
                    messages: [
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: `Hangup call with id: ${id}`
                            }
                        }
                    ]
                };
            }

            throw new Error("Prompt implementation not found");
        });
    }

    private setupErrorHandling(): void {
        this.server.onerror = (error) => {
            console.error("[MCP Error]", error);
        };

        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }

    private setupHandlers(): void {
        this.setupResourceHandlers();
        this.setupToolHandlers();
    }

    private setupResourceHandlers(): void {
    }

    private setupToolHandlers(): void {
        this.server.setRequestHandler(
            ListToolsRequestSchema,
            async () => ({
                tools: [{
                    name: "start_call",
                    description: "Start a new phone call via Voyp API. The API returns the call id and a URL where users can track the progress of the call",
                    inputSchema: {
                        type: "object",
                        properties: {
                            number: {
                                type: "string",
                                description: "Phone number to call in E.164 format"
                            },
                            language: {
                                type: "string",
                                description: "Language of the call. Ex: en-US, pt-PT, fr-FR"
                            },
                            context: {
                                type: "string",
                                description: "Context of the call. Ex: Order a pizza"
                            }
                        },
                        required: ["number", "context"]
                    }
                },
                {
                    name: "hangup_call",
                    description: "Hangup an existing call",
                    inputSchema: {
                        type: "object",
                        properties: {
                            id: {
                                type: "string",
                                description: "ID of the call"
                            }
                        },
                        required: ["id"]
                    }
                },
                {
                    name: "search_places",
                    description: "Search places in a given location",
                    inputSchema: {
                        type: "object",
                        properties: {
                            search: {
                                type: "string",
                                description: "Places to search. Ex: italian restaurants in New York City, US"
                            }
                        },
                        required: ["search"]
                    }
                },
                {
                    name: "search_place",
                    description: "Search place details in a given location",
                    inputSchema: {
                        type: "object",
                        properties: {
                            place: {
                                type: "string",
                                description: "Name of place to search. Ex: The Lane Salon"
                            },
                            location: {
                                type: "string",
                                description: "Place location. Ex: San Francisco, CA"
                            }
                        },
                        required: ["place", "location"]
                    }
                },
                {
                    name: "search_place_by_number",
                    description: "Find place name and address by phone number",
                    inputSchema: {
                        type: "object",
                        properties: {
                            number: {
                                type: "string",
                                description: "Phone number in E.164 format. Ex: +1234567890"
                            }
                        },
                        required: ["number"]
                    }
                },
                {
                    name: "get_call",
                    description: "Retrieve call details",
                    inputSchema: {
                        type: "object",
                        properties: {
                            id: {
                                type: "string",
                                description: "Call Id"
                            }
                        },
                        required: ["id"]
                    }
                },
                {
                    name: "get_user",
                    description: "Retrieve user profile",
                    inputSchema: {
                        type: "object",
                        properties: {
                        },
                        required: []
                    }
                }]
            })
        );

        this.server.setRequestHandler(
            CallToolRequestSchema,
            async (request) => {
                if (request.params.name === "hangup_call") {
                    if (typeof (request.params.arguments?.id) !== 'string') {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            "Invalid hangup arguments"
                        );
                    }

                    const id : string = request.params.arguments?.id as string;

                    try {
                        const response = await this.axiosInstance.post<HangupCallResponse>(API_CONFIG.ENDPOINTS.HANGUP, { id: id});
                        return {
                            content: [{
                                type: "text",
                                text: JSON.stringify(response.data)
                            }]
                        };
                    } catch (error) {
                        if (axios.isAxiosError(error)) {
                            return {
                                content: [{
                                    type: "text",
                                    text: `Voyp API error: ${error.response?.data.message ?? error.message}`
                                }],
                                isError: true,
                            }
                        }
                        throw error;
                    }
                } else if (request.params.name === "start_call") {

                    // if (!isValidForecastArgs(request.params.arguments)) {
                    //     throw new McpError(
                    //         ErrorCode.InvalidParams,
                    //         "Invalid forecast arguments"
                    //     );
                    // }

                    const number = request.params.arguments?.number;
                    const context = request.params.arguments?.context;
                    const language = request.params.arguments?.language;

                    try {
                        const response = await this.axiosInstance.post<StartCallResponse>(API_CONFIG.ENDPOINTS.START, {
                            number,
                            context,
                            language
                        });

                        return {
                            content: [{
                                type: "text",
                                text: JSON.stringify(response.data)
                            }]
                        };
                    } catch (error) {
                        if (axios.isAxiosError(error)) {
                            return {
                                content: [{
                                    type: "text",
                                    text: `Voyp API error: ${error.response?.data.message ?? error.message}`
                                }],
                                isError: true,
                            }
                        }
                        throw error;
                    }
                } else if (request.params.name === "search_places") {

                    // if (!isValidForecastArgs(request.params.arguments)) {
                    //     throw new McpError(
                    //         ErrorCode.InvalidParams,
                    //         "Invalid forecast arguments"
                    //     );
                    // }

                    const search = request.params.arguments?.search;

                    try {
                        const response = await this.axiosInstance.post<StartCallResponse>(API_CONFIG.ENDPOINTS.PLACES, {
                            search
                        });

                        return {
                            content: [{
                                type: "text",
                                text: JSON.stringify(response.data)
                            }]
                        };
                    } catch (error) {
                        if (axios.isAxiosError(error)) {
                            return {
                                content: [{
                                    type: "text",
                                    text: `Voyp API error: ${error.response?.data.message ?? error.message}`
                                }],
                                isError: true,
                            }
                        }
                        throw error;
                    }
                } else if (request.params.name === "search_place") {

                    // if (!isValidForecastArgs(request.params.arguments)) {
                    //     throw new McpError(
                    //         ErrorCode.InvalidParams,
                    //         "Invalid forecast arguments"
                    //     );
                    // }

                    const place = request.params.arguments?.place;
                    const location = request.params.arguments?.location;

                    try {
                        const response = await this.axiosInstance.post<StartCallResponse>(API_CONFIG.ENDPOINTS.PLACE, {
                            place,
                            location
                        });

                        return {
                            content: [{
                                type: "text",
                                text: JSON.stringify(response.data)
                            }]
                        };
                    } catch (error) {
                        if (axios.isAxiosError(error)) {
                            return {
                                content: [{
                                    type: "text",
                                    text: `Voyp API error: ${error.response?.data.message ?? error.message}`
                                }],
                                isError: true,
                            }
                        }
                        throw error;
                    }
                } else if (request.params.name === "search_place_by_number") {

                    const number = request.params.arguments?.number;

                    try {
                        const response = await this.axiosInstance.get<StartCallResponse>(API_CONFIG.ENDPOINTS.PLACE_NUMBER + number);

                        return {
                            content: [{
                                type: "text",
                                text: JSON.stringify(response.data)
                            }]
                        };
                    } catch (error) {
                        if (axios.isAxiosError(error)) {
                            return {
                                content: [{
                                    type: "text",
                                    text: `Voyp API error: ${error.response?.data.message ?? error.message}`
                                }],
                                isError: true,
                            }
                        }
                        throw error;
                    }
                } else if (request.params.name === "get_user") {

                    try {
                        const response = await this.axiosInstance.get<StartCallResponse>(API_CONFIG.ENDPOINTS.USER);

                        return {
                            content: [{
                                type: "text",
                                text: JSON.stringify(response.data)
                            }]
                        };
                    } catch (error) {
                        if (axios.isAxiosError(error)) {
                            return {
                                content: [{
                                    type: "text",
                                    text: `Voyp API error: ${error.response?.data.message ?? error.message}`
                                }],
                                isError: true,
                            }
                        }
                        throw error;
                    }
                } else if (request.params.name === "get_call") {
                    const id = request.params.arguments?.id;

                    try {
                        const response = await this.axiosInstance.get<StartCallResponse>(API_CONFIG.ENDPOINTS.CALL + id);

                        return {
                            content: [{
                                type: "text",
                                text: JSON.stringify(response.data)
                            }]
                        };
                    } catch (error) {
                        if (axios.isAxiosError(error)) {
                            return {
                                content: [{
                                    type: "text",
                                    text: `Voyp API error: ${error.response?.data.message ?? error.message}`
                                }],
                                isError: true,
                            }
                        }
                        throw error;
                    }
                } else {
                    throw new McpError(
                        ErrorCode.MethodNotFound,
                        `Unknown tool: ${request.params.name}`
                    );
                }
            }
        );
    }

    async run(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);

        // Although this is just an informative message, we must log to stderr,
        // to avoid interfering with MCP communication that happens on stdout
        console.error("Voyp MCP server running on stdio");
    }
}

const server = new VoypServer();
server.run().catch(console.error);
