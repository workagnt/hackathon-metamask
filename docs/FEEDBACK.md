# Hackathon Feedback — MetaMask Smart Accounts Kit x 1Shot API x Venice AI

## MetaMask Smart Accounts Kit / Delegation Toolkit

### What Worked Well
- `getDeleGatorEnvironment(8453)` cleanly returns all contract addresses for Base
- `createDelegation()` API is intuitive — scope types like `erc20TransferAmount` are self-documenting
- EIP-7702 integration with viem's `signAuthorization()` is straightforward
- The concept of caveated, time-limited delegations is powerful for agent economies

### Friction Points
- **Type exports**: `DeleGatorEnvironment` type was hard to find — had to dig through source. Consider re-exporting all key types from the main entry point
- **Implementation enum**: `Implementation.Hybrid` is the only option that works but the enum suggests alternatives exist. Docs should be clearer about which implementation to use for production
- **Redelegation**: Creating child delegations from parent delegations required reading the source code. The docs focus on single-level delegation but the real power is in delegation chains
- **Smart Account detection**: No built-in way to check if an address is already upgraded to a smart account. Had to infer from context

### Suggestions
- Add a `isDeleGator(address)` utility function
- Add redelegation examples to the docs
- TypeScript types should be more discoverable — a `types` export from the main package
- Consider a React hook package (`@metamask/delegation-toolkit/react`) with `useDelegation`, `useSmartAccount` built in

---

## 1Shot Permissionless Relayer

### What Worked Well
- No API key required — truly permissionless
- JSON-RPC interface is clean and familiar
- `relayer_send7710Transaction` handles both 7702 authorization bundling and 7710 delegation redemption
- USDC gas payment on Base means users never need ETH
- Fast confirmation times (< 5 seconds typically)

### Friction Points
- **Documentation**: The API docs are minimal. Had to experiment with different field names and formats
- **Error messages**: When a transaction fails, the error response is often just "relay failed" without specifics. More granular error codes would help debugging
- **Webhook setup**: No docs on webhook format or expected response. Had to reverse-engineer the callback payload structure
- **Status polling**: `relayer_getStatus` sometimes returns stale data. A webhook-first approach would be more reliable
- **Authorization format**: The exact format for EIP-7702 authorization fields (hex encoding, padding) required trial and error

### Suggestions
- Add OpenAPI/Swagger spec for the JSON-RPC endpoints
- Include example payloads for each method in the docs
- Add error code taxonomy (insufficient gas, invalid auth, nonce mismatch, etc.)
- Document webhook payload format and expected response
- Add a "getting started" guide with end-to-end example (sign → relay → poll → confirm)

---

## Venice AI

### What Worked Well
- API is OpenAI-compatible — drop-in replacement for existing code
- `venice_parameters` for web search and web scraping is powerful and unique
- Embeddings quality is good for semantic matching
- Image generation produces clean, usable results
- Model selection is extensive (250+ models)
- The privacy guarantee (TEE + E2E) is a genuine differentiator

### Friction Points
- **x402 mode**: While Venice supports x402 payments, the documentation on how to actually configure x402 for an agent (vs using API keys) is sparse
- **Crypto RPC**: The endpoint exists but documentation on supported methods per chain varies. Some chains support more methods than others without clear indication
- **Audio TTS**: The `tts-kokoro` model works but voice options aren't well documented
- **Rate limiting**: Hit undocumented rate limits during batch embedding requests. Would help to know the limits upfront
- **Web search**: `enable_web_search: "auto"` sometimes doesn't trigger when expected. A way to force-enable would be useful

### Suggestions
- Add x402 integration guide specifically for agent/bot use cases
- Document Crypto RPC supported methods per chain
- List available TTS voices and their characteristics
- Publish rate limit headers (X-RateLimit-Remaining, etc.)
- Add `enable_web_search: "always"` option alongside "auto"

---

## HackQuest Platform

### What Worked Well
- Clear track definitions with specific judging criteria
- Good prize distribution across tracks (encourages breadth)

### Suggestions
- Submission form could support video embeds directly (not just links)
- A live demo session with judges would help showcase interactive features vs. static screenshots
- Feedback on submissions (even brief) would be valuable for future hackathons
