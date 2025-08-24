/**
 * WebLLM Integration for Custom Fine-tuned Model
 * Integrates the fine-tuned TinyLlama model with the Chrome extension
 */

import * as webllm from "@mlc-ai/web-llm";

export class CustomTabCategorizerLLM {
    constructor() {
        this.engine = null;
        this.modelId = "TinyLlama-1.1B-Tab-Categorizer-q4f16_1";
        this.ready = false;
        this.config = null;
        this.initPromise = null;
    }

    /**
     * Initialize the custom model with WebLLM
     */
    async initialize() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._doInitialize();
        return this.initPromise;
    }

    async _doInitialize() {
        console.log("🚀 Initializing custom tab categorizer model...");

        try {
            // Custom model configuration
            const appConfig = {
                model_list: [
                    {
                        model_url: "https://huggingface.co/mlc-ai/TinyLlama-1.1B-Tab-Categorizer-q4f16_1-MLC/resolve/main/",
                        model_id: this.modelId,
                        model_lib_url: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/TinyLlama-1.1B-Tab-Categorizer/TinyLlama-1.1B-Tab-Categorizer-q4f16_1-ctx1k_cs1k-webgpu.wasm",
                        vram_required_MB: 512,
                        low_resource_required: true,
                        required_features: ["shader-f16"],
                        context_window_size: 1024,
                    },
                ],
            };

            // Initialize engine
            this.engine = new webllm.CreateMLCEngine(
                this.modelId,
                {
                    appConfig,
                    initProgressCallback: (progress) => {
                        console.log(`Model loading: ${progress.text} (${progress.progress}%)`);
                    },
                    logLevel: "INFO",
                }
            );

            // Wait for initialization
            await this.engine.reload(this.modelId);

            // Load configuration
            this.config = {
                categories: ['Dev', 'Social', 'Entertainment', 'Work', 'Cloud', 'Shopping', 'News'],
                maxTokens: 10,
                temperature: 0.1,
                topP: 0.9,
            };

            this.ready = true;
            console.log("✅ Custom model ready!");

            return true;
        } catch (error) {
            console.error("Failed to initialize custom model:", error);
            throw error;
        }
    }

    /**
     * Format prompt for the fine-tuned model
     */
    formatPrompt(url, title) {
        return `<|system|>
You are a browser tab categorizer. Categorize tabs into: ${this.config.categories.join(', ')}</s>
<|user|>
Categorize this browser tab into one of these categories: ${this.config.categories.join(', ')}.
URL: ${url}
Title: ${title}</s>
<|assistant|>`;
    }

    /**
     * Categorize tabs using the custom model
     */
    async categorizeTabs(tabs, maxGroups = 5) {
        if (!this.ready) {
            await this.initialize();
        }

        const categorized = {};
        const startTime = performance.now();

        for (const tab of tabs) {
            try {
                const prompt = this.formatPrompt(tab.url, tab.title);
                
                const completion = await this.engine.chat.completions.create({
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: this.config.maxTokens,
                    temperature: this.config.temperature,
                    top_p: this.config.topP,
                });

                const response = completion.choices[0].message.content.trim();
                const category = this.parseCategory(response);

                if (!categorized[category]) {
                    categorized[category] = [];
                }
                categorized[category].push(tab);

            } catch (error) {
                console.error(`Error categorizing tab ${tab.id}:`, error);
                // Fallback to Work category
                if (!categorized.Work) {
                    categorized.Work = [];
                }
                categorized.Work.push(tab);
            }
        }

        const endTime = performance.now();
        const totalTime = endTime - startTime;
        const avgTime = totalTime / tabs.length;

        console.log(`✨ Categorized ${tabs.length} tabs in ${totalTime.toFixed(2)}ms (avg: ${avgTime.toFixed(2)}ms/tab)`);

        // Consolidate groups if exceeding maxGroups
        return this.consolidateGroups(categorized, maxGroups);
    }

    /**
     * Parse category from model response
     */
    parseCategory(response) {
        // Extract first word as category
        const category = response.split(/[\s,.:;]/)[0];
        
        // Validate category
        if (this.config.categories.includes(category)) {
            return category;
        }

        // Try case-insensitive match
        const lowerResponse = response.toLowerCase();
        for (const cat of this.config.categories) {
            if (lowerResponse.includes(cat.toLowerCase())) {
                return cat;
            }
        }

        // Default fallback
        return 'Work';
    }

    /**
     * Consolidate groups to respect maxGroups limit
     */
    consolidateGroups(categorized, maxGroups) {
        const groups = Object.entries(categorized);
        
        if (groups.length <= maxGroups) {
            return categorized;
        }

        // Sort by number of tabs
        groups.sort((a, b) => b[1].length - a[1].length);

        // Keep top groups, merge rest into "Other"
        const consolidated = {};
        const otherTabs = [];

        groups.forEach(([category, tabs], index) => {
            if (index < maxGroups - 1) {
                consolidated[category] = tabs;
            } else {
                otherTabs.push(...tabs);
            }
        });

        if (otherTabs.length > 0) {
            consolidated.Other = otherTabs;
        }

        return consolidated;
    }

    /**
     * Get model statistics
     */
    async getStats() {
        if (!this.engine) {
            return null;
        }

        const runtimeStats = await this.engine.runtimeStatsText();
        
        return {
            modelId: this.modelId,
            ready: this.ready,
            categories: this.config?.categories || [],
            runtimeStats: runtimeStats,
            memoryUsage: this.getMemoryUsage(),
        };
    }

    /**
     * Get memory usage estimate
     */
    getMemoryUsage() {
        if (!performance.memory) {
            return null;
        }

        return {
            usedJSHeapSize: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
            totalJSHeapSize: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
            jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB',
        };
    }

    /**
     * Benchmark the model
     */
    async benchmark() {
        if (!this.ready) {
            await this.initialize();
        }

        const testCases = [
            {url: 'https://github.com/user/repo', title: 'GitHub - user/repo: Description', expected: 'Dev'},
            {url: 'https://twitter.com/user', title: 'User (@user) / Twitter', expected: 'Social'},
            {url: 'https://www.youtube.com/watch?v=123', title: 'Video Title - YouTube', expected: 'Entertainment'},
            {url: 'https://docs.google.com/document', title: 'Document - Google Docs', expected: 'Work'},
            {url: 'https://console.aws.amazon.com', title: 'AWS Management Console', expected: 'Cloud'},
            {url: 'https://www.amazon.com/product', title: 'Product Name - Amazon.com', expected: 'Shopping'},
            {url: 'https://www.cnn.com/article', title: 'Breaking News - CNN', expected: 'News'},
        ];

        const results = [];
        let correct = 0;

        for (const test of testCases) {
            const startTime = performance.now();
            
            const prompt = this.formatPrompt(test.url, test.title);
            const completion = await this.engine.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                max_tokens: this.config.maxTokens,
                temperature: 0,
            });

            const endTime = performance.now();
            const inferenceTime = endTime - startTime;

            const predicted = this.parseCategory(completion.choices[0].message.content);
            const isCorrect = predicted === test.expected;
            
            if (isCorrect) correct++;

            results.push({
                ...test,
                predicted,
                correct: isCorrect,
                inferenceTime: inferenceTime.toFixed(2) + 'ms',
            });
        }

        const accuracy = (correct / testCases.length * 100).toFixed(1);
        
        console.log('Benchmark Results:');
        console.log(`Accuracy: ${accuracy}% (${correct}/${testCases.length})`);
        console.table(results);

        return {
            accuracy,
            results,
            avgInferenceTime: (results.reduce((sum, r) => sum + parseFloat(r.inferenceTime), 0) / results.length).toFixed(2) + 'ms',
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        if (this.engine) {
            await this.engine.unload();
            this.engine = null;
            this.ready = false;
        }
    }
}

/**
 * Factory function to create and initialize the custom model
 */
export async function createCustomTabCategorizer() {
    const categorizer = new CustomTabCategorizerLLM();
    await categorizer.initialize();
    return categorizer;
}

/**
 * Integration with existing Chrome extension
 */
export function integrateWithExtension(localLLM) {
    // Replace or augment existing LocalLLM with custom model
    
    const originalCategorizeTabs = localLLM.categorizeTabs.bind(localLLM);
    
    let customModel = null;
    
    // Override categorizeTabs method
    localLLM.categorizeTabs = async function(tabs, maxGroups) {
        try {
            // Try custom model first
            if (!customModel) {
                customModel = new CustomTabCategorizerLLM();
                await customModel.initialize();
            }
            
            return await customModel.categorizeTabs(tabs, maxGroups);
        } catch (error) {
            console.warn("Custom model failed, falling back to original:", error);
            // Fallback to original implementation
            return originalCategorizeTabs(tabs, maxGroups);
        }
    };
    
    // Add method to switch between models
    localLLM.useCustomModel = async function(enable = true) {
        if (enable && !customModel) {
            customModel = new CustomTabCategorizerLLM();
            await customModel.initialize();
        } else if (!enable && customModel) {
            await customModel.cleanup();
            customModel = null;
        }
    };
    
    // Add benchmark method
    localLLM.benchmarkCustomModel = async function() {
        if (!customModel) {
            customModel = new CustomTabCategorizerLLM();
            await customModel.initialize();
        }
        return await customModel.benchmark();
    };
    
    console.log("✅ Custom model integration complete");
}

// Auto-initialize if in Chrome extension context
if (typeof chrome !== 'undefined' && chrome.runtime) {
    // Listen for messages from popup or background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'useCustomModel') {
            (async () => {
                try {
                    const model = new CustomTabCategorizerLLM();
                    await model.initialize();
                    sendResponse({ success: true, stats: await model.getStats() });
                } catch (error) {
                    sendResponse({ success: false, error: error.message });
                }
            })();
            return true; // Will respond asynchronously
        }
        
        if (request.action === 'benchmarkCustomModel') {
            (async () => {
                try {
                    const model = new CustomTabCategorizerLLM();
                    await model.initialize();
                    const results = await model.benchmark();
                    sendResponse({ success: true, results });
                } catch (error) {
                    sendResponse({ success: false, error: error.message });
                }
            })();
            return true; // Will respond asynchronously
        }
    });
}