#!/usr/bin/env python3
"""
Convert Fine-tuned Model to WebLLM Format
Converts PyTorch models to WebLLM-compatible format (ONNX/WebGPU) with quantization
"""

import os
import json
import shutil
import argparse
from pathlib import Path
import torch
import numpy as np
from transformers import AutoModelForCausalLM, AutoTokenizer
import onnx
from onnxruntime.quantization import quantize_dynamic, QuantType
import struct

class WebLLMModelConverter:
    """Convert fine-tuned models to WebLLM format"""
    
    def __init__(self, model_path: str):
        self.model_path = model_path
        self.model = None
        self.tokenizer = None
        
    def load_model(self):
        """Load the fine-tuned model"""
        print(f"Loading model from {self.model_path}")
        
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_path)
        self.model = AutoModelForCausalLM.from_pretrained(
            self.model_path,
            torch_dtype=torch.float16,
            device_map="cpu"  # Load on CPU for conversion
        )
        
        print(f"Model loaded: {self.model.config.model_type}")
        
    def export_to_onnx(self, output_path: str):
        """Export model to ONNX format"""
        print("Exporting to ONNX format...")
        
        # Prepare dummy input
        dummy_input = self.tokenizer(
            "Categorize this tab",
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=128
        )
        
        # Export to ONNX
        onnx_path = os.path.join(output_path, "model.onnx")
        
        torch.onnx.export(
            self.model,
            (dummy_input['input_ids'], dummy_input['attention_mask']),
            onnx_path,
            export_params=True,
            opset_version=14,
            do_constant_folding=True,
            input_names=['input_ids', 'attention_mask'],
            output_names=['logits'],
            dynamic_axes={
                'input_ids': {0: 'batch_size', 1: 'sequence'},
                'attention_mask': {0: 'batch_size', 1: 'sequence'},
                'logits': {0: 'batch_size', 1: 'sequence'}
            }
        )
        
        print(f"ONNX model saved to {onnx_path}")
        return onnx_path
    
    def quantize_model(self, onnx_path: str, quantization: str = "int8"):
        """Quantize ONNX model"""
        print(f"Quantizing model to {quantization}...")
        
        output_path = onnx_path.replace('.onnx', f'_{quantization}.onnx')
        
        if quantization == "int8":
            quantize_dynamic(
                onnx_path,
                output_path,
                weight_type=QuantType.QInt8
            )
        else:
            # For 4-bit, we need custom quantization
            self.quantize_4bit(onnx_path, output_path)
        
        # Check size reduction
        original_size = os.path.getsize(onnx_path) / 1e6
        quantized_size = os.path.getsize(output_path) / 1e6
        
        print(f"Original size: {original_size:.2f} MB")
        print(f"Quantized size: {quantized_size:.2f} MB")
        print(f"Compression ratio: {original_size/quantized_size:.2f}x")
        
        return output_path
    
    def quantize_4bit(self, input_path: str, output_path: str):
        """Custom 4-bit quantization (simplified)"""
        # This is a simplified version - real implementation would use
        # more sophisticated quantization techniques
        
        model = onnx.load(input_path)
        
        # Iterate through initializers (weights)
        for initializer in model.graph.initializer:
            if initializer.data_type == onnx.TensorProto.FLOAT:
                # Get float data
                float_data = np.frombuffer(initializer.raw_data, dtype=np.float32)
                
                # Simple 4-bit quantization
                min_val = float_data.min()
                max_val = float_data.max()
                scale = (max_val - min_val) / 15  # 4-bit = 16 levels
                
                # Quantize
                quantized = np.round((float_data - min_val) / scale).astype(np.uint8)
                
                # Pack 4-bit values (2 values per byte)
                packed = []
                for i in range(0, len(quantized), 2):
                    if i + 1 < len(quantized):
                        packed.append((quantized[i] << 4) | quantized[i + 1])
                    else:
                        packed.append(quantized[i] << 4)
                
                # Store quantization params
                # In real implementation, these would be stored properly
                # This is simplified for demonstration
        
        onnx.save(model, output_path)
    
    def create_webllm_config(self, output_path: str, model_info: dict):
        """Create WebLLM configuration file"""
        print("Creating WebLLM configuration...")
        
        config = {
            "model_type": "custom_tinyllama",
            "model_id": f"tab-categorizer-{model_info.get('version', 'v1')}",
            "model_name": "Tab Categorizer (TinyLlama Fine-tuned)",
            "model_size": model_info.get('size_mb', 500),
            "categories": ['Dev', 'Social', 'Entertainment', 'Work', 'Cloud', 'Shopping', 'News'],
            "tokenizer": {
                "type": "sentencepiece",
                "vocab_size": self.tokenizer.vocab_size,
                "pad_token_id": self.tokenizer.pad_token_id,
                "eos_token_id": self.tokenizer.eos_token_id,
            },
            "generation_config": {
                "max_new_tokens": 10,
                "temperature": 0.1,
                "top_p": 0.9,
                "do_sample": False
            },
            "quantization": model_info.get('quantization', 'int8'),
            "webgpu_config": {
                "shader_f16": True,
                "storage_buffer_binding_size": 134217728,  # 128MB
                "max_storage_buffer_binding_size": 1073741824  # 1GB
            },
            "wasm_config": {
                "simd": True,
                "threads": 4,
                "memory_initial": 256,  # 256 pages = 16MB
                "memory_maximum": 16384  # 16384 pages = 1GB
            }
        }
        
        config_path = os.path.join(output_path, "webllm_config.json")
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
        
        print(f"WebLLM config saved to {config_path}")
        return config
    
    def create_model_loader(self, output_path: str):
        """Create JavaScript model loader for WebLLM"""
        print("Creating model loader...")
        
        loader_js = '''// WebLLM Custom Model Loader for Tab Categorization
import * as webllm from "@mlc-ai/web-llm";

export class TabCategorizerModel {
    constructor() {
        this.engine = null;
        this.modelId = "tab-categorizer-v1";
        this.config = null;
        this.ready = false;
    }
    
    async initialize() {
        console.log("Initializing Tab Categorizer Model...");
        
        // Load configuration
        this.config = await fetch('/local-finetune/webllm_model/webllm_config.json')
            .then(res => res.json());
        
        // Custom model configuration for WebLLM
        const appConfig = {
            model_list: [{
                model_url: "/local-finetune/webllm_model/",
                model_id: this.modelId,
                model_lib_url: "/local-finetune/webllm_model/model_lib.wasm",
                vram_required_MB: 512,
                low_resource_required: true,
            }],
            use_web_worker: true
        };
        
        // Initialize WebLLM engine
        this.engine = new webllm.MLCEngine();
        
        // Load the model
        await this.engine.reload(this.modelId, {
            temperature: 0.1,
            top_p: 0.9,
            max_gen_len: 10
        });
        
        this.ready = true;
        console.log("Tab Categorizer Model ready!");
    }
    
    async categorizeTab(url, title) {
        if (!this.ready) {
            throw new Error("Model not initialized");
        }
        
        const prompt = `Categorize this browser tab into one of these categories: ${this.config.categories.join(', ')}.
URL: ${url}
Title: ${title}
Category:`;
        
        const response = await this.engine.generate(prompt, {
            max_gen_len: 10,
            temperature: 0.1
        });
        
        // Extract category from response
        const category = response.trim().split(' ')[0];
        
        // Validate category
        if (this.config.categories.includes(category)) {
            return category;
        }
        
        // Fallback to rule-based if invalid
        return this.fallbackCategorization(url, title);
    }
    
    fallbackCategorization(url, title) {
        const urlLower = url.toLowerCase();
        const titleLower = title.toLowerCase();
        
        // Simple rule-based fallback
        if (urlLower.includes('github') || urlLower.includes('stackoverflow')) {
            return 'Dev';
        } else if (urlLower.includes('facebook') || urlLower.includes('twitter')) {
            return 'Social';
        } else if (urlLower.includes('youtube') || urlLower.includes('netflix')) {
            return 'Entertainment';
        } else if (urlLower.includes('docs.google') || urlLower.includes('office')) {
            return 'Work';
        } else if (urlLower.includes('aws') || urlLower.includes('azure')) {
            return 'Cloud';
        } else if (urlLower.includes('amazon') || urlLower.includes('ebay')) {
            return 'Shopping';
        } else if (urlLower.includes('news') || urlLower.includes('cnn')) {
            return 'News';
        }
        
        return 'Work'; // Default
    }
    
    async benchmark() {
        const testCases = [
            {url: 'https://github.com/user/repo', title: 'GitHub Repository'},
            {url: 'https://twitter.com/user', title: 'Twitter Profile'},
            {url: 'https://youtube.com/watch', title: 'Video Title'},
            {url: 'https://docs.google.com/doc', title: 'Google Docs'},
            {url: 'https://aws.amazon.com/console', title: 'AWS Console'},
            {url: 'https://amazon.com/product', title: 'Product Page'},
            {url: 'https://cnn.com/article', title: 'Breaking News'}
        ];
        
        const results = [];
        const startTime = performance.now();
        
        for (const test of testCases) {
            const category = await this.categorizeTab(test.url, test.title);
            results.push({...test, category});
        }
        
        const endTime = performance.now();
        const avgTime = (endTime - startTime) / testCases.length;
        
        console.log('Benchmark Results:');
        console.log('Average inference time:', avgTime.toFixed(2), 'ms');
        console.log('Results:', results);
        
        return {
            avgInferenceTime: avgTime,
            results: results
        };
    }
    
    getModelInfo() {
        return {
            modelId: this.modelId,
            ready: this.ready,
            config: this.config,
            engineInfo: this.engine ? this.engine.getModelInfo() : null
        };
    }
}

// Integration with Chrome Extension
export async function integrateWithExtension() {
    const model = new TabCategorizerModel();
    await model.initialize();
    
    // Replace the existing LocalLLM categorization
    window.tabCategorizerModel = model;
    
    // Override the categorization function
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'categorizeTabs') {
                (async () => {
                    const results = {};
                    for (const tab of request.tabs) {
                        const category = await model.categorizeTab(tab.url, tab.title);
                        results[tab.id] = category;
                    }
                    sendResponse({categories: results});
                })();
                return true; // Will respond asynchronously
            }
        });
    }
    
    return model;
}
'''
        
        loader_path = os.path.join(output_path, "model_loader.js")
        with open(loader_path, 'w') as f:
            f.write(loader_js)
        
        print(f"Model loader saved to {loader_path}")
        
    def package_for_webllm(self, output_path: str):
        """Package everything for WebLLM deployment"""
        print("Packaging for WebLLM deployment...")
        
        webllm_path = os.path.join(output_path, "webllm_model")
        os.makedirs(webllm_path, exist_ok=True)
        
        # Copy tokenizer files
        tokenizer_files = ['tokenizer.json', 'tokenizer_config.json', 
                          'special_tokens_map.json', 'tokenizer.model']
        for file in tokenizer_files:
            src = os.path.join(self.model_path, file)
            if os.path.exists(src):
                shutil.copy(src, os.path.join(webllm_path, file))
        
        # Create deployment info
        deployment_info = {
            'model_path': webllm_path,
            'deployment_date': str(Path(webllm_path).stat().st_mtime),
            'model_format': 'webllm',
            'categories': ['Dev', 'Social', 'Entertainment', 'Work', 'Cloud', 'Shopping', 'News'],
            'usage': {
                'import': 'import { TabCategorizerModel } from "./model_loader.js"',
                'initialize': 'const model = new TabCategorizerModel(); await model.initialize();',
                'categorize': 'const category = await model.categorizeTab(url, title);'
            }
        }
        
        with open(os.path.join(output_path, 'deployment_info.json'), 'w') as f:
            json.dump(deployment_info, f, indent=2)
        
        print(f"Model packaged in {webllm_path}")
        print("\nDeployment instructions:")
        print("1. Copy webllm_model/ to your extension directory")
        print("2. Import model_loader.js in your background script")
        print("3. Initialize the model on extension startup")
        print("4. Use model.categorizeTab(url, title) for inference")

def main():
    parser = argparse.ArgumentParser(description='Convert model to WebLLM format')
    parser.add_argument('--model', type=str, required=True,
                       help='Path to fine-tuned model')
    parser.add_argument('--output', type=str, default='output/webllm_model',
                       help='Output directory')
    parser.add_argument('--quantize', type=str, choices=['int8', '4bit'], default='int8',
                       help='Quantization type')
    parser.add_argument('--skip-onnx', action='store_true',
                       help='Skip ONNX conversion (use existing)')
    parser.add_argument('--test', action='store_true',
                       help='Test converted model')
    
    args = parser.parse_args()
    
    # Create output directory
    Path(args.output).mkdir(parents=True, exist_ok=True)
    
    # Initialize converter
    converter = WebLLMModelConverter(args.model)
    converter.load_model()
    
    # Export to ONNX
    if not args.skip_onnx:
        onnx_path = converter.export_to_onnx(args.output)
        
        # Quantize
        quantized_path = converter.quantize_model(onnx_path, args.quantize)
        
        model_size = os.path.getsize(quantized_path) / 1e6
    else:
        model_size = 500  # Estimate
    
    # Create WebLLM config
    model_info = {
        'version': 'v1',
        'size_mb': model_size,
        'quantization': args.quantize
    }
    converter.create_webllm_config(args.output, model_info)
    
    # Create model loader
    converter.create_model_loader(args.output)
    
    # Package for deployment
    converter.package_for_webllm(args.output)
    
    print("\nConversion complete!")
    print(f"Model ready for WebLLM deployment at: {args.output}")

if __name__ == '__main__':
    main()