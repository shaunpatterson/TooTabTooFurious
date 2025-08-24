# Local Model Fine-Tuning Suite for Browser Tab Categorization

A comprehensive suite for fine-tuning small language models (TinyLlama, Phi-2) that run entirely in the browser via WebLLM. No API calls required - everything runs locally.

## Architecture Overview

- **Base Model**: TinyLlama-1.1B or Phi-2 (2.7B)
- **Fine-tuning**: LoRA/QLoRA for efficient training
- **Deployment**: WebLLM-compatible format (ONNX/WebGPU)
- **Size Target**: <500MB after 4-bit quantization
- **Inference**: 100% local in Chrome extension

## Components

1. **Dataset Generation** - Creates comprehensive training data for tab categorization
2. **Fine-tuning Pipeline** - LoRA-based fine-tuning with Hugging Face
3. **Model Conversion** - Converts to WebLLM format (ONNX/WebGPU)
4. **Quantization** - 4-bit/8-bit quantization for browser efficiency
5. **WebLLM Integration** - Custom model loader for the extension
6. **Evaluation Suite** - Benchmarks and metrics

## Quick Start

```bash
# Setup environment
cd local-finetune
pip install -r requirements.txt

# Generate training data
python dataset_generator.py --samples 10000

# Fine-tune model with LoRA
python finetune_lora.py --model TinyLlama/TinyLlama-1.1B-Chat-v1.0 --epochs 3

# Convert to WebLLM format
python convert_to_webllm.py --model output/final_model --quantize 4bit

# Evaluate performance
python evaluate.py --model output/webllm_model

# Deploy to extension
python deploy.py --model output/webllm_model
```

## Training Categories

- Dev (Development, Programming)
- Social (Social Media, Communication)
- Entertainment (Video, Music, Gaming)
- Work (Productivity, Business)
- Cloud (Cloud Services, SaaS)
- Shopping (E-commerce, Retail)
- News (News, Media, Articles)

## Performance Targets

- Model Size: <500MB (quantized)
- Accuracy: >90% on common sites
- Inference: <50ms per tab
- Memory: <1GB RAM usage
- First Load: <30 seconds

## Browser Compatibility

- Chrome 113+ (WebGPU support)
- Edge 113+ (WebGPU support)
- Fallback to WebAssembly for older browsers