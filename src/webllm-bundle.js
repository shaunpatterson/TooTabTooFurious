// Bundle WebLLM for use in Chrome extension
import * as webllm from '@mlc-ai/web-llm';

// Export everything
export default webllm;
export const CreateMLCEngine = webllm.CreateMLCEngine;
export const CreateWebWorkerMLCEngine = webllm.CreateWebWorkerMLCEngine;
export const hasModelInCache = webllm.hasModelInCache;
export const deleteModelAllInfoInCache = webllm.deleteModelAllInfoInCache;
