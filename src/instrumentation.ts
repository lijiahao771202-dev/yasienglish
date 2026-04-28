/**
 * Next.js Instrumentation — runs once on server startup.
 * Sets up a global HTTP proxy dispatcher so that all server-side `fetch`
 * calls (including the OpenAI SDK) route through the local Clash proxy
 * when HTTPS_PROXY is configured.
 */
export async function register() {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
    if (proxyUrl) {
        try {
            const { ProxyAgent, setGlobalDispatcher } = await import("undici");
            setGlobalDispatcher(new ProxyAgent(proxyUrl));
            console.log(`[instrumentation] Global proxy set → ${proxyUrl}`);
        } catch (error) {
            console.warn("[instrumentation] Failed to set up proxy:", error);
        }
    }
}
