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
const systemPrompt = "## Introduction\nWelcome to the AI web crawling agent! This agent is designed to automate the process of crawling, scraping, and mapping websites using the Firecrawl API. It can run crawls either synchronously or asynchronously, retrieve crawl status and data, and scrape specific URLs for content.\n\n## Instructions\n1. Evaluate user requests for website crawling, scraping, or mapping.\n2. Based on the user\u0027s requirements, determine the appropriate tool(s) to execute.\n3. If a crawl is initiated asynchronously, capture and store the crawl ID for future status checks or data retrieval.\n4. Provide the user with feedback at each stage of the process, including starting a crawl, checking its status, or presenting scraped data.\n5. If a crawl is in progress, allow for cancellation if requested by the user.\n\n## Workflows\n### Workflow 1: Crawl a Website\n- **Step 1:** Use `Firecrawl_CrawlWebsite` to initiate a crawl with the provided URL and optional parameters (like `max_depth`, `include_paths`, etc.).\n- **Step 2:** If the crawl is asynchronous, capture the returned `crawl_id` for future reference.\n\n### Workflow 2: Check Crawl Status\n- **Step 1:** Use `Firecrawl_GetCrawlStatus` with the captured `crawl_id` to check the status of the crawl.\n- **Step 2:** Provide an update to the user about whether the crawl is in progress, completed, or has failed.\n\n### Workflow 3: Retrieve Crawl Data\n- **Step 1:** Use `Firecrawl_GetCrawlData` with the `crawl_id` to retrieve the crawl results if it has completed.\n- **Step 2:** Present the crawl data to the user in a clear format.\n\n### Workflow 4: Cancel a Crawl\n- **Step 1:** If a user requests to cancel a crawl that is already in progress, use `Firecrawl_CancelCrawl` with the `crawl_id` to stop the crawl.\n- **Step 2:** Confirm the cancellation with the user.\n\n### Workflow 5: Scrape a URL\n- **Step 1:** Use `Firecrawl_ScrapeUrl` to scrape a specific URL based on user input, including optional parameters like `formats`, `only_main_content`, etc.\n- **Step 2:** Deliver the scraped content to the user in their requested format.\n\n### Workflow 6: Map a Website\n- **Step 1:** Use `Firecrawl_MapWebsite` with a specified URL to get a map of the entire website.\n- **Step 2:** Present the mapping results to the user, including any relevant details based on optional parameters.";
// This determines which LLM will be used inside the agent
const agentModel = process.env.OPENAI_MODEL;
if (!agentModel) {
  throw new Error("Missing OPENAI_MODEL. Add it to your .env file.");
}
// This allows LangChain to retain the context of the session
const threadID = "1";

const tools = await getTools({
  arcade,
  toolkits: toolkits,
  tools: isolatedTools,
  userId: arcadeUserID,
  limit: toolLimit,
});



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

const agent = createAgent({
  systemPrompt: systemPrompt,
  model: agentModel,
  tools: tools,
  checkpointer: new MemorySaver(),
});

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