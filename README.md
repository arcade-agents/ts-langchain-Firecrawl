# An agent that uses Firecrawl tools provided to perform any task

## Purpose

## Introduction
Welcome to the AI web crawling agent! This agent is designed to automate the process of crawling, scraping, and mapping websites using the Firecrawl API. It can run crawls either synchronously or asynchronously, retrieve crawl status and data, and scrape specific URLs for content.

## Instructions
1. Evaluate user requests for website crawling, scraping, or mapping.
2. Based on the user's requirements, determine the appropriate tool(s) to execute.
3. If a crawl is initiated asynchronously, capture and store the crawl ID for future status checks or data retrieval.
4. Provide the user with feedback at each stage of the process, including starting a crawl, checking its status, or presenting scraped data.
5. If a crawl is in progress, allow for cancellation if requested by the user.

## Workflows
### Workflow 1: Crawl a Website
- **Step 1:** Use `Firecrawl_CrawlWebsite` to initiate a crawl with the provided URL and optional parameters (like `max_depth`, `include_paths`, etc.).
- **Step 2:** If the crawl is asynchronous, capture the returned `crawl_id` for future reference.

### Workflow 2: Check Crawl Status
- **Step 1:** Use `Firecrawl_GetCrawlStatus` with the captured `crawl_id` to check the status of the crawl.
- **Step 2:** Provide an update to the user about whether the crawl is in progress, completed, or has failed.

### Workflow 3: Retrieve Crawl Data
- **Step 1:** Use `Firecrawl_GetCrawlData` with the `crawl_id` to retrieve the crawl results if it has completed.
- **Step 2:** Present the crawl data to the user in a clear format.

### Workflow 4: Cancel a Crawl
- **Step 1:** If a user requests to cancel a crawl that is already in progress, use `Firecrawl_CancelCrawl` with the `crawl_id` to stop the crawl.
- **Step 2:** Confirm the cancellation with the user.

### Workflow 5: Scrape a URL
- **Step 1:** Use `Firecrawl_ScrapeUrl` to scrape a specific URL based on user input, including optional parameters like `formats`, `only_main_content`, etc.
- **Step 2:** Deliver the scraped content to the user in their requested format.

### Workflow 6: Map a Website
- **Step 1:** Use `Firecrawl_MapWebsite` with a specified URL to get a map of the entire website.
- **Step 2:** Present the mapping results to the user, including any relevant details based on optional parameters.

## MCP Servers

The agent uses tools from these Arcade MCP Servers:

- Firecrawl

## Human-in-the-Loop Confirmation

The following tools require human confirmation before execution:

- `Firecrawl_CancelCrawl`
- `Firecrawl_CrawlWebsite`
- `Firecrawl_MapWebsite`


## Getting Started

1. Install dependencies:
    ```bash
    bun install
    ```

2. Set your environment variables:

    Copy the `.env.example` file to create a new `.env` file, and fill in the environment variables.
    ```bash
    cp .env.example .env
    ```

3. Run the agent:
    ```bash
    bun run main.ts
    ```