---
title: "Build a Firecrawl agent with LangChain (TypeScript) and Arcade"
slug: "ts-langchain-Firecrawl"
framework: "langchain-ts"
language: "typescript"
toolkits: ["Firecrawl"]
tools: []
difficulty: "beginner"
generated_at: "2026-03-12T01:35:07Z"
source_template: "ts_langchain"
agent_repo: ""
tags:
  - "langchain"
  - "typescript"
  - "firecrawl"
---

# Build a Firecrawl agent with LangChain (TypeScript) and Arcade

In this tutorial you'll build an AI agent using [LangChain](https://js.langchain.com/) with [LangGraph](https://langchain-ai.github.io/langgraphjs/) in TypeScript and [Arcade](https://arcade.dev) that can interact with Firecrawl tools — with built-in authorization and human-in-the-loop support.

## Prerequisites

- The [Bun](https://bun.com) runtime
- An [Arcade](https://arcade.dev) account and API key
- An OpenAI API key

## Project Setup

First, create a directory for this project, and install all the required dependencies:

````bash
mkdir firecrawl-agent && cd firecrawl-agent
bun install @arcadeai/arcadejs @langchain/langgraph @langchain/core langchain chalk
````

## Start the agent script

Create a `main.ts` script, and import all the packages and libraries. Imports from 
the `"./tools"` package may give errors in your IDE now, but don't worry about those
for now, you will write that helper package later.

````typescript
"use strict";
import { getTools, confirm, arcade } from "./tools";
import { createAgent } from "langchain";
import {
  Command,
  MemorySaver,
  type Interrupt,
} from "@langchain/langgraph";
import chalk from "chalk";
import * as readline from "node:readline/promises";
````

## Configuration

In `main.ts`, configure your agent's toolkits, system prompt, and model. Notice
how the system prompt tells the agent how to navigate different scenarios and
how to combine tool usage in specific ways. This prompt engineering is important
to build effective agents. In fact, the more agentic your application, the more
relevant the system prompt to truly make the agent useful and effective at
using the tools at its disposal.

````typescript
// configure your own values to customize your agent

// The Arcade User ID identifies who is authorizing each service.
const arcadeUserID = process.env.ARCADE_USER_ID;
if (!arcadeUserID) {
  throw new Error("Missing ARCADE_USER_ID. Add it to your .env file.");
}
// This determines which MCP server is providing the tools, you can customize this to make a Slack agent, or Notion agent, etc.
// all tools from each of these MCP servers will be retrieved from arcade
const toolkits=['Firecrawl'];
// This determines isolated tools that will be
const isolatedTools=[];
// This determines the maximum number of tool definitions Arcade will return
const toolLimit = 100;
// This prompt defines the behavior of the agent.
const systemPrompt = "# Firecrawl ReAct Agent \u2014 Prompt\n\n## Introduction\nYou are a ReAct-style AI agent that uses the Firecrawl toolset to discover, map, crawl, and scrape websites. Your purpose is to retrieve structured website maps and page content reliably, handle long-running/asynchronous crawls, and report results to the user in clear, actionable form.\n\nUse the Firecrawl tools (MapWebsite, CrawlWebsite, ScrapeUrl, GetCrawlStatus, GetCrawlData, CancelCrawl) to perform web discovery and extraction. Follow the ReAct pattern: alternate explicit internal reasoning (\"Thought:\"), actions (tool calls), and observations (tool outputs), then produce final answers for the user.\n\n---\n\n## Instructions (how you should behave)\n- Use the ReAct format for all problem-solving. For each step:\n  - Thought: short internal reasoning (one or two sentences).\n  - Action: the tool call with exact tool name and JSON-style parameters.\n  - Observation: the tool response.\n  - Decide next Thought/Action until the task is complete.\n- When calling a tool:\n  - Include the exact tool name and only the parameters needed.\n  - Prefer concise, precise parameters (URL, limits, depth, async flag, include/exclude paths etc.).\n  - For ScrapeUrl, prefer `formats` and `only_main_content` for readable output; use `wait_for` for JS-heavy pages.\n- For asynchronous crawls:\n  - If Firecrawl_CrawlWebsite returns a crawl_id, persist it in context, immediately inform the user with the ID and status.\n  - Poll status with Firecrawl_GetCrawlStatus and fetch results with Firecrawl_GetCrawlData when status is complete.\n  - Use exponential backoff (e.g., 2s, 4s, 8s) and a sensible max poll count (e.g., 8\u201312). If polling times out, offer to keep monitoring or cancel.\n  - If user requests cancellation, call Firecrawl_CancelCrawl with the crawl_id.\n- Error handling:\n  - If tools return errors (timeouts, 4xx/5xx, or crawl-not-found), report the error and suggest next steps (retry, adjust limits, login required, respect robots.txt).\n  - If scraping is blocked by robots or authentication, inform the user and ask for credentials or permission to proceed.\n- Privacy \u0026 Safety:\n  - Do not attempt to bypass robots.txt, paywalls, or authentication. If user-provided credentials/legal permission required, request them explicitly.\n  - Do not leak internal API keys or tool internals; show only user-relevant outputs.\n- User communication:\n  - Summarize results clearly. If you performed multiple steps, provide a short summary of actions and final findings.\n  - When returning large crawl data, provide counts (pages crawled), top issues, and an index of important pages rather than dumping everything.\n\n---\n\n## Workflows\nBelow are canonical workflows the agent will use. Each workflow lists the sequence of tools and recommended parameters and behavior.\n\n1) Fetch single page content (quick, focused)\n- Use when user asks for the content or summary of a single URL.\n- Sequence:\n  1. Action: Firecrawl_ScrapeUrl\n     - Minimum params: { \"url\": \"\u003cURL\u003e\" }\n     - Recommended extras: { \"formats\": [\"markdown\"], \"only_main_content\": true, \"wait_for\": 500\u20132000, \"timeout\": 10000 }\n  2. Observation: receive scraped content.\n  3. Provide a concise summary + the scraped content (or link) to the user.\n\nExample:\n```\nAction: Firecrawl_ScrapeUrl\n{\n  \"url\": \"https://example.com/article\",\n  \"formats\": [\"markdown\"],\n  \"only_main_content\": true,\n  \"wait_for\": 1000,\n  \"timeout\": 10000\n}\n```\n\n2) Map a website (site structure / link map)\n- Use when user wants an index/map of site pages or an overview of site structure/search results.\n- Sequence:\n  1. Action: Firecrawl_MapWebsite\n     - Params: { \"url\": \"\u003cbase_url\u003e\" }\n     - Optional: \"search\" to focus, \"include_subdomains\": true/false, \"ignore_sitemap\": true/false, \"limit\": N\n  2. Observation: receive list/map of links and metadata.\n  3. Optionally, for pages of interest, call Firecrawl_ScrapeUrl on specific URLs to extract content summaries.\n  4. Present a hierarchical site map, counts, and highlighted pages.\n\nExample:\n```\nAction: Firecrawl_MapWebsite\n{\n  \"url\": \"https://example.com\",\n  \"include_subdomains\": false,\n  \"limit\": 200\n}\n```\n\n3) Synchronous full crawl (bounded)\n- Use when user wants a crawl of multiple pages and expects results in one response, and site is small enough.\n- Sequence:\n  1. Action: Firecrawl_CrawlWebsite\n     - Params: { \"url\": \"\u003cbase_url\u003e\", \"max_depth\": 2, \"limit\": 200, \"ignore_sitemap\": false, \"allow_external_links\": false, \"async_crawl\": false }\n  2. Observation: receive crawl data (synchronous).\n  3. Process and summarize crawl results; optionally scrape specific pages for more detail.\n\nExample:\n```\nAction: Firecrawl_CrawlWebsite\n{\n  \"url\": \"https://example.com\",\n  \"max_depth\": 2,\n  \"limit\": 100,\n  \"allow_external_links\": false,\n  \"async_crawl\": false\n}\n```\n\n4) Asynchronous/full-site crawl (long-running)\n- Use when crawling large sites or when the crawl will take long.\n- Sequence:\n  1. Action: Firecrawl_CrawlWebsite\n     - Params: { \"url\": \"\u003cbase_url\u003e\", \"async_crawl\": true, \"limit\": \u003cN|null\u003e, \"max_depth\": \u003cd\u003e, \"allow_external_links\": true/false, \"ignore_sitemap\": \u003cbool\u003e }\n  2. Observation: returns { \"crawl_id\": \"\u003cid\u003e\" }\n  3. Inform user: provide crawl_id, expected polling plan, and ask if they want ongoing updates.\n  4. Poll: Firecrawl_GetCrawlStatus(crawl_id) on schedule (exponential backoff). If status == \"completed\" or equivalent:\n     - Action: Firecrawl_GetCrawlData(crawl_id)\n     - Observation: retrieve crawl data and present summary.\n  5. If user requests cancel: Firecrawl_CancelCrawl(crawl_id).\n- Polling guidance: start at 2s, backoff x2, cap interval at ~30s; attempt 8\u201312 polls then report timeout.\n\nExample:\n```\nAction: Firecrawl_CrawlWebsite\n{\n  \"url\": \"https://example.com\",\n  \"async_crawl\": true,\n  \"max_depth\": 5,\n  \"limit\": 500\n}\n```\n\n5) Retrieve or inspect an existing crawl\n- Use when the user provides a crawl_id or wants status/results of a recent crawl.\n- Sequence:\n  1. Action: Firecrawl_GetCrawlStatus { \"crawl_id\": \"\u003ccrawl_id\u003e\" }\n  2. Observation: status response.\n  3. If status indicates completion, Action: Firecrawl_GetCrawlData { \"crawl_id\": \"\u003ccrawl_id\u003e\" }.\n  4. Present results or next steps.\n\nExample:\n```\nAction: Firecrawl_GetCrawlStatus\n{\n  \"crawl_id\": \"abc123\"\n}\n```\n\n6) Cancel an ongoing crawl\n- Use when user asks to stop a running crawl.\n- Sequence:\n  1. Action: Firecrawl_CancelCrawl { \"crawl_id\": \"\u003ccrawl_id\u003e\" }\n  2. Observation: confirm cancellation.\n  3. Inform user and provide any partial data available via GetCrawlData if possible.\n\nExample:\n```\nAction: Firecrawl_CancelCrawl\n{\n  \"crawl_id\": \"abc123\"\n}\n```\n\n---\n\n## ReAct Example Interaction Template\nFollow this format for each step and for final output to user:\n\n```\nThought: I should scrape the article to extract the main content and summarize.\nAction: Firecrawl_ScrapeUrl\n{\n  \"url\": \"https://example.com/article\",\n  \"formats\": [\"markdown\"],\n  \"only_main_content\": true,\n  \"wait_for\": 1000,\n  \"timeout\": 10000\n}\nObservation: { ...tool response with scraped markdown... }\nThought: The article contains three major sections; summarizing them next.\nAction: (No tool) \u2014 produce summary for user.\nFinal: Summary + link to scraped content and next recommendations.\n```\n\nFor an async crawl:\n\n```\nThought: The user requested a site index for a large site, use an async crawl.\nAction: Firecrawl_CrawlWebsite\n{\n  \"url\": \"https://bigsite.com\",\n  \"async_crawl\": true,\n  \"limit\": 1000,\n  \"max_depth\": 6\n}\nObservation: { \"crawl_id\": \"crawl_987xyz\", \"status\": \"started\" }\nThought: Save crawl_id and inform user; poll status with exponential backoff.\nFinal: \"Crawl started. crawl_id: crawl_987xyz. I will poll status and report back, or you can ask to cancel it.\"\n```\n\n---\n\n## Tool-use best practices \u0026 tips\n- Prefer Firecrawl_ScrapeUrl for single-page extraction and human-readable formats (markdown). Use `only_main_content` to avoid nav/ads clutter.\n- Use Firecrawl_MapWebsite to quickly get a sitemap-like list without performing a full deep crawl.\n- Use Firecrawl_CrawlWebsite for multi-page crawls; set `async_crawl` true for large jobs.\n- Use include_paths/exclude_paths to focus or avoid sections (patterns).\n- Use allow_external_links and allow_backward_links only when you need links outside the host or non-child navigation.\n- For JS-heavy pages, set a conservative `wait_for` (milliseconds) and increase `timeout`.\n- Always check status before calling GetCrawlData; if status is not complete, either poll or ask the user whether to wait.\n- When returning results, summarize: pages visited, top-level site structure, notable pages, errors encountered (403/404/timeout), and next recommended steps.\n\n---\n\nIf you are ready, begin by asking the user for the URL(s) and their objectives (map, full crawl, specific pages to scrape, limits, depth, and whether async is acceptable). Then proceed with the appropriate workflow above using the ReAct format.";
// This determines which LLM will be used inside the agent
const agentModel = process.env.OPENAI_MODEL;
if (!agentModel) {
  throw new Error("Missing OPENAI_MODEL. Add it to your .env file.");
}
// This allows LangChain to retain the context of the session
const threadID = "1";
````

Set the following environment variables in a `.env` file:

````bash
ARCADE_API_KEY=your-arcade-api-key
ARCADE_USER_ID=your-arcade-user-id
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5-mini
````

## Implementing the `tools.ts` module

The `tools.ts` module fetches Arcade tool definitions and converts them to LangChain-compatible tools using Arcade's Zod schema conversion:

### Create the file and import the dependencies

Create a `tools.ts` file, and add import the following. These will allow you to build the helper functions needed to convert Arcade tool definitions into a format that LangChain can execute. Here, you also define which tools will require human-in-the-loop confirmation. This is very useful for tools that may have dangerous or undesired side-effects if the LLM hallucinates the values in the parameters. You will implement the helper functions to require human approval in this module.

````typescript
import { Arcade } from "@arcadeai/arcadejs";
import {
  type ToolExecuteFunctionFactoryInput,
  type ZodTool,
  executeZodTool,
  isAuthorizationRequiredError,
  toZod,
} from "@arcadeai/arcadejs/lib/index";
import { type ToolExecuteFunction } from "@arcadeai/arcadejs/lib/zod/types";
import { tool } from "langchain";
import {
  interrupt,
} from "@langchain/langgraph";
import readline from "node:readline/promises";

// This determines which tools require human in the loop approval to run
const TOOLS_WITH_APPROVAL = ['Firecrawl_CancelCrawl', 'Firecrawl_CrawlWebsite', 'Firecrawl_MapWebsite', 'Firecrawl_ScrapeUrl'];
````

### Create a confirmation helper for human in the loop

The first helper that you will write is the `confirm` function, which asks a yes or no question to the user, and returns `true` if theuser replied with `"yes"` and `false` otherwise.

````typescript
// Prompt user for yes/no confirmation
export async function confirm(question: string, rl?: readline.Interface): Promise<boolean> {
  let shouldClose = false;
  let interface_ = rl;

  if (!interface_) {
      interface_ = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
      });
      shouldClose = true;
  }

  const answer = await interface_.question(`${question} (y/n): `);

  if (shouldClose) {
      interface_.close();
  }

  return ["y", "yes"].includes(answer.trim().toLowerCase());
}
````

Tools that require authorization trigger a LangGraph interrupt, which pauses execution until the user completes authorization in their browser.

### Create the execution helper

This is a wrapper around the `executeZodTool` function. Before you execute the tool, however, there are two logical checks to be made:

1. First, if the tool the agent wants to invoke is included in the `TOOLS_WITH_APPROVAL` variable, human-in-the-loop is enforced by calling `interrupt` and passing the necessary data to call the `confirm` helper. LangChain will surface that `interrupt` to the agentic loop, and you will be required to "resolve" the interrupt later on. For now, you can assume that the reponse of the `interrupt` will have enough information to decide whether to execute the tool or not, depending on the human's reponse.
2. Second, if the tool was approved by the human, but it doesn't have the authorization of the integration to run, then you need to present an URL to the user so they can authorize the OAuth flow for this operation. For this, an execution is attempted, that may fail to run if the user is not authorized. When it fails, you interrupt the flow and send the authorization request for the harness to handle. If the user authorizes the tool, the harness will reply with an `{authorized: true}` object, and the system will retry the tool call without interrupting the flow.

````typescript
export function executeOrInterruptTool({
  zodToolSchema,
  toolDefinition,
  client,
  userId,
}: ToolExecuteFunctionFactoryInput): ToolExecuteFunction<any> {
  const { name: toolName } = zodToolSchema;

  return async (input: unknown) => {
    try {

      // If the tool is on the list that enforces human in the loop, we interrupt the flow and ask the user to authorize the tool

      if (TOOLS_WITH_APPROVAL.includes(toolName)) {
        const hitl_response = interrupt({
          authorization_required: false,
          hitl_required: true,
          tool_name: toolName,
          input: input,
        });

        if (!hitl_response.authorized) {
          // If the user didn't approve the tool call, we throw an error, which will be handled by LangChain
          throw new Error(
            `Human in the loop required for tool call ${toolName}, but user didn't approve.`
          );
        }
      }

      // Try to execute the tool
      const result = await executeZodTool({
        zodToolSchema,
        toolDefinition,
        client,
        userId,
      })(input);
      return result;
    } catch (error) {
      // If the tool requires authorization, we interrupt the flow and ask the user to authorize the tool
      if (error instanceof Error && isAuthorizationRequiredError(error)) {
        const response = await client.tools.authorize({
          tool_name: toolName,
          user_id: userId,
        });

        // We interrupt the flow here, and pass everything the handler needs to get the user's authorization
        const interrupt_response = interrupt({
          authorization_required: true,
          authorization_response: response,
          tool_name: toolName,
          url: response.url ?? "",
        });

        // If the user authorized the tool, we retry the tool call without interrupting the flow
        if (interrupt_response.authorized) {
          const result = await executeZodTool({
            zodToolSchema,
            toolDefinition,
            client,
            userId,
          })(input);
          return result;
        } else {
          // If the user didn't authorize the tool, we throw an error, which will be handled by LangChain
          throw new Error(
            `Authorization required for tool call ${toolName}, but user didn't authorize.`
          );
        }
      }
      throw error;
    }
  };
}
````

### Create the tool retrieval helper

The last helper function of this module is the `getTools` helper. This function will take the configurations you defined in the `main.ts` file, and retrieve all of the configured tool definitions from Arcade. Those definitions will then be converted to LangGraph `Function` tools, and will be returned in a format that LangChain can present to the LLM so it can use the tools and pass the arguments correctly. You will pass the `executeOrInterruptTool` helper you wrote in the previous section so all the bindings to the human-in-the-loop and auth handling are programmed when LancChain invokes a tool.


````typescript
// Initialize the Arcade client
export const arcade = new Arcade();

export type GetToolsProps = {
  arcade: Arcade;
  toolkits?: string[];
  tools?: string[];
  userId: string;
  limit?: number;
}


export async function getTools({
  arcade,
  toolkits = [],
  tools = [],
  userId,
  limit = 100,
}: GetToolsProps) {

  if (toolkits.length === 0 && tools.length === 0) {
      throw new Error("At least one tool or toolkit must be provided");
  }

  // Todo(Mateo): Add pagination support
  const from_toolkits = await Promise.all(toolkits.map(async (tkitName) => {
      const definitions = await arcade.tools.list({
          toolkit: tkitName,
          limit: limit
      });
      return definitions.items;
  }));

  const from_tools = await Promise.all(tools.map(async (toolName) => {
      return await arcade.tools.get(toolName);
  }));

  const all_tools = [...from_toolkits.flat(), ...from_tools];
  const unique_tools = Array.from(
      new Map(all_tools.map(tool => [tool.qualified_name, tool])).values()
  );

  const arcadeTools = toZod({
    tools: unique_tools,
    client: arcade,
    executeFactory: executeOrInterruptTool,
    userId: userId,
  });

  // Convert Arcade tools to LangGraph tools
  const langchainTools = arcadeTools.map(({ name, description, execute, parameters }) =>
    (tool as Function)(execute, {
      name,
      description,
      schema: parameters,
    })
  );

  return langchainTools;
}
````

## Building the Agent

Back on the `main.ts` file, you can now call the helper functions you wrote to build the agent.

### Retrieve the configured tools

Use the `getTools` helper you wrote to retrieve the tools from Arcade in LangChain format:

````typescript
const tools = await getTools({
  arcade,
  toolkits: toolkits,
  tools: isolatedTools,
  userId: arcadeUserID,
  limit: toolLimit,
});
````

### Write an interrupt handler

When LangChain is interrupted, it will emit an event in the stream that you will need to handle and resolve based on the user's behavior. For a human-in-the-loop interrupt, you will call the `confirm` helper you wrote earlier, and indicate to the harness whether the human approved the specific tool call or not. For an auth interrupt, you will present the OAuth URL to the user, and wait for them to finishe the OAuth dance before resolving the interrupt with `{authorized: true}` or `{authorized: false}` if an error occurred:

````typescript
async function handleInterrupt(
  interrupt: Interrupt,
  rl: readline.Interface
): Promise<{ authorized: boolean }> {
  const value = interrupt.value;
  const authorization_required = value.authorization_required;
  const hitl_required = value.hitl_required;
  if (authorization_required) {
    const tool_name = value.tool_name;
    const authorization_response = value.authorization_response;
    console.log("⚙️: Authorization required for tool call", tool_name);
    console.log(
      "⚙️: Please authorize in your browser",
      authorization_response.url
    );
    console.log("⚙️: Waiting for you to complete authorization...");
    try {
      await arcade.auth.waitForCompletion(authorization_response.id);
      console.log("⚙️: Authorization granted. Resuming execution...");
      return { authorized: true };
    } catch (error) {
      console.error("⚙️: Error waiting for authorization to complete:", error);
      return { authorized: false };
    }
  } else if (hitl_required) {
    console.log("⚙️: Human in the loop required for tool call", value.tool_name);
    console.log("⚙️: Please approve the tool call", value.input);
    const approved = await confirm("Do you approve this tool call?", rl);
    return { authorized: approved };
  }
  return { authorized: false };
}
````

### Create an Agent instance

Here you create the agent using the `createAgent` function. You pass the system prompt, the model, the tools, and the checkpointer. When the agent runs, it will automatically use the helper function you wrote earlier to handle tool calls and authorization requests.

````typescript
const agent = createAgent({
  systemPrompt: systemPrompt,
  model: agentModel,
  tools: tools,
  checkpointer: new MemorySaver(),
});
````

### Write the invoke helper

This last helper function handles the streaming of the agent’s response, and captures the interrupts. When the system detects an interrupt, it adds the interrupt to the `interrupts` array, and the flow interrupts. If there are no interrupts, it will just stream the agent’s to your console.

````typescript
async function streamAgent(
  agent: any,
  input: any,
  config: any
): Promise<Interrupt[]> {
  const stream = await agent.stream(input, {
    ...config,
    streamMode: "updates",
  });
  const interrupts: Interrupt[] = [];

  for await (const chunk of stream) {
    if (chunk.__interrupt__) {
      interrupts.push(...(chunk.__interrupt__ as Interrupt[]));
      continue;
    }
    for (const update of Object.values(chunk)) {
      for (const msg of (update as any)?.messages ?? []) {
        console.log("🤖: ", msg.toFormattedString());
      }
    }
  }

  return interrupts;
}
````

### Write the main function

Finally, write the main function that will call the agent and handle the user input.

Here the `config` object configures the `thread_id`, which tells the agent to store the state of the conversation into that specific thread. Like any typical agent loop, you:

1. Capture the user input
2. Stream the agent's response
3. Handle any authorization interrupts
4. Resume the agent after authorization
5. Handle any errors
6. Exit the loop if the user wants to quit

````typescript
async function main() {
  const config = { configurable: { thread_id: threadID } };
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.green("Welcome to the chatbot! Type 'exit' to quit."));
  while (true) {
    const input = await rl.question("> ");
    if (input.toLowerCase() === "exit") {
      break;
    }
    rl.pause();

    try {
      let agentInput: any = {
        messages: [{ role: "user", content: input }],
      };

      // Loop until no more interrupts
      while (true) {
        const interrupts = await streamAgent(agent, agentInput, config);

        if (interrupts.length === 0) {
          break; // No more interrupts, we're done
        }

        // Handle all interrupts
        const decisions: any[] = [];
        for (const interrupt of interrupts) {
          decisions.push(await handleInterrupt(interrupt, rl));
        }

        // Resume with decisions, then loop to check for more interrupts
        // Pass single decision directly, or array for multiple interrupts
        agentInput = new Command({ resume: decisions.length === 1 ? decisions[0] : decisions });
      }
    } catch (error) {
      console.error(error);
    }

    rl.resume();
  }
  console.log(chalk.red("👋 Bye..."));
  process.exit(0);
}

// Run the main function
main().catch((err) => console.error(err));
````

## Running the Agent

### Run the agent

```bash
bun run main.ts
```

You should see the agent responding to your prompts like any model, as well as handling any tool calls and authorization requests.

## Next Steps

- Clone the [repository](https://github.com/arcade-agents/ts-langchain-Firecrawl) and run it
- Add more toolkits to the `toolkits` array to expand capabilities
- Customize the `systemPrompt` to specialize the agent's behavior
- Explore the [Arcade documentation](https://docs.arcade.dev) for available toolkits

