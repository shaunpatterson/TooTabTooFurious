#!/usr/bin/env python3
"""
Merge LoRA weights and convert model for WebLLM deployment.
This creates a model that can run directly in the browser.
"""

import json
import os
import shutil
from pathlib import Path

try:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel
except ImportError as e:
    print(f"❌ Missing dependency: {e}")
    print("Please run: pip install transformers peft torch")
    exit(1)

def merge_lora_weights():
    """Merge LoRA adapter with base model."""
    print("🔄 Merging LoRA weights with base model...")
    
    base_model_name = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
    adapter_path = "./finetuned_model"
    output_path = "./merged_model"
    
    # Load base model
    print(f"Loading base model: {base_model_name}")
    base_model = AutoModelForCausalLM.from_pretrained(
        base_model_name,
        torch_dtype=torch.float16,
        device_map="auto",
        trust_remote_code=True
    )
    
    # Load LoRA adapter
    print(f"Loading LoRA adapter from: {adapter_path}")
    model = PeftModel.from_pretrained(base_model, adapter_path)
    
    # Merge weights
    print("Merging weights...")
    model = model.merge_and_unload()
    
    # Save merged model
    print(f"Saving merged model to: {output_path}")
    model.save_pretrained(output_path)
    
    # Copy tokenizer
    tokenizer = AutoTokenizer.from_pretrained(adapter_path)
    tokenizer.save_pretrained(output_path)
    
    print("✅ Model merged successfully!")
    return output_path

def create_webllm_config(model_path):
    """Create WebLLM configuration for the model."""
    print("\n📝 Creating WebLLM configuration...")
    
    config = {
        "model_type": "llama",
        "model_id": "tab-categorizer-tinyllama",
        "model_name": "TabCategorizer-TinyLlama-1.1B",
        "model_size": "1.1B",
        "quantization": "q4f16_1",  # 4-bit quantization
        "context_window": 2048,
        "conv_template": "tinyllama",
        "temperature": 0.3,
        "top_p": 0.95,
        "repetition_penalty": 1.1,
        "categories": ["Dev", "Social", "Entertainment", "Work", "Cloud", "Shopping", "News"],
        "system_prompt": "You are a browser tab categorizer. Choose exactly one category from: Dev, Social, Entertainment, Work, Cloud, Shopping, News",
        "model_url": "./models/tab-categorizer-tinyllama-q4f16_1.wasm",  # Local path in extension
        "wasm_cache_url": "./models/tab-categorizer-cache/",
        "vram_required_MB": 500,
        "low_resource_mode": True,
        "use_web_worker": True
    }
    
    config_path = Path(model_path) / "webllm_config.json"
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    
    print(f"✅ WebLLM config saved to: {config_path}")
    return config

def create_conversion_script(model_path):
    """Create script for MLC-LLM conversion (to be run separately)."""
    print("\n📜 Creating conversion script...")
    
    script_content = f"""#!/bin/bash
# Convert model to WebLLM format using MLC-LLM
# This needs to be run with MLC-LLM installed

MODEL_PATH="{model_path}"
OUTPUT_PATH="./webllm_model"

echo "Converting model to WebLLM format..."
echo "Note: This requires MLC-LLM. Install with:"
echo "pip install mlc-llm mlc-ai-nightly"

# Convert to MLC format
python -m mlc_llm convert \\
    --model $MODEL_PATH \\
    --quantization q4f16_1 \\
    --target webgpu \\
    --output $OUTPUT_PATH \\
    --context-window 2048

echo "Model converted to: $OUTPUT_PATH"
echo "Copy the output to your Chrome extension's models/ directory"
"""
    
    script_path = Path("convert_to_mlc.sh")
    with open(script_path, 'w') as f:
        f.write(script_content)
    os.chmod(script_path, 0o755)
    
    print(f"✅ Conversion script saved to: {script_path}")
    print("   Run it with: ./convert_to_mlc.sh")

def create_integration_module():
    """Create the JavaScript module for Chrome extension integration."""
    print("\n🔧 Creating integration module...")
    
    js_content = """// Custom TinyLlama Tab Categorizer for WebLLM
// This module loads and uses the fine-tuned model

import * as webllm from "https://esm.run/@mlc-ai/web-llm";

export class CustomTabCategorizer {
    constructor() {
        this.engine = null;
        this.modelId = "tab-categorizer-tinyllama";
        this.initialized = false;
        this.categories = ["Dev", "Social", "Entertainment", "Work", "Cloud", "Shopping", "News"];
    }

    async initialize() {
        if (this.initialized) return;
        
        console.log("🚀 Loading custom tab categorizer model...");
        
        try {
            // Custom model configuration
            const appConfig = {
                model_list: [{
                    model_id: this.modelId,
                    model_url: chrome.runtime.getURL("models/tab-categorizer-tinyllama/"),
                    model_lib_url: chrome.runtime.getURL("models/tab-categorizer-tinyllama/model.wasm"),
                    vram_required_MB: 500,
                    low_resource_mode: true
                }]
            };
            
            // Initialize engine with custom model
            this.engine = new webllm.MLCEngine();
            await this.engine.reload(this.modelId, {
                appConfig: appConfig,
                temperature: 0.3,
                top_p: 0.95
            });
            
            this.initialized = true;
            console.log("✅ Custom model loaded successfully!");
        } catch (error) {
            console.error("❌ Failed to load custom model:", error);
            throw error;
        }
    }

    async categorizeTab(url, title, metadata = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        const prompt = `<|system|>
You are a browser tab categorizer. Choose exactly one category from: ${this.categories.join(', ')}
<|user|>
Categorize this browser tab:
URL: ${url}
Title: ${title}
Categories: ${this.categories.join(', ')}
<|assistant|>`;

        try {
            const response = await this.engine.generate(prompt, {
                max_new_tokens: 10,
                temperature: 0.3
            });
            
            // Extract category from response
            const category = response.trim().split('\\n')[0].split(' ')[0];
            
            // Validate category
            if (this.categories.includes(category)) {
                return category;
            } else {
                console.warn(`Invalid category: ${category}, using fallback`);
                return this.fallbackCategorize(url, title);
            }
        } catch (error) {
            console.error("Categorization error:", error);
            return this.fallbackCategorize(url, title);
        }
    }

    fallbackCategorize(url, title) {
        // Simple rule-based fallback
        const urlLower = url.toLowerCase();
        const titleLower = title.toLowerCase();
        
        if (urlLower.includes('github') || urlLower.includes('stackoverflow')) return 'Dev';
        if (urlLower.includes('facebook') || urlLower.includes('twitter')) return 'Social';
        if (urlLower.includes('youtube') || urlLower.includes('netflix')) return 'Entertainment';
        if (urlLower.includes('docs') || urlLower.includes('drive')) return 'Work';
        if (urlLower.includes('aws') || urlLower.includes('azure')) return 'Cloud';
        if (urlLower.includes('amazon') || urlLower.includes('ebay')) return 'Shopping';
        if (urlLower.includes('news') || urlLower.includes('cnn')) return 'News';
        
        return 'Work'; // Default
    }

    async unload() {
        if (this.engine) {
            await this.engine.unload();
            this.initialized = false;
        }
    }
}

// Export for use in Chrome extension
export default CustomTabCategorizer;
"""
    
    js_path = Path("../modules/CustomTabCategorizer.js")
    js_path.parent.mkdir(exist_ok=True)
    
    with open(js_path, 'w') as f:
        f.write(js_content)
    
    print(f"✅ Integration module saved to: {js_path}")

def main():
    print("🎯 TinyLlama Model Preparation for WebLLM")
    print("=" * 50)
    
    # Step 1: Merge LoRA weights
    if not Path("./finetuned_model").exists():
        print("❌ Fine-tuned model not found. Please run simple_finetune.py first!")
        return
    
    merged_path = merge_lora_weights()
    
    # Step 2: Create WebLLM configuration
    config = create_webllm_config(merged_path)
    
    # Step 3: Create conversion script
    create_conversion_script(merged_path)
    
    # Step 4: Create integration module
    create_integration_module()
    
    print("\n" + "=" * 50)
    print("✅ Model preparation complete!")
    print("\n📋 Next steps:")
    print("1. Install MLC-LLM: pip install mlc-llm mlc-ai-nightly")
    print("2. Run conversion: ./convert_to_mlc.sh")
    print("3. Copy converted model to extension's models/ directory")
    print("4. Update LocalLLM.js to use CustomTabCategorizer")
    print("\nThe model is ready for browser deployment! 🚀")

if __name__ == "__main__":
    main()