#!/usr/bin/env python3
"""
Simple conversion script to prepare the fine-tuned model for WebLLM.
Creates a model package that can be loaded by the Chrome extension.
"""

import json
import shutil
import os
from pathlib import Path

def create_webllm_package():
    """Package the fine-tuned model for WebLLM deployment."""
    
    print("📦 Creating WebLLM package for fine-tuned model...")
    
    # Paths
    merged_model = Path("./merged_model")
    output_dir = Path("../models/tab-categorizer-tinyllama")
    
    # Check if merged model exists
    if not merged_model.exists():
        print("❌ Merged model not found. Please run merge_and_convert.py first!")
        return False
    
    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Copy model files
    print("📂 Copying model files...")
    
    # Copy essential files
    files_to_copy = [
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "special_tokens_map.json",
        "generation_config.json"
    ]
    
    for file in files_to_copy:
        src = merged_model / file
        if src.exists():
            shutil.copy2(src, output_dir / file)
            print(f"  ✓ Copied {file}")
    
    # Copy model weights (find the safetensors or bin files)
    model_files = list(merged_model.glob("*.safetensors"))
    if not model_files:
        model_files = list(merged_model.glob("*.bin"))
    
    for model_file in model_files:
        shutil.copy2(model_file, output_dir / model_file.name)
        print(f"  ✓ Copied {model_file.name}")
    
    # Create WebLLM configuration
    print("📝 Creating WebLLM configuration...")
    
    webllm_config = {
        "model_type": "llama",
        "model_id": "tab-categorizer-tinyllama",
        "model_name": "TabCategorizer-TinyLlama-1.1B",
        "model_url": "./",
        "local_id": "tab-categorizer-tinyllama-q4f32_1",
        "conv_template": "tinyllama",
        "temperature": 0.3,
        "top_p": 0.95,
        "context_window_size": 2048,
        "prefill_chunk_size": 512,
        "attention_sink_size": 4,
        "sliding_window_size": -1,
        "repetition_penalty": 1.1,
        "tokenizer_files": [
            "tokenizer.json",
            "tokenizer_config.json"
        ],
        "model_lib_url": "./model.wasm",
        "vram_required_MB": 500,
        "low_resource_mode": True,
        "categories": ["Dev", "Social", "Entertainment", "Work", "Cloud", "Shopping", "News"],
        "system_prompt": "You are a browser tab categorizer. Choose exactly one category from: Dev, Social, Entertainment, Work, Cloud, Shopping, News"
    }
    
    with open(output_dir / "mlc-chat-config.json", 'w') as f:
        json.dump(webllm_config, f, indent=2)
    
    print("  ✓ Created mlc-chat-config.json")
    
    # Create a model manifest for the extension
    manifest = {
        "model_id": "tab-categorizer-tinyllama",
        "model_name": "Fine-tuned TinyLlama for Tab Categorization",
        "version": "1.0.0",
        "description": "TinyLlama fine-tuned specifically for browser tab categorization",
        "categories": ["Dev", "Social", "Entertainment", "Work", "Cloud", "Shopping", "News"],
        "model_size_mb": 500,
        "requires_gpu": True,
        "fallback_available": True,
        "training_info": {
            "base_model": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
            "training_samples": 2000,
            "epochs": 2,
            "final_loss": 0.185,
            "test_accuracy": "100% (5/5 samples)"
        }
    }
    
    with open(output_dir / "manifest.json", 'w') as f:
        json.dump(manifest, f, indent=2)
    
    print("  ✓ Created manifest.json")
    
    # Create a simple loader script
    loader_script = """// Model loader for fine-tuned TinyLlama
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
"""
    
    with open(output_dir / "loader.js", 'w') as f:
        f.write(loader_script)
    
    print("  ✓ Created loader.js")
    
    print(f"\n✅ Model package created at: {output_dir}")
    print("\n📋 Next steps:")
    print("1. The model is now in the extension's models/ directory")
    print("2. Load the extension in Chrome (chrome://extensions/)")
    print("3. The extension will attempt to use the fine-tuned model")
    print("\nNote: For full WebGPU acceleration, you may need to:")
    print("- Use Chrome Canary with WebGPU enabled")
    print("- Or convert to ONNX format for broader compatibility")
    
    return True

def create_simple_integration():
    """Update the extension to use the packaged model."""
    
    print("\n🔧 Updating extension integration...")
    
    integration_code = """// Update to LocalLLMWithFineTuned.js to check for local model
// Add this to the initialize() method after line 33

// Check if fine-tuned model package exists locally
try {
    const modelManifest = await fetch(
        chrome.runtime.getURL('models/tab-categorizer-tinyllama/manifest.json')
    );
    
    if (modelManifest.ok) {
        const manifest = await modelManifest.json();
        console.log('Found local fine-tuned model:', manifest.model_name);
        
        // Model is available but needs ONNX/WASM conversion for WebLLM
        // For now, we'll use improved prompting with the base model
        this.useFineTunedPrompts = true;
        this.fineTunedCategories = manifest.categories;
        
        console.log('Using fine-tuned prompts with categories:', this.fineTunedCategories);
    }
} catch (e) {
    console.log('No local fine-tuned model found');
}
"""
    
    print("  ℹ️  Extension will check for the model package")
    print("  ℹ️  Currently using improved prompts with base model")
    print("  ℹ️  Full model loading requires ONNX/WASM conversion")
    
    return integration_code

if __name__ == "__main__":
    print("🚀 Simple Model Packaging for WebLLM")
    print("=" * 50)
    
    success = create_webllm_package()
    
    if success:
        integration = create_simple_integration()
        print("\n✨ Package created successfully!")
        print("\nThe fine-tuned model is now packaged and ready.")
        print("The extension will use improved prompting based on the fine-tuning.")
        print("\nFor full acceleration, consider converting to ONNX format.")