// Model loader for fine-tuned TinyLlama
export const MODEL_CONFIG = {
    modelId: "tab-categorizer-tinyllama",
    modelUrl: chrome.runtime.getURL("models/tab-categorizer-tinyllama/"),
    tokenizerUrl: chrome.runtime.getURL("models/tab-categorizer-tinyllama/tokenizer.json"),
    configUrl: chrome.runtime.getURL("models/tab-categorizer-tinyllama/mlc-chat-config.json"),
    categories: ["Dev", "Social", "Entertainment", "Work", "Cloud", "Shopping", "News"]
};

export async function loadFineTunedModel(webllm) {
    console.log("Loading fine-tuned tab categorizer model...");
    
    try {
        // Check if model files exist
        const response = await fetch(MODEL_CONFIG.configUrl);
        if (!response.ok) {
            throw new Error("Model config not found");
        }
        
        const config = await response.json();
        console.log("Model config loaded:", config.model_name);
        
        // Return configuration for WebLLM
        return {
            ...config,
            modelUrl: MODEL_CONFIG.modelUrl,
            localId: MODEL_CONFIG.modelId
        };
    } catch (error) {
        console.error("Failed to load fine-tuned model:", error);
        return null;
    }
}
